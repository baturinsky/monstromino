(function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function validate_store(store, name) {
        if (!store || typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(component, store, callback) {
        const unsub = store.subscribe(callback);
        component.$$.on_destroy.push(unsub.unsubscribe
            ? () => unsub.unsubscribe()
            : unsub);
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = cb => requestAnimationFrame(cb);

    const tasks = new Set();
    let running = false;
    function run_tasks() {
        tasks.forEach(task => {
            if (!task[0](now())) {
                tasks.delete(task);
                task[1]();
            }
        });
        running = tasks.size > 0;
        if (running)
            raf(run_tasks);
    }
    function loop(fn) {
        let task;
        if (!running) {
            running = true;
            raf(run_tasks);
        }
        return {
            promise: new Promise(fulfil => {
                tasks.add(task = [fn, fulfil]);
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function detach_between(before, after) {
        while (before.nextSibling && before.nextSibling !== after) {
            before.parentNode.removeChild(before.nextSibling);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_style(node, key, value) {
        node.style.setProperty(key, value);
    }
    function select_option(select, value) {
        for (let i = 0; i < select.options.length; i += 1) {
            const option = select.options[i];
            if (option.__value === value) {
                option.selected = true;
                return;
            }
        }
    }
    function select_value(select) {
        const selected_option = select.querySelector(':checked') || select.options[0];
        return selected_option && selected_option.__value;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined' ? window : global);

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }

    function bind(component, name, callback) {
        if (component.$$.props.indexOf(name) === -1)
            return;
        component.$$.bound[name] = callback;
        callback(component.$$.ctx[name]);
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        if (component.$$.fragment) {
            run_all(component.$$.on_destroy);
            component.$$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            component.$$.on_destroy = component.$$.fragment = null;
            component.$$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal, prop_names) {
        const parent_component = current_component;
        set_current_component(component);
        const props = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props: prop_names,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, props, (key, value) => {
                if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
            })
            : props;
        $$.update();
        ready = true;
        run_all($$.before_update);
        $$.fragment = create_fragment($$.ctx);
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (!stop) {
                    return; // not ready
                }
                subscribers.forEach((s) => s[1]());
                subscribers.forEach((s) => s[0](value));
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    function is_date(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    function get_interpolator(a, b) {
        if (a === b || a !== a)
            return () => a;
        const type = typeof a;
        if (type !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
            throw new Error('Cannot interpolate values of different type');
        }
        if (Array.isArray(a)) {
            const arr = b.map((bi, i) => {
                return get_interpolator(a[i], bi);
            });
            return t => arr.map(fn => fn(t));
        }
        if (type === 'object') {
            if (!a || !b)
                throw new Error('Object cannot be null');
            if (is_date(a) && is_date(b)) {
                a = a.getTime();
                b = b.getTime();
                const delta = b - a;
                return t => new Date(a + t * delta);
            }
            const keys = Object.keys(b);
            const interpolators = {};
            keys.forEach(key => {
                interpolators[key] = get_interpolator(a[key], b[key]);
            });
            return t => {
                const result = {};
                keys.forEach(key => {
                    result[key] = interpolators[key](t);
                });
                return result;
            };
        }
        if (type === 'number') {
            const delta = b - a;
            return t => a + t * delta;
        }
        throw new Error(`Cannot interpolate ${type} values`);
    }
    function tweened(value, defaults = {}) {
        const store = writable(value);
        let task;
        let target_value = value;
        function set(new_value, opts) {
            target_value = new_value;
            let previous_task = task;
            let started = false;
            let { delay = 0, duration = 400, easing = identity, interpolate = get_interpolator } = assign(assign({}, defaults), opts);
            const start = now() + delay;
            let fn;
            task = loop(now => {
                if (now < start)
                    return true;
                if (!started) {
                    fn = interpolate(value, new_value);
                    if (typeof duration === 'function')
                        duration = duration(value, new_value);
                    started = true;
                }
                if (previous_task) {
                    previous_task.abort();
                    previous_task = null;
                }
                const elapsed = now - start;
                if (elapsed > duration) {
                    store.set(value = new_value);
                    return false;
                }
                // @ts-ignore
                store.set(value = fn(easing(elapsed / duration)));
                return true;
            });
            return task.promise;
        }
        return {
            set,
            update: (fn, opts) => set(fn(target_value, value), opts),
            subscribe: store.subscribe
        };
    }

    let tween = {
        duration: 200,
        easing: t => t
    };
    const conf = writable({});
    const debrief = writable({});
    const board = writable([]);
    const game = writable(null);
    let state;
    let stateRef = writable({});
    let settings = writable({});
    let chrome = navigator.userAgent.search("Chrome") >= 0;
    let logs = writable([]);
    let helpSeen = writable({});
    function log(text) {
        logs.update(v => v.slice(-5).concat([text]));
        console.log(text);
    }
    function setGameState(o) {
        if (!state) {
            state = chrome ? tweened(o, tween) : writable(o);
            stateRef.set(state);
        }
        else
            state.set(o);
    }
    const what = writable(true);
    what.set(localStorage.what == "no" ? false : true);
    what.subscribe(v => localStorage.setItem("what", v ? "yes" : "no"));
    helpSeen.set(localStorage.helpSeen ? JSON.parse(localStorage.helpSeen) : {});
    helpSeen.subscribe(v => localStorage.setItem("helpSeen", JSON.stringify(v)));
    settings.set(localStorage.settings
        ? JSON.parse(localStorage.settings)
        : { sound: true, abridgedAnalysis: false });
    settings.subscribe(v => localStorage.setItem("settings", JSON.stringify(v)));
    let oldMode;
    game.subscribe(v => {
        if (oldMode && oldMode != v)
            location.reload();
        oldMode = v;
    });
    const saves = writable([]);
    let savePrefix = "game ";
    let savePrefixLength = savePrefix.length;
    function updateSaves() {
        let list = [];
        for (let k in localStorage) {
            if (k == "auto" || k.substr(0, savePrefixLength) == savePrefix) {
                let data = JSON.parse(localStorage[k]);
                let n = Number(k.substr(savePrefixLength));
                let description = "?";
                try {
                    description = `${data.conf.mode} t${data.turns.length} ${data.conf.width}x${data.conf.height} #${data.conf.seed} ${data.date.toLocaleString()}`;
                }
                catch (e) {
                    console.error(e);
                }
                if (k == "auto")
                    list.unshift([k, description]);
                else
                    list.push([k, description]);
            }
        }
        list.push([nextSlot(), "#NEW"]);
        saves.set(list);
    }
    function nextSlot() {
        let nextInd = 0;
        for (let k in localStorage) {
            if (k.substr(0, savePrefixLength) == savePrefix) {
                let n = Number(k.substr(savePrefixLength));
                if (n >= nextInd) {
                    nextInd = n + 1;
                }
            }
        }
        return savePrefix + nextInd;
    }

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    function createCommonjsModule(fn, module) {
    	return module = { exports: {} }, fn(module, module.exports), module.exports;
    }

    var MersenneTwister = createCommonjsModule(function (module, exports) {
    (function (root, factory) {

        {
            module.exports = factory();
        }
    }(commonjsGlobal, function () {

        var MAX_INT = 4294967296.0,
            N = 624,
            M = 397,
            UPPER_MASK = 0x80000000,
            LOWER_MASK = 0x7fffffff,
            MATRIX_A = 0x9908b0df;

        /**
         * Instantiates a new Mersenne Twister.
         *
         * @constructor
         * @alias module:MersenneTwister
         * @since 0.1.0
         * @param {number=} seed The initial seed value.
         */
        var MersenneTwister = function (seed) {
            if (typeof seed === 'undefined') {
                seed = new Date().getTime();
            }

            this.mt = new Array(N);
            this.mti = N + 1;

            this.seed(seed);
        };

        /**
         * Initializes the state vector by using one unsigned 32-bit integer "seed", which may be zero.
         *
         * @since 0.1.0
         * @param {number} seed The seed value.
         */
        MersenneTwister.prototype.seed = function (seed) {
            var s;

            this.mt[0] = seed >>> 0;

            for (this.mti = 1; this.mti < N; this.mti++) {
                s = this.mt[this.mti - 1] ^ (this.mt[this.mti - 1] >>> 30);
                this.mt[this.mti] =
                    (((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253) + this.mti;
                this.mt[this.mti] >>>= 0;
            }
        };

        /**
         * Initializes the state vector by using an array key[] of unsigned 32-bit integers of the specified length. If
         * length is smaller than 624, then each array of 32-bit integers gives distinct initial state vector. This is
         * useful if you want a larger seed space than 32-bit word.
         *
         * @since 0.1.0
         * @param {array} vector The seed vector.
         */
        MersenneTwister.prototype.seedArray = function (vector) {
            var i = 1,
                j = 0,
                k = N > vector.length ? N : vector.length,
                s;

            this.seed(19650218);

            for (; k > 0; k--) {
                s = this.mt[i-1] ^ (this.mt[i-1] >>> 30);

                this.mt[i] = (this.mt[i] ^ (((((s & 0xffff0000) >>> 16) * 1664525) << 16) + ((s & 0x0000ffff) * 1664525))) +
                    vector[j] + j;
                this.mt[i] >>>= 0;
                i++;
                j++;
                if (i >= N) {
                    this.mt[0] = this.mt[N - 1];
                    i = 1;
                }
                if (j >= vector.length) {
                    j = 0;
                }
            }

            for (k = N - 1; k; k--) {
                s = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
                this.mt[i] =
                    (this.mt[i] ^ (((((s & 0xffff0000) >>> 16) * 1566083941) << 16) + (s & 0x0000ffff) * 1566083941)) - i;
                this.mt[i] >>>= 0;
                i++;
                if (i >= N) {
                    this.mt[0] = this.mt[N - 1];
                    i = 1;
                }
            }

            this.mt[0] = 0x80000000;
        };

        /**
         * Generates a random unsigned 32-bit integer.
         *
         * @since 0.1.0
         * @returns {number}
         */
        MersenneTwister.prototype.int = function () {
            var y,
                kk,
                mag01 = new Array(0, MATRIX_A);

            if (this.mti >= N) {
                if (this.mti === N + 1) {
                    this.seed(5489);
                }

                for (kk = 0; kk < N - M; kk++) {
                    y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK);
                    this.mt[kk] = this.mt[kk + M] ^ (y >>> 1) ^ mag01[y & 1];
                }

                for (; kk < N - 1; kk++) {
                    y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK);
                    this.mt[kk] = this.mt[kk + (M - N)] ^ (y >>> 1) ^ mag01[y & 1];
                }

                y = (this.mt[N - 1] & UPPER_MASK) | (this.mt[0] & LOWER_MASK);
                this.mt[N - 1] = this.mt[M - 1] ^ (y >>> 1) ^ mag01[y & 1];
                this.mti = 0;
            }

            y = this.mt[this.mti++];

            y ^= (y >>> 11);
            y ^= (y << 7) & 0x9d2c5680;
            y ^= (y << 15) & 0xefc60000;
            y ^= (y >>> 18);

            return y >>> 0;
        };

        /**
         * Generates a random unsigned 31-bit integer.
         *
         * @since 0.1.0
         * @returns {number}
         */
        MersenneTwister.prototype.int31 = function () {
            return this.int() >>> 1;
        };

        /**
         * Generates a random real in the interval [0;1] with 32-bit resolution.
         *
         * @since 0.1.0
         * @returns {number}
         */
        MersenneTwister.prototype.real = function () {
            return this.int() * (1.0 / (MAX_INT - 1));
        };

        /**
         * Generates a random real in the interval ]0;1[ with 32-bit resolution.
         *
         * @since 0.1.0
         * @returns {number}
         */
        MersenneTwister.prototype.realx = function () {
            return (this.int() + 0.5) * (1.0 / MAX_INT);
        };

        /**
         * Generates a random real in the interval [0;1[ with 32-bit resolution.
         *
         * @since 0.1.0
         * @returns {number}
         */
        MersenneTwister.prototype.rnd = function () {
            return this.int() * (1.0 / MAX_INT);
        };

        /**
         * Generates a random real in the interval [0;1[ with 32-bit resolution.
         *
         * Same as .rnd() method - for consistency with Math.random() interface.
         *
         * @since 0.2.0
         * @returns {number}
         */
        MersenneTwister.prototype.random = MersenneTwister.prototype.rnd;

        /**
         * Generates a random real in the interval [0;1[ with 53-bit resolution.
         *
         * @since 0.1.0
         * @returns {number}
         */
        MersenneTwister.prototype.rndHiRes = function () {
            var a = this.int() >>> 5,
                b = this.int() >>> 6;

            return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
        };

        var instance = new MersenneTwister();

        /**
         * A static version of [rnd]{@link module:MersenneTwister#rnd} on a randomly seeded instance.
         *
         * @static
         * @function random
         * @memberof module:MersenneTwister
         * @returns {number}
         */
        MersenneTwister.random = function () {
            return instance.rnd();
        };

        return MersenneTwister;
    }));
    });

    class Fig {
        constructor(game, kind, id) {
            this.game = game;
            this.kind = kind;
            this.id = id;
            this.cells = [];
            this.neighbors = [];
            this.resolved = false;
            this.reached = false;
        }
        addNeighbor(n) {
            if (n && !this.neighbors.includes(n)) {
                this.neighbors.push(n);
                n.neighbors.push(this);
            }
        }
        reach() {
            if (this.reached)
                return;
            this.reached = true;
            if (this.kind == "none") {
                this.resolve();
            }
            this.updateAnalysis();
        }
        resolve() {
            if (this.resolved)
                return;
            this.resolved = true;
            for (let n of this.neighbors)
                n.reach();
            if (!this.none)
                this.loot();
        }
        get possible() {
            return this.possibility == 1;
        }
        get possibility() {
            return 0;
        }
        loot() {
        }
        get lootRatio() {
            return 0.1;
        }
        get score() {
            return this.cells.length * (this.dream ? this.scorePerDream : 1);
        }
        get scorePerDream() {
            return 100;
        }
        get scorePerTurn() {
            return 3;
        }
        get xp() {
            return null;
        }
        get wasted() {
            return !this.resolved && this.game.wasted(this.last);
        }
        get dream() {
            return this.kind == "dream";
        }
        get none() {
            return this.kind == "none";
        }
        get color() {
            return this.game.colors(this.kind);
        }
        reset() {
            this.reached = false;
            this.resolved = false;
        }
        updateAnalysis() {
        }
        get deathText() {
            if (this.kind == "dream")
                return { class: "dream", text: this.scorePerDream };
            let xp = this.xp;
            if (xp && xp.length >= 2)
                return { class: xp[0], text: xp[1] };
        }
    }

    class Game {
        constructor(conf, persist) {
            this.twister = new MersenneTwister();
            this.board = [];
            this.figs = [];
            this.turns = [];
            this.persist = null;
            if (persist)
                this.persist = persist;
            this.config(conf);
            game.set(this);
        }
        colors(kind) {
            return kind;
        }
        start() {
            this.generate();
            this.play();
            this.saveAuto();
        }
        config(c) {
            this.conf = c;
            return this;
        }
        load(src) {
            try {
                if (typeof src == "string") {
                    let data = Game.loadRaw(src);
                    if (data) {
                        this.deserialize(data);
                        return true;
                    }
                    return false;
                }
                else {
                    this.deserialize(src);
                }
            }
            catch (_a) {
                console.log("corrupted save");
                this.wipeAuto();
                location.reload();
            }
        }
        static loadRaw(path) {
            if (!path)
                return null;
            let data = localStorage.getItem(path);
            if (data && data != "undefined") {
                return JSON.parse(data);
            }
            else {
                return null;
            }
        }
        save(path) {
            if (!path) {
                path = nextSlot();
            }
            localStorage.setItem(path, JSON.stringify(this.serialized()));
            return path;
        }
        erase(path) {
            localStorage.removeItem(path);
        }
        get savedFields() {
            return "conf turns".split(" ");
        }
        serialized() {
            let data = { date: new Date() };
            for (let field of this.savedFields)
                data[field] = this[field];
            return data;
        }
        get cellsNumber() {
            return this.width * this.height;
        }
        get width() {
            return this.conf.width;
        }
        get height() {
            return this.conf.height;
        }
        deserialize(data) {
            for (let field in data)
                this[field] = data[field];
            this.generate();
            this.play(data.turns);
        }
        get dreamFrequency() {
            return 400;
        }
        cellGenerator(ind) {
            return 0;
        }
        get colorsList() {
            return ["none"];
        }
        generate() {
            this.turns = [];
            this.figs = [];
            this.twister.seed(this.conf.seed);
            this.rni = this.twister.int.bind(this.twister);
            this.deltas = [-1, 1, -this.width, +this.width];
            let raw = [...Array(this.cellsNumber)].map((a, i) => this.cellGenerator(i));
            for (let i = 0; i < this.cellsNumber; i +=
                Math.floor(this.dreamFrequency / 2) + (this.rni() % this.dreamFrequency)) {
                if (i == 0)
                    continue;
                raw[i] = 1;
            }
            this.board = raw.map(_ => null);
            for (let i in raw) {
                this.populate(raw, Number(i));
            }
        }
        createFig(kind, id) {
            return new Fig(this, kind, id);
        }
        populate(raw, start) {
            if (this.board[start])
                return;
            let color = raw[start];
            let kind = this.colorsList[color];
            let heap = [start];
            let fig = this.createFig(kind, this.figs.length);
            this.figs.push(fig);
            while (heap.length > 0) {
                let cur = heap.pop();
                this.board[cur] = fig;
                fig.cells.push(cur);
                for (let delta of this.deltas) {
                    let next = cur + delta;
                    if (Math.abs(delta) == 1 &&
                        Math.floor(cur / this.width) != Math.floor(next / this.width))
                        continue;
                    if (this.board[next]) {
                        fig.addNeighbor(this.board[next]);
                    }
                    else if (raw[next] == color) {
                        heap.push(next);
                    }
                }
            }
            fig.last = fig.cells.reduce((a, b) => (a > b ? a : b));
            let depths = fig.cells.map(cell => this.row(cell));
            fig.depth = Math.round(depths.reduce((a, b) => a + b) / fig.cells.length);
        }
        row(cell) {
            return Math.floor(cell / this.width);
        }
        init() { }
        play(turns = []) {
            this.init();
            this.turns = turns;
            this.score = 0;
            this.dreamsTotal = 0;
            this.haveMoves = true;
            for (let fig of this.figs) {
                fig.reset();
                if (fig.dream) {
                    this.dreamsTotal++;
                }
            }
            for (let i = 0; i < this.width; i++) {
                this.board[i].reach();
            }
            for (let id of turns) {
                if (this.figs[id])
                    this.figs[id].resolve();
            }
            this.saveAuto();
            this.stateChanged();
        }
        attackFigAt(cell) {
            let fig = this.board[cell];
            if (!fig)
                return null;
            if (fig.wasted)
                return null;
            if (!fig)
                return null;
            if (fig.possible) {
                fig.resolve();
                this.turns.push(fig.id);
                this.stateChanged();
                this.saveAuto();
                return fig;
            }
            return null;
        }
        saveAuto() {
            this.save(this.persist);
        }
        wipeAuto() {
            localStorage.removeItem(this.persist);
        }
        updateResolutions() {
            this.haveMoves = false;
            for (let f of this.figs) {
                if (f.reached && !f.resolved) {
                    if (f.possible) {
                        this.haveMoves = true;
                    }
                    f.updateAnalysis();
                }
            }
        }
        undo() {
            if (this.turns.length > 0) {
                this.play(this.turns.slice(0, -1));
            }
        }
        reset() {
            this.play();
        }
        logFigAt(cell) {
            let fig = this.board[cell];
            fig.updateAnalysis();
            console.log(fig);
        }
        fig(id) {
            return this.figs[id];
        }
        figAt(cell) {
            return this.board[cell];
        }
        stateExtraFields() {
            return {};
        }
        stateChanged() {
            this.updateResolutions();
            this.dreamsResolved = 0;
            this.dreamsWasted = 0;
            for (let f of this.figs) {
                if (f.dream) {
                    if (f.resolved)
                        this.dreamsResolved++;
                    else if (f.wasted)
                        this.dreamsWasted++;
                }
            }
            conf.set(this.conf);
            board.set(this.board);
            this.complete =
                this.dreamsResolved + this.dreamsWasted == this.dreamsTotal ||
                    !this.haveMoves;
            let state = {
                turns: this.turns.length,
                score: this.score,
                wasteDepth: this.wasteDepth,
                turnsToWaste: this.turnsToWaste,
                complete: this.complete ? 1 : 0,
                haveMoves: this.haveMoves ? 1 : 0
            };
            Object.assign(state, this.stateExtraFields());
            setGameState(state);
            debrief.set(this.debrief);
        }
        get wasteDepth() {
            return Math.max(0, Math.floor((this.turns.length - this.wastedDelay) / this.turnsPerWastedLine));
        }
        get turnsToWaste() {
            let delayed = this.turns.length - this.wastedDelay;
            if (delayed < 0)
                return -delayed;
            return this.turnsPerWastedLine - (delayed % this.turnsPerWastedLine);
        }
        wasted(i) {
            return i < this.width * this.wasteDepth;
        }
        get turnsPerWastedLine() {
            return 3;
        }
        get wastedDelay() {
            return 20;
        }
        get debrief() {
            let d = {
                score: this.score,
                dreamsResolved: this.dreamsResolved,
                dreamsWasted: this.dreamsWasted,
                turns: this.turns.length,
                challengeUrl: this.challengeUrl
            };
            for (let f of this.figs) {
                if (f.resolved)
                    d[f.kind] = (d[f.kind] || 0) + f.cells.length;
            }
            return d;
        }
        get challengeUrl() {
            let urlConf = {};
            Object.assign(urlConf, this.conf);
            urlConf.goal = this.score;
            let params = new URLSearchParams(urlConf);
            let url = window.location.host + window.location.pathname + "#" + params.toString();
            return url;
        }
        colorAt(cell) {
            return this.figAt(cell).color;
        }
        get statsOrder() {
            return [];
        }
        get mode() {
            return this.conf.mode;
        }
    }
    (function (Game) {
        class Config {
        }
        Game.Config = Config;
    })(Game || (Game = {}));
    var Game$1 = Game;

    const maxCombatLength = 20;
    class Battle {
        constructor(bats) {
            this.bats = bats;
            this.time = 0;
            this.log = [];
            this.hp = [];
            for (let b of bats) {
                b.hp = b.vit;
                b.nextAttack = b.interval();
            }
            bats[0].seed(bats[1]);
            bats[1].seed(bats[0]);
            let i = 30;
            while (!this.over() && i-- > 0) {
                let next = Math.min(...bats.map(a => a.nextAttack));
                this.time = next;
                for (let a of bats) {
                    if (a.nextAttack <= this.time && !(a.hp <= 0)) {
                        let d = bats[0] == a ? bats[1] : bats[0];
                        this.log.push(a.attack(d, this));
                    }
                }
            }
            this.hp = this.bats.map(b => b.hp);
            if (bats[0].hp <= 0)
                this.outcome = "lose";
            else if (bats[1].hp <= 0)
                this.outcome = "win";
            else
                this.outcome = "draw";
            if (this.outcome == "win") {
                this.success = 1;
            }
            else {
                this.success = Math.max(0.1, Math.min((1 - bats[1].hp / bats[1].vit), 0.9));
            }
        }
        get enemy() {
            return this.bats[1];
        }
        over() {
            return (this.log.length >= maxCombatLength || !this.bats.every(b => b.hp > 0));
        }
    }

    class Battler {
        constructor(fig) {
            this.fig = fig;
            this.twister = new MersenneTwister();
        }
        stats(stats) {
            Object.assign(this, stats);
            return this;
        }
        interval() {
            return 10000 / this.spd;
        }
        rni() {
            return this.twister.int();
        }
        seed(opponent) {
            let seed = 100 + Math.abs(opponent.fig ? opponent.fig.id : -1) * 2 + (this.fig ? this.fig.id : -1);
            this.twister.seed(seed);
        }
        get isProto() {
            return !this.fig;
        }
        update() {
            let bonuses = {};
            for (let stat in Battler.statsBase)
                bonuses[stat] = 0;
            bonuses[this.fig.kind] = this.fig.cells.length * 4;
            for (let n of this.fig.neighbors) {
                if (!n.resolved) {
                    bonuses[n.kind] += n.cells.length;
                }
            }
            for (let stat in Battler.statsBase) {
                this[stat] = Math.floor((Battler.statsBase[stat] *
                    (10 + bonuses[stat] * 2) *
                    Math.pow(10, 1 + this.fig.depth / 20)) /
                    100);
            }
            this.battle = new Battle([this.fig.monstromino.prota, this]);
            return this;
        }
        attack(d, battle) {
            this.nextAttack = battle.time + this.interval();
            let damage = 0;
            let rnd = this.rni();
            let damageRoll = Math.floor(((rnd % 1e6) / 1e6 + 0.5) * this.str);
            damage = Math.max(0, damageRoll - d.def);
            if (damage > 0)
                d.hp -= damage;
            return { a: this, d, damage, damageRoll, def: d.def, hp: d.hp };
        }
    }
    Battler.statsBase = { str: 10, vit: 30, def: 10, spd: 10, dream: 0 };

    function compareObjects(a, b) {
        for (let k in a) {
            if (a[k] != b[k])
                return false;
        }
        return true;
    }
    function weightedRandom(a, rni) {
        let roll = (rni() % a.reduce((x, y) => x + y)) - a[0];
        let i = 0;
        while (roll >= 0)
            roll -= a[++i];
        return i;
    }
    let bigNumLetters = " K M B t q Q s S o n d U D T Qt Qd Sd St O N v c".split(" ");
    function bigNum(n) {
        if (isNaN(+n))
            return "-";
        let i;
        for (i = 0; Math.abs(n) > 100000 && i < bigNumLetters.length; i++)
            n /= 1000;
        let res = Math.round(n) + bigNumLetters[i];
        return res;
    }
    function strfmt(fmt, ...args) {
        return fmt.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] != 'undefined'
                ? args[number]
                : match;
        });
    }

    class MonstrominoFig extends Fig {
        get battler() {
            return this.battle ? this.battle.enemy : null;
        }
        get monstromino() {
            return this.game;
        }
        loot() {
            this.game.score += this.score - this.scorePerTurn;
            let statName = this.kind;
            if (statName == "none")
                return;
            this.monstromino.prota[statName] += Math.floor(this.battle.enemy[statName] * this.lootRatio);
        }
        get xp() {
            if (this.kind == "dream")
                return null;
            let statName = this.kind;
            return [statName, Math.floor(this.battle.enemy[statName] / 10)];
        }
        /*resolve() {
          if (this.resolved) return;
          if (!this.battle) this.updateAnalysis();
          this.resolved = true;
          for (let n of this.neighbors) n.reach();
          this.loot();
        }*/
        updateAnalysis() {
            if (this.resolved || this.kind == "none") {
                this.battle = null;
                return this;
            }
            let ownMultiplier = 4;
            let neighborMultiplier = 2;
            let dreamMultiplier = 2;
            let baseBonus = 5;
            let finalMultiplier = 0.015;
            let depthScaling = 0.05;
            let bonuses = { str: 0, vit: 0, def: 0, spd: 0, dream: 0 };
            bonuses[this.kind] = this.cells.length * ownMultiplier;
            for (let n of this.neighbors) {
                if (!n.resolved) {
                    bonuses[n.kind] += n.cells.length * neighborMultiplier;
                }
            }
            let battler = new Battler(this);
            for (let stat of this.game.statsOrder) {
                bonuses[stat] += bonuses.dream * dreamMultiplier;
            }
            bonuses.dream = 0;
            for (let stat in Battler.statsBase) {
                battler[stat] = Math.floor(Battler.statsBase[stat] *
                    (baseBonus + bonuses[stat]) *
                    Math.pow(10, 1 + this.depth * depthScaling) *
                    finalMultiplier);
            }
            this.battle = new Battle([this.monstromino.prota, battler]);
            return this;
        }
        reset() {
            super.reset();
            this.battle = null;
        }
        get possibility() {
            if (!this.reached || this.resolved || this.wasted)
                return 0;
            return this.battle ? this.battle.success : 0;
        }
    }

    const colorsConst = {
        str: "red",
        vit: "green",
        def: "yellow",
        spd: "blue",
        none: "none",
        dream: "dream"
    };
    class Monstromino extends Game$1 {
        get statsOrder() {
            return ["str", "vit", "def", "spd"];
        }
        get colorsList() {
            return ["none", "dream", "str", "vit", "def", "spd"];
        }
        colors(kind) {
            return colorsConst[kind];
        }
        createFig(kind, id) {
            return new MonstrominoFig(this, kind, id);
        }
        cellGenerator(ind) {
            return weightedRandom([1, 0, 1, 1, 1, 1], this.rni);
        }
        init() {
            this.prota = new Battler().stats({
                str: 40,
                vit: 40,
                def: 40,
                spd: 40
            });
        }
        stateExtraFields() {
            return { str: this.prota.str, vit: this.prota.vit, def: this.prota.def, spd: this.prota.spd };
        }
        get dreamFrequency() {
            return 400;
        }
    }

    class MonstrominoFig$1 extends Fig {
        loot() {
            let colorN = this.rainbow.colorsList.indexOf(this.kind);
            if (colorN > 1) {
                colorN = colorN + 1;
                if (colorN >= this.rainbow.colorsList.length)
                    colorN = 2;
            }
            this.rainbow.color = colorN;
            this.game.score += this.score - 3;
        }
        get rainbow() {
            return this.game;
        }
        get possibility() {
            return (this.reached &&
                !this.resolved &&
                (this.rainbow.color <= 1 || this.kind == "dream" || this.rainbow.colorsList.indexOf(this.kind) == this.rainbow.color)) ? 1 : 0;
        }
    }

    class Rainbow extends Game$1 {
        get statsOrder() {
            return [];
        }
        get colorsList() {
            return ["none", "dream", "red", "yellow", "green", "blue", "violet"];
        }
        createFig(kind, id) {
            return new MonstrominoFig$1(this, kind, id);
        }
        cellGenerator(ind) {
            return weightedRandom([1, 0, 1, 1, 1, 1, 1], this.rni);
        }
        /*stateExtraFields() {
          return {
            color: this.color,
          };
        }*/
        init() {
            this.color = 0;
        }
        get dreamFrequency() {
            return 400;
        }
        get turnsPerWastedLine() {
            return 2;
        }
        get wastedDelay() {
            return 10;
        }
    }

    class LifeState {
        power(kind) {
            return ((Object.values(this).reduce((a, b) => a + b) +
                (kind ? this[kind] * 2 : 0)) / 3);
        }
    }
    const statsBase = {
        self: 10,
        friends: 10,
        family: 10,
        career: 10
    };
    class LifeFig extends Fig {
        reset() {
            super.reset();
            this.stats = new LifeState();
        }
        loot() {
            this.game.score += this.score - this.scorePerTurn;
            if (!(this.kind in this.stats))
                return;
            this.life.prota[this.kind] += Math.floor(this.stats[this.kind] * this.lootRatio);
        }
        get lootRatio() {
            return 0.07;
        }
        get scorePerDream() {
            return 100;
        }
        get life() {
            return this.game;
        }
        get possibility() {
            if (!this.reached || this.resolved || this.wasted)
                return 0;
            if (!this.stats)
                this.updateAnalysis();
            let sufficiency = 0;
            if (this.dream) {
                let sufficiencyEach = Object.keys(this.stats).map(k => {
                    return this.life.prota[k] / this.stats[k];
                });
                sufficiency = sufficiencyEach.reduce((a, b) => (a < b ? a : b));
            }
            else {
                let thisPower = this.stats[this.kind];
                let protaPower = this.life.prota.power(this.kind);
                sufficiency = protaPower / thisPower;
            }
            return sufficiency >= 1 ? 1 : sufficiency;
        }
        get outcome() {
            return this.possible ? "possible" : "impossible";
        }
        updateAnalysis() {
            if (this.resolved || this.kind == "none") {
                return this;
            }
            let ownMultiplier = 4;
            let neighborMultiplier = 2;
            let dreamMultiplier = 4;
            let dreamNeighborMultiplier = 2;
            let baseBonus = 5;
            let finalMultiplier = 0.015;
            let depthScaling = 0.03;
            let bonuses = { self: 0, friends: 0, family: 0, career: 0, dream: 0 };
            bonuses[this.kind] = this.cells.length * ownMultiplier;
            for (let n of this.neighbors) {
                if (!n.resolved) {
                    bonuses[n.kind] += n.cells.length * neighborMultiplier * (this.dream || n.dream ? dreamNeighborMultiplier : 1);
                }
            }
            for (let stat of this.life.statsOrder) {
                bonuses[stat] += bonuses.dream * dreamMultiplier;
            }
            bonuses.dream = 0;
            let statsHaving = this.dream ? Object.keys(statsBase) : [this.kind];
            for (let stat of statsHaving) {
                this.stats[stat] = Math.floor(statsBase[stat] *
                    (baseBonus + bonuses[stat]) *
                    Math.pow(10, 1 + this.depth * depthScaling) *
                    finalMultiplier);
            }
        }
        get xp() {
            if (this.kind == "dream")
                return null;
            return [this.kind, Math.floor(this.stats[this.kind] * this.lootRatio)];
        }
        get color() {
            if (this.dream) {
                this.updateAnalysis();
                let worstStat = Object.keys(this.stats).reduce(([min, minKey], key) => {
                    let ratio = this.life.prota[key] / this.stats[key];
                    if (ratio < min)
                        return [ratio, key];
                    else
                        return [min, minKey];
                }, [1, 0]);
                if (worstStat[0] >= 1)
                    return this.game.colors("none");
                else
                    return this.game.colors(worstStat[1]);
            }
            return this.game.colors(this.kind);
        }
    }
    const colorsConst$1 = {
        self: "red",
        friends: "yellow",
        family: "green",
        career: "blue",
        none: "none",
        dream: "dream"
    };
    class Life extends Game$1 {
        get statsOrder() {
            return ["self", "friends", "family", "career"];
        }
        get colorsList() {
            return ["none", "dream", "self", "friends", "family", "career"];
        }
        colors(kind) {
            return colorsConst$1[kind];
        }
        createFig(kind, id) {
            return new LifeFig(this, kind, id);
        }
        cellGenerator(ind) {
            return weightedRandom([1, 0, 1, 1, 1, 1], this.rni);
        }
        init() {
            this.prota = new LifeState();
            Object.assign(this.prota, {
                self: 30,
                friends: 30,
                family: 30,
                career: 30
            });
        }
        stateExtraFields() {
            return this.prota;
        }
        get dreamFrequency() {
            return 300;
        }
    }

    function createGame() {
        let urlConf;
        let defaultConf = { width: 40, height: 100, seed: 1, mode: "monstromino" };
        if (document.location.hash) {
            let usp = new URLSearchParams(document.location.hash.substr(1));
            urlConf = Object.fromEntries(usp.entries());
        }
        let auto = "auto";
        let raw = Game$1.loadRaw(auto);
        let game;
        if (!raw) {
            game = createGameLike(urlConf || defaultConf, auto);
            game.start();
            return game;
        }
        let confMatches = !urlConf || compareObjects(raw.conf, urlConf);
        game = createGameLike(urlConf || raw.conf, auto);
        if (confMatches) {
            game.load(raw);
        }
        else {
            game.start();
        }
        console.log(game);
        return game;
    }
    function createGameLike(conf, auto) {
        switch (conf.mode) {
            case "rainbow":
                return new Rainbow(conf, auto);
            case "life":
                return new Life(conf, auto);
            default:
                conf.mode = "monstromino";
                return new Monstromino(conf, auto);
        }
    }

    let lang = {
        what_files: `
  After each your move game is saved to the AUTO slot. <br/>
  You can save in new slot, load any save or delete them with X.
  `,
        tip_str: `Each attack deals random damage between 0% and 200% of this value (before Defense applied).`,
        tip_vit: `Amount of HP when combat starts.`,
        tip_def: `Damage from each attack is reduced by this.`,
        tip_spd: `Frequency of attacks.`,
        tip_score: `Score is +1 per cleared cell, +100 per dream, -3 per turn`,
        tip_erase: `Delete file`,
        tip_wasted: `After {0} turns since the game start and each {1} turns thereafter one row of board is blocked.<br/>Figures completely in blocked area are wasted and forever lost.`,
        tip_ability: `Not implemented yet`,
        wasted: `WASTED`
    };

    /* src\What.svelte generated by Svelte v3.6.7 */
    const { console: console_1 } = globals;

    const file = "src\\What.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.stat = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.stat = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.stat = list[i];
    	return child_ctx;
    }

    function get_each_context_3(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.stat = list[i];
    	return child_ctx;
    }

    function get_each_context_4(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.stat = list[i];
    	return child_ctx;
    }

    function get_each_context_5(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.stat = list[i];
    	return child_ctx;
    }

    // (21:0) {#if whatPage == 'files'}
    function create_if_block_4(ctx) {
    	var div3, div0, t1, div1, t3, div2;

    	return {
    		c: function create() {
    			div3 = element("div");
    			div0 = element("div");
    			div0.textContent = "Here you can save in a new slot, load any save or delete them (with X).";
    			t1 = space();
    			div1 = element("div");
    			div1.textContent = "After each your move game is saved to the AUTO slot.";
    			t3 = space();
    			div2 = element("div");
    			div2.textContent = "At any moment, you can quick save to a new slot with \"Q\" button.";
    			add_location(div0, file, 22, 2, 351);
    			add_location(div1, file, 23, 2, 437);
    			add_location(div2, file, 24, 2, 504);
    			set_style(div3, "text-align", "center");
    			add_location(div3, file, 21, 0, 316);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div3, anchor);
    			append(div3, div0);
    			append(div3, t1);
    			append(div3, div1);
    			append(div3, t3);
    			append(div3, div2);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div3);
    			}
    		}
    	};
    }

    // (30:2) {#if whatPage != 'files'}
    function create_if_block_3(ctx) {
    	var tr, td, b, t0, t1;

    	return {
    		c: function create() {
    			tr = element("tr");
    			td = element("td");
    			b = element("b");
    			t0 = text(ctx.whatPage);
    			t1 = text(" mode");
    			add_location(b, file, 32, 6, 731);
    			attr(td, "colspan", "2");
    			set_style(td, "text-align", "center");
    			set_style(td, "font-weight", "normal");
    			attr(td, "class", "svelte-23rsga");
    			add_location(td, file, 31, 2, 659);
    			add_location(tr, file, 30, 2, 651);
    		},

    		m: function mount(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td);
    			append(td, b);
    			append(b, t0);
    			append(td, t1);
    		},

    		p: function update(changed, ctx) {
    			if (changed.whatPage) {
    				set_data(t0, ctx.whatPage);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(tr);
    			}
    		}
    	};
    }

    // (38:2) {#if whatPage == 'monstromino'}
    function create_if_block_2(ctx) {
    	var tr0, td0, t1, td1, t2, span0, t3, t4, tr1, td2, t6, td3, t8, tr2, td4, t10, td5, t11, br0, t12, br1, t13, t14, tr3, td6, t16, td7, t17, br2, t18, t19, br3, t20, t21, br4, t22, span1, t23;

    	var each_value_5 = ctx.$game.statsOrder;

    	var each_blocks_2 = [];

    	for (var i = 0; i < each_value_5.length; i += 1) {
    		each_blocks_2[i] = create_each_block_5(get_each_context_5(ctx, each_value_5, i));
    	}

    	var each_value_4 = ctx.$game.statsOrder;

    	var each_blocks_1 = [];

    	for (var i = 0; i < each_value_4.length; i += 1) {
    		each_blocks_1[i] = create_each_block_4(get_each_context_4(ctx, each_value_4, i));
    	}

    	var each_value_3 = ctx.$game.statsOrder;

    	var each_blocks = [];

    	for (var i = 0; i < each_value_3.length; i += 1) {
    		each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    	}

    	return {
    		c: function create() {
    			tr0 = element("tr");
    			td0 = element("td");
    			td0.textContent = "Objective";
    			t1 = space();
    			td1 = element("td");
    			t2 = text("Collect all\r\n        ");
    			span0 = element("span");
    			t3 = text("\r\n        dreams.");
    			t4 = space();
    			tr1 = element("tr");
    			td2 = element("td");
    			td2.textContent = "Method";
    			t6 = space();
    			td3 = element("td");
    			td3.textContent = "Each colored figure is a monster. Mouse over it to see it's stats and\r\n        how would combat go if you attack it. Click to attack. If you win, you\r\n        will gain some of victim's stats, score, and gain access to monsters\r\n        behind it.";
    			t8 = space();
    			tr2 = element("tr");
    			td4 = element("td");
    			td4.textContent = "Tips";
    			t10 = space();
    			td5 = element("td");
    			t11 = text("Figure's stats depend on their depth, size, color and neighbors.\r\n        ");
    			br0 = element("br");
    			t12 = text("\r\n        Mouse over your stats and score at the top for details of what each of\r\n        them do.\r\n        ");
    			br1 = element("br");
    			t13 = text("\r\n        Combat is a draw if it's not over after 20 attacks");
    			t14 = space();
    			tr3 = element("tr");
    			td6 = element("td");
    			td6.textContent = "Legend";
    			t16 = space();
    			td7 = element("td");

    			for (var i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t17 = text("\r\n        - You can defeat it.\r\n        ");
    			br2 = element("br");
    			t18 = space();

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t19 = text("\r\n        - you are too weak for it. Thickness of border is how bad combat with it\r\n        would go.\r\n        ");
    			br3 = element("br");
    			t20 = space();

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t21 = text("\r\n        - you have not reached it yet.\r\n        ");
    			br4 = element("br");
    			t22 = space();
    			span1 = element("span");
    			t23 = text("\r\n        - dream. Gives no stats, but a lot of score.");
    			attr(td0, "class", "svelte-23rsga");
    			add_location(td0, file, 39, 6, 841);
    			attr(span0, "class", "shiny-inline");
    			add_location(span0, file, 42, 8, 902);
    			attr(td1, "class", "svelte-23rsga");
    			add_location(td1, file, 40, 6, 867);
    			add_location(tr0, file, 38, 4, 829);
    			attr(td2, "class", "svelte-23rsga");
    			add_location(td2, file, 48, 6, 992);
    			attr(td3, "class", "svelte-23rsga");
    			add_location(td3, file, 49, 6, 1015);
    			add_location(tr1, file, 47, 4, 980);
    			attr(td4, "class", "svelte-23rsga");
    			add_location(td4, file, 57, 6, 1318);
    			add_location(br0, file, 60, 8, 1427);
    			add_location(br1, file, 63, 8, 1541);
    			attr(td5, "class", "svelte-23rsga");
    			add_location(td5, file, 58, 6, 1339);
    			add_location(tr2, file, 56, 4, 1306);
    			attr(td6, "class", "svelte-23rsga");
    			add_location(td6, file, 68, 6, 1649);
    			add_location(br2, file, 74, 8, 1819);
    			add_location(br3, file, 82, 8, 2123);
    			add_location(br4, file, 87, 8, 2289);
    			attr(span1, "class", "shiny-inline");
    			add_location(span1, file, 88, 8, 2305);
    			attr(td7, "class", "svelte-23rsga");
    			add_location(td7, file, 69, 6, 1672);
    			add_location(tr3, file, 67, 4, 1637);
    		},

    		m: function mount(target, anchor) {
    			insert(target, tr0, anchor);
    			append(tr0, td0);
    			append(tr0, t1);
    			append(tr0, td1);
    			append(td1, t2);
    			append(td1, span0);
    			append(td1, t3);
    			insert(target, t4, anchor);
    			insert(target, tr1, anchor);
    			append(tr1, td2);
    			append(tr1, t6);
    			append(tr1, td3);
    			insert(target, t8, anchor);
    			insert(target, tr2, anchor);
    			append(tr2, td4);
    			append(tr2, t10);
    			append(tr2, td5);
    			append(td5, t11);
    			append(td5, br0);
    			append(td5, t12);
    			append(td5, br1);
    			append(td5, t13);
    			insert(target, t14, anchor);
    			insert(target, tr3, anchor);
    			append(tr3, td6);
    			append(tr3, t16);
    			append(tr3, td7);

    			for (var i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(td7, null);
    			}

    			append(td7, t17);
    			append(td7, br2);
    			append(td7, t18);

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(td7, null);
    			}

    			append(td7, t19);
    			append(td7, br3);
    			append(td7, t20);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(td7, null);
    			}

    			append(td7, t21);
    			append(td7, br4);
    			append(td7, t22);
    			append(td7, span1);
    			append(td7, t23);
    		},

    		p: function update(changed, ctx) {
    			if (changed.bg || changed.$game) {
    				each_value_5 = ctx.$game.statsOrder;

    				for (var i = 0; i < each_value_5.length; i += 1) {
    					const child_ctx = get_each_context_5(ctx, each_value_5, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(changed, child_ctx);
    					} else {
    						each_blocks_2[i] = create_each_block_5(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(td7, t17);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}
    				each_blocks_2.length = each_value_5.length;
    			}

    			if (changed.bg || changed.$game) {
    				each_value_4 = ctx.$game.statsOrder;

    				for (var i = 0; i < each_value_4.length; i += 1) {
    					const child_ctx = get_each_context_4(ctx, each_value_4, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_4(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(td7, t19);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}
    				each_blocks_1.length = each_value_4.length;
    			}

    			if (changed.bg || changed.$game) {
    				each_value_3 = ctx.$game.statsOrder;

    				for (var i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3(ctx, each_value_3, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(td7, t21);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value_3.length;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(tr0);
    				detach(t4);
    				detach(tr1);
    				detach(t8);
    				detach(tr2);
    				detach(t14);
    				detach(tr3);
    			}

    			destroy_each(each_blocks_2, detaching);

    			destroy_each(each_blocks_1, detaching);

    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (71:8) {#each $game.statsOrder as stat}
    function create_each_block_5(ctx) {
    	var span, span_class_value;

    	return {
    		c: function create() {
    			span = element("span");
    			attr(span, "class", span_class_value = "cell " + ctx.bg(ctx.stat));
    			add_location(span, file, 71, 10, 1730);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.bg || changed.$game) && span_class_value !== (span_class_value = "cell " + ctx.bg(ctx.stat))) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (76:8) {#each $game.statsOrder as stat}
    function create_each_block_4(ctx) {
    	var span, span_class_value;

    	return {
    		c: function create() {
    			span = element("span");
    			attr(span, "class", span_class_value = "cell " + ctx.bg(ctx.stat));
    			set_style(span, "box-shadow", "inset 0px 0px 0px 4px rgba(0,0,0,0.3)");
    			add_location(span, file, 76, 10, 1879);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.bg || changed.$game) && span_class_value !== (span_class_value = "cell " + ctx.bg(ctx.stat))) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (84:8) {#each $game.statsOrder as stat}
    function create_each_block_3(ctx) {
    	var span, span_class_value;

    	return {
    		c: function create() {
    			span = element("span");
    			attr(span, "class", span_class_value = "cell " + ctx.bg(ctx.stat) + " darken");
    			add_location(span, file, 84, 10, 2183);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.bg || changed.$game) && span_class_value !== (span_class_value = "cell " + ctx.bg(ctx.stat) + " darken")) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (94:2) {#if whatPage == 'rainbow'}
    function create_if_block_1(ctx) {
    	var tr0, td0, t1, td1, t2, span0, t3, t4, tr1, td2, t6, td3, t7, span1, t9;

    	return {
    		c: function create() {
    			tr0 = element("tr");
    			td0 = element("td");
    			td0.textContent = "Objective";
    			t1 = space();
    			td1 = element("td");
    			t2 = text("Collect all\r\n        ");
    			span0 = element("span");
    			t3 = text("\r\n        dreams.");
    			t4 = space();
    			tr1 = element("tr");
    			td2 = element("td");
    			td2.textContent = "Method";
    			t6 = space();
    			td3 = element("td");
    			t7 = text("Colors of figure you can collect are rotated in rainbow order\r\n        (red>yellow>green>blue>violet).\r\n        ");
    			span1 = element("span");
    			span1.textContent = "Dream";
    			t9 = text("\r\n        can follow any color and be followed by any color.");
    			attr(td0, "class", "svelte-23rsga");
    			add_location(td0, file, 95, 6, 2470);
    			attr(span0, "class", "shiny-inline");
    			add_location(span0, file, 98, 8, 2531);
    			attr(td1, "class", "svelte-23rsga");
    			add_location(td1, file, 96, 6, 2496);
    			add_location(tr0, file, 94, 4, 2458);
    			attr(td2, "class", "svelte-23rsga");
    			add_location(td2, file, 103, 6, 2619);
    			attr(span1, "style", "dream");
    			add_location(span1, file, 107, 8, 2780);
    			attr(td3, "class", "svelte-23rsga");
    			add_location(td3, file, 104, 6, 2642);
    			add_location(tr1, file, 102, 4, 2607);
    		},

    		m: function mount(target, anchor) {
    			insert(target, tr0, anchor);
    			append(tr0, td0);
    			append(tr0, t1);
    			append(tr0, td1);
    			append(td1, t2);
    			append(td1, span0);
    			append(td1, t3);
    			insert(target, t4, anchor);
    			insert(target, tr1, anchor);
    			append(tr1, td2);
    			append(tr1, t6);
    			append(tr1, td3);
    			append(td3, t7);
    			append(td3, span1);
    			append(td3, t9);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(tr0);
    				detach(t4);
    				detach(tr1);
    			}
    		}
    	};
    }

    // (113:2) {#if whatPage == 'life'}
    function create_if_block(ctx) {
    	var tr0, td0, t1, td1, t2, span0, t3, t4, tr1, td2, t6, td3, t7, span1, t8, span1_class_value, t9, span2, t10, span2_class_value, t11, span3, t12, span3_class_value, t13, span4, t14, span4_class_value, t15, t16, tr2, td4, t18, td5, t20, tr3, td6, t22, td7, t23, br0, t24, t25, br1, t26, t27, br2, t28, span5, t29, span6, t30;

    	var each_value_2 = ctx.$game.statsOrder;

    	var each_blocks_2 = [];

    	for (var i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	var each_value_1 = ctx.$game.statsOrder;

    	var each_blocks_1 = [];

    	for (var i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	var each_value = ctx.$game.statsOrder;

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c: function create() {
    			tr0 = element("tr");
    			td0 = element("td");
    			td0.textContent = "Objective";
    			t1 = space();
    			td1 = element("td");
    			t2 = text("Reach your\r\n        ");
    			span0 = element("span");
    			t3 = text("\r\n        dreams and get maximum score.");
    			t4 = space();
    			tr1 = element("tr");
    			td2 = element("td");
    			td2.textContent = "Method";
    			t6 = space();
    			td3 = element("td");
    			t7 = text("Each colored figure represents some life situation and is relevant to\r\n        one of life aspects -\r\n        ");
    			span1 = element("span");
    			t8 = text("self");
    			t9 = text("\r\n        ,\r\n        ");
    			span2 = element("span");
    			t10 = text("friends");
    			t11 = text("\r\n        ,\r\n        ");
    			span3 = element("span");
    			t12 = text("family");
    			t13 = text("\r\n        or\r\n        ");
    			span4 = element("span");
    			t14 = text("career");
    			t15 = text("\r\n        . Click on it to resolve it and improve relative stat and also open the\r\n        way to figures behind it.");
    			t16 = space();
    			tr2 = element("tr");
    			td4 = element("td");
    			td4.textContent = "Resolution";
    			t18 = space();
    			td5 = element("td");
    			td5.textContent = "Whether situation is resolvable is dependent on your stats. If the sum\r\n        of your relevant (i.e. same colored) stat and average of all other stats\r\n        is more or equal than situation difficulty, then it's resolvable. Dreams\r\n        work a bit different - they have separate requirements for all stats and\r\n        all must be met.";
    			t20 = space();
    			tr3 = element("tr");
    			td6 = element("td");
    			td6.textContent = "Legend";
    			t22 = space();
    			td7 = element("td");

    			for (var i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t23 = text("\r\n        - resolvable situations.\r\n        ");
    			br0 = element("br");
    			t24 = space();

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t25 = text("\r\n        - unresolvable. Thickness of border is how much your stats are\r\n        insufficient.\r\n        ");
    			br1 = element("br");
    			t26 = space();

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t27 = text("\r\n        - unreachable.\r\n        ");
    			br2 = element("br");
    			t28 = space();
    			span5 = element("span");
    			t29 = text("\r\n        - dream. If it has a colored border\r\n        ");
    			span6 = element("span");
    			t30 = text("\r\n        then you are missing that stat (the most).");
    			attr(td0, "class", "svelte-23rsga");
    			add_location(td0, file, 114, 6, 2951);
    			attr(span0, "class", "shiny-inline");
    			add_location(span0, file, 117, 8, 3011);
    			attr(td1, "class", "svelte-23rsga");
    			add_location(td1, file, 115, 6, 2977);
    			add_location(tr0, file, 113, 4, 2939);
    			attr(td2, "class", "svelte-23rsga");
    			add_location(td2, file, 123, 6, 3123);
    			attr(span1, "class", span1_class_value = ctx.fg('self'));
    			add_location(span1, file, 127, 8, 3270);
    			attr(span2, "class", span2_class_value = ctx.fg('friends'));
    			add_location(span2, file, 129, 8, 3327);
    			attr(span3, "class", span3_class_value = ctx.fg('family'));
    			add_location(span3, file, 131, 8, 3390);
    			attr(span4, "class", span4_class_value = ctx.fg('career'));
    			add_location(span4, file, 133, 8, 3452);
    			attr(td3, "class", "svelte-23rsga");
    			add_location(td3, file, 124, 6, 3146);
    			add_location(tr1, file, 122, 4, 3111);
    			attr(td4, "class", "svelte-23rsga");
    			add_location(td4, file, 139, 6, 3650);
    			attr(td5, "class", "svelte-23rsga");
    			add_location(td5, file, 140, 6, 3677);
    			add_location(tr2, file, 138, 4, 3638);
    			attr(td6, "class", "svelte-23rsga");
    			add_location(td6, file, 149, 6, 4075);
    			add_location(br0, file, 155, 8, 4249);
    			add_location(br1, file, 163, 8, 4547);
    			add_location(br2, file, 168, 8, 4697);
    			attr(span5, "class", "shiny-inline");
    			add_location(span5, file, 169, 8, 4713);
    			attr(span6, "class", "shiny-inline");
    			set_style(span6, "box-shadow", "inset 0px 0px 0px 4px rgba(0,0,255, 1)");
    			add_location(span6, file, 171, 8, 4797);
    			attr(td7, "class", "svelte-23rsga");
    			add_location(td7, file, 150, 6, 4098);
    			add_location(tr3, file, 148, 4, 4063);
    		},

    		m: function mount(target, anchor) {
    			insert(target, tr0, anchor);
    			append(tr0, td0);
    			append(tr0, t1);
    			append(tr0, td1);
    			append(td1, t2);
    			append(td1, span0);
    			append(td1, t3);
    			insert(target, t4, anchor);
    			insert(target, tr1, anchor);
    			append(tr1, td2);
    			append(tr1, t6);
    			append(tr1, td3);
    			append(td3, t7);
    			append(td3, span1);
    			append(span1, t8);
    			append(td3, t9);
    			append(td3, span2);
    			append(span2, t10);
    			append(td3, t11);
    			append(td3, span3);
    			append(span3, t12);
    			append(td3, t13);
    			append(td3, span4);
    			append(span4, t14);
    			append(td3, t15);
    			insert(target, t16, anchor);
    			insert(target, tr2, anchor);
    			append(tr2, td4);
    			append(tr2, t18);
    			append(tr2, td5);
    			insert(target, t20, anchor);
    			insert(target, tr3, anchor);
    			append(tr3, td6);
    			append(tr3, t22);
    			append(tr3, td7);

    			for (var i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(td7, null);
    			}

    			append(td7, t23);
    			append(td7, br0);
    			append(td7, t24);

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(td7, null);
    			}

    			append(td7, t25);
    			append(td7, br1);
    			append(td7, t26);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(td7, null);
    			}

    			append(td7, t27);
    			append(td7, br2);
    			append(td7, t28);
    			append(td7, span5);
    			append(td7, t29);
    			append(td7, span6);
    			append(td7, t30);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.fg) && span1_class_value !== (span1_class_value = ctx.fg('self'))) {
    				attr(span1, "class", span1_class_value);
    			}

    			if ((changed.fg) && span2_class_value !== (span2_class_value = ctx.fg('friends'))) {
    				attr(span2, "class", span2_class_value);
    			}

    			if ((changed.fg) && span3_class_value !== (span3_class_value = ctx.fg('family'))) {
    				attr(span3, "class", span3_class_value);
    			}

    			if ((changed.fg) && span4_class_value !== (span4_class_value = ctx.fg('career'))) {
    				attr(span4, "class", span4_class_value);
    			}

    			if (changed.bg || changed.$game) {
    				each_value_2 = ctx.$game.statsOrder;

    				for (var i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(changed, child_ctx);
    					} else {
    						each_blocks_2[i] = create_each_block_2(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(td7, t23);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}
    				each_blocks_2.length = each_value_2.length;
    			}

    			if (changed.bg || changed.$game) {
    				each_value_1 = ctx.$game.statsOrder;

    				for (var i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(td7, t25);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}
    				each_blocks_1.length = each_value_1.length;
    			}

    			if (changed.bg || changed.$game) {
    				each_value = ctx.$game.statsOrder;

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(td7, t27);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(tr0);
    				detach(t4);
    				detach(tr1);
    				detach(t16);
    				detach(tr2);
    				detach(t20);
    				detach(tr3);
    			}

    			destroy_each(each_blocks_2, detaching);

    			destroy_each(each_blocks_1, detaching);

    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (152:8) {#each $game.statsOrder as stat}
    function create_each_block_2(ctx) {
    	var span, span_class_value;

    	return {
    		c: function create() {
    			span = element("span");
    			attr(span, "class", span_class_value = "cell " + ctx.bg(ctx.stat));
    			add_location(span, file, 152, 10, 4156);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.bg || changed.$game) && span_class_value !== (span_class_value = "cell " + ctx.bg(ctx.stat))) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (157:8) {#each $game.statsOrder as stat}
    function create_each_block_1(ctx) {
    	var span, span_class_value;

    	return {
    		c: function create() {
    			span = element("span");
    			attr(span, "class", span_class_value = "cell " + ctx.bg(ctx.stat));
    			set_style(span, "box-shadow", "inset 0px 0px 0px 4px rgba(0,0,0,0.3)");
    			add_location(span, file, 157, 10, 4309);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.bg || changed.$game) && span_class_value !== (span_class_value = "cell " + ctx.bg(ctx.stat))) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (165:8) {#each $game.statsOrder as stat}
    function create_each_block(ctx) {
    	var span, span_class_value;

    	return {
    		c: function create() {
    			span = element("span");
    			attr(span, "class", span_class_value = "cell " + ctx.bg(ctx.stat) + " darken");
    			add_location(span, file, 165, 10, 4607);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.bg || changed.$game) && span_class_value !== (span_class_value = "cell " + ctx.bg(ctx.stat) + " darken")) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    function create_fragment(ctx) {
    	var t0, table, t1, t2, t3;

    	var if_block0 = (ctx.whatPage == 'files') && create_if_block_4();

    	var if_block1 = (ctx.whatPage != 'files') && create_if_block_3(ctx);

    	var if_block2 = (ctx.whatPage == 'monstromino') && create_if_block_2(ctx);

    	var if_block3 = (ctx.whatPage == 'rainbow') && create_if_block_1();

    	var if_block4 = (ctx.whatPage == 'life') && create_if_block(ctx);

    	return {
    		c: function create() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			table = element("table");
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			t2 = space();
    			if (if_block3) if_block3.c();
    			t3 = space();
    			if (if_block4) if_block4.c();
    			attr(table, "class", "what");
    			add_location(table, file, 28, 0, 598);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, table, anchor);
    			if (if_block1) if_block1.m(table, null);
    			append(table, t1);
    			if (if_block2) if_block2.m(table, null);
    			append(table, t2);
    			if (if_block3) if_block3.m(table, null);
    			append(table, t3);
    			if (if_block4) if_block4.m(table, null);
    		},

    		p: function update(changed, ctx) {
    			if (ctx.whatPage == 'files') {
    				if (!if_block0) {
    					if_block0 = create_if_block_4();
    					if_block0.c();
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (ctx.whatPage != 'files') {
    				if (if_block1) {
    					if_block1.p(changed, ctx);
    				} else {
    					if_block1 = create_if_block_3(ctx);
    					if_block1.c();
    					if_block1.m(table, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (ctx.whatPage == 'monstromino') {
    				if (if_block2) {
    					if_block2.p(changed, ctx);
    				} else {
    					if_block2 = create_if_block_2(ctx);
    					if_block2.c();
    					if_block2.m(table, t2);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (ctx.whatPage == 'rainbow') {
    				if (!if_block3) {
    					if_block3 = create_if_block_1();
    					if_block3.c();
    					if_block3.m(table, t3);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
    			}

    			if (ctx.whatPage == 'life') {
    				if (if_block4) {
    					if_block4.p(changed, ctx);
    				} else {
    					if_block4 = create_if_block(ctx);
    					if_block4.c();
    					if_block4.m(table, null);
    				}
    			} else if (if_block4) {
    				if_block4.d(1);
    				if_block4 = null;
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (if_block0) if_block0.d(detaching);

    			if (detaching) {
    				detach(t0);
    				detach(table);
    			}

    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			if (if_block4) if_block4.d();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let $game;

    	validate_store(game, 'game');
    	subscribe($$self, game, $$value => { $game = $$value; $$invalidate('$game', $game); });

    	let { bg, fg, dream, whatPage } = $$props;

    	const writable_props = ['bg', 'fg', 'dream', 'whatPage'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console_1.warn(`<What> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ('bg' in $$props) $$invalidate('bg', bg = $$props.bg);
    		if ('fg' in $$props) $$invalidate('fg', fg = $$props.fg);
    		if ('dream' in $$props) $$invalidate('dream', dream = $$props.dream);
    		if ('whatPage' in $$props) $$invalidate('whatPage', whatPage = $$props.whatPage);
    	};

    	$$self.$$.update = ($$dirty = { whatPage: 1 }) => {
    		if ($$dirty.whatPage) { {
        console.log(whatPage);
        } }
    	};

    	return { bg, fg, dream, whatPage, $game };
    }

    class What extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, ["bg", "fg", "dream", "whatPage"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.bg === undefined && !('bg' in props)) {
    			console_1.warn("<What> was created without expected prop 'bg'");
    		}
    		if (ctx.fg === undefined && !('fg' in props)) {
    			console_1.warn("<What> was created without expected prop 'fg'");
    		}
    		if (ctx.dream === undefined && !('dream' in props)) {
    			console_1.warn("<What> was created without expected prop 'dream'");
    		}
    		if (ctx.whatPage === undefined && !('whatPage' in props)) {
    			console_1.warn("<What> was created without expected prop 'whatPage'");
    		}
    	}

    	get bg() {
    		throw new Error("<What>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set bg(value) {
    		throw new Error("<What>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fg() {
    		throw new Error("<What>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fg(value) {
    		throw new Error("<What>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dream() {
    		throw new Error("<What>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dream(value) {
    		throw new Error("<What>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get whatPage() {
    		throw new Error("<What>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set whatPage(value) {
    		throw new Error("<What>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Custom.svelte generated by Svelte v3.6.7 */

    const file$1 = "src\\Custom.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.question = list[i];
    	return child_ctx;
    }

    // (10:4) {#each ['monstromino', 'rainbow', 'life'] as question}
    function create_each_block$1(ctx) {
    	var option, t;

    	return {
    		c: function create() {
    			option = element("option");
    			t = text(ctx.question);
    			option.__value = ctx.question;
    			option.value = option.__value;
    			add_location(option, file$1, 10, 6, 240);
    		},

    		m: function mount(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t);
    		},

    		p: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(option);
    			}
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	var div, t0, select, t1, input0, t2, input1, t3, input2, t4, button, t5, dispose;

    	var each_value = ['monstromino', 'rainbow', 'life'];

    	var each_blocks = [];

    	for (var i = 0; i < 3; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	return {
    		c: function create() {
    			div = element("div");
    			t0 = text("Mode\r\n  ");
    			select = element("select");

    			for (var i = 0; i < 3; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = text("\r\n  Seed\r\n  ");
    			input0 = element("input");
    			t2 = text("\r\n   Width\r\n  ");
    			input1 = element("input");
    			t3 = text("\r\n   Height\r\n  ");
    			input2 = element("input");
    			t4 = text("\r\n   \r\n  ");
    			button = element("button");
    			t5 = text(ctx.command);
    			if (ctx.custom.mode === void 0) add_render_callback(() => ctx.select_change_handler.call(select));
    			add_location(select, file$1, 8, 2, 139);
    			add_location(input0, file$1, 14, 2, 322);
    			add_location(input1, file$1, 16, 2, 375);
    			add_location(input2, file$1, 18, 2, 430);
    			attr(button, "class", "explicit");
    			add_location(button, file$1, 20, 2, 480);
    			attr(div, "class", "board-conf");
    			add_location(div, file$1, 6, 0, 103);

    			dispose = [
    				listen(select, "change", ctx.select_change_handler),
    				listen(input0, "input", ctx.input0_input_handler),
    				listen(input1, "input", ctx.input1_input_handler),
    				listen(input2, "input", ctx.input2_input_handler),
    				listen(button, "click", ctx.playCustom)
    			];
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, select);

    			for (var i = 0; i < 3; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			select_option(select, ctx.custom.mode);

    			append(div, t1);
    			append(div, input0);

    			input0.value = ctx.custom.seed;

    			append(div, t2);
    			append(div, input1);

    			input1.value = ctx.custom.width;

    			append(div, t3);
    			append(div, input2);

    			input2.value = ctx.custom.height;

    			append(div, t4);
    			append(div, button);
    			append(button, t5);
    		},

    		p: function update(changed, ctx) {
    			if (changed.custom) select_option(select, ctx.custom.mode);
    			if (changed.custom && (input0.value !== ctx.custom.seed)) input0.value = ctx.custom.seed;
    			if (changed.custom && (input1.value !== ctx.custom.width)) input1.value = ctx.custom.width;
    			if (changed.custom && (input2.value !== ctx.custom.height)) input2.value = ctx.custom.height;

    			if (changed.command) {
    				set_data(t5, ctx.command);
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			destroy_each(each_blocks, detaching);

    			run_all(dispose);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { custom, playCustom, command = "play" } = $$props;

    	const writable_props = ['custom', 'playCustom', 'command'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Custom> was created with unknown prop '${key}'`);
    	});

    	function select_change_handler() {
    		custom.mode = select_value(this);
    		$$invalidate('custom', custom);
    	}

    	function input0_input_handler() {
    		custom.seed = this.value;
    		$$invalidate('custom', custom);
    	}

    	function input1_input_handler() {
    		custom.width = this.value;
    		$$invalidate('custom', custom);
    	}

    	function input2_input_handler() {
    		custom.height = this.value;
    		$$invalidate('custom', custom);
    	}

    	$$self.$set = $$props => {
    		if ('custom' in $$props) $$invalidate('custom', custom = $$props.custom);
    		if ('playCustom' in $$props) $$invalidate('playCustom', playCustom = $$props.playCustom);
    		if ('command' in $$props) $$invalidate('command', command = $$props.command);
    	};

    	return {
    		custom,
    		playCustom,
    		command,
    		select_change_handler,
    		input0_input_handler,
    		input1_input_handler,
    		input2_input_handler
    	};
    }

    class Custom extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, ["custom", "playCustom", "command"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.custom === undefined && !('custom' in props)) {
    			console.warn("<Custom> was created without expected prop 'custom'");
    		}
    		if (ctx.playCustom === undefined && !('playCustom' in props)) {
    			console.warn("<Custom> was created without expected prop 'playCustom'");
    		}
    	}

    	get custom() {
    		throw new Error("<Custom>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set custom(value) {
    		throw new Error("<Custom>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get playCustom() {
    		throw new Error("<Custom>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set playCustom(value) {
    		throw new Error("<Custom>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get command() {
    		throw new Error("<Custom>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set command(value) {
    		throw new Error("<Custom>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Files.svelte generated by Svelte v3.6.7 */

    const file$2 = "src\\Files.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.save = list[i];
    	return child_ctx;
    }

    // (48:10) {:else}
    function create_else_block(ctx) {
    	var span, t_value = ctx.save[0] == 'auto' ? 'AUTO' : '', t;

    	return {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			add_location(span, file$2, 48, 12, 1047);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$saves) && t_value !== (t_value = ctx.save[0] == 'auto' ? 'AUTO' : '')) {
    				set_data(t, t_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (41:10) {#if save[0] != 'auto' && save[1] != '#NEW'}
    function create_if_block$1(ctx) {
    	var button, t, button_data_tooltip_value, dispose;

    	function click_handler(...args) {
    		return ctx.click_handler(ctx, ...args);
    	}

    	return {
    		c: function create() {
    			button = element("button");
    			t = text("X");
    			attr(button, "class", "tooltip-bottom savex");
    			button.dataset.tooltip = button_data_tooltip_value = lang.tip_erase;
    			add_location(button, file$2, 41, 12, 826);
    			dispose = listen(button, "click", click_handler);
    		},

    		m: function mount(target, anchor) {
    			insert(target, button, anchor);
    			append(button, t);
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(button);
    			}

    			dispose();
    		}
    	};
    }

    // (36:4) {#each [...$saves].sort((a, b) =>        Number(a[0].substr(5)) < Number(b[0].substr(5)) ? -1 : 1      ) as save}
    function create_each_block$2(ctx) {
    	var tr, td0, t0, td1, button, t1_value = ctx.save[1] == '#NEW' ? 'Save in a new slot' : ctx.save[1], t1, t2, dispose;

    	function select_block_type(ctx) {
    		if (ctx.save[0] != 'auto' && ctx.save[1] != '#NEW') return create_if_block$1;
    		return create_else_block;
    	}

    	var current_block_type = select_block_type(ctx);
    	var if_block = current_block_type(ctx);

    	function click_handler_1(...args) {
    		return ctx.click_handler_1(ctx, ...args);
    	}

    	return {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			if_block.c();
    			t0 = space();
    			td1 = element("td");
    			button = element("button");
    			t1 = text(t1_value);
    			t2 = space();
    			add_location(td0, file$2, 39, 8, 752);
    			attr(button, "class", "save");
    			add_location(button, file$2, 52, 10, 1151);
    			add_location(td1, file$2, 51, 8, 1135);
    			add_location(tr, file$2, 38, 6, 738);
    			dispose = listen(button, "click", click_handler_1);
    		},

    		m: function mount(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			if_block.m(td0, null);
    			append(tr, t0);
    			append(tr, td1);
    			append(td1, button);
    			append(button, t1);
    			append(tr, t2);
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(changed, ctx);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);
    				if (if_block) {
    					if_block.c();
    					if_block.m(td0, null);
    				}
    			}

    			if ((changed.$saves) && t1_value !== (t1_value = ctx.save[1] == '#NEW' ? 'Save in a new slot' : ctx.save[1])) {
    				set_data(t1, t1_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(tr);
    			}

    			if_block.d();
    			dispose();
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	var div, table;

    	var each_value = [...ctx.$saves].sort(func
        );

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	return {
    		c: function create() {
    			div = element("div");
    			table = element("table");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}
    			add_location(table, file$2, 34, 2, 604);
    			attr(div, "class", "files");
    			add_location(div, file$2, 33, 0, 581);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			append(div, table);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(table, null);
    			}
    		},

    		p: function update(changed, ctx) {
    			if (changed.$saves || changed.lang) {
    				each_value = [...ctx.$saves].sort(func
        );

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(table, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function func(a, b) {
    	return Number(a[0].substr(5)) < Number(b[0].substr(5)) ? -1 : 1;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $game, $saves;

    	validate_store(game, 'game');
    	subscribe($$self, game, $$value => { $game = $$value; $$invalidate('$game', $game); });
    	validate_store(saves, 'saves');
    	subscribe($$self, saves, $$value => { $saves = $$value; $$invalidate('$saves', $saves); });

    	

      updateSaves();

      function deleteSave(id) {
        log(`Deleted ${id}`);
        $game.erase(id);
        updateSaves();
      }

      function loadSave(id) {
        log(`Loaded from ${id}`);
        $game.load(id);
        goTo($game.conf);
      }

      function newSave(id) {
        id = $game.save(id);
        updateSaves();
        log(`Saved as ${id}`);
      }

      window.onkeydown = e => {
        switch (e.code) {
          case "KeyQ":
            newSave();
            return;
        }
      };

    	function click_handler({ save }, e) {
    		return deleteSave(save[0]);
    	}

    	function click_handler_1({ save }, e) {
    		return (save[1] == '#NEW' ? newSave(save[0]) : loadSave(save[0]));
    	}

    	return {
    		deleteSave,
    		loadSave,
    		newSave,
    		$saves,
    		click_handler,
    		click_handler_1
    	};
    }

    class Files extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, []);
    	}
    }

    /* src\MonstrominoAnalysis.svelte generated by Svelte v3.6.7 */

    const file$3 = "src\\MonstrominoAnalysis.svelte";

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.move = list[i];
    	return child_ctx;
    }

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.field = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    // (14:2) {#each $game.statsOrder as field, i}
    function create_each_block_1$1(ctx) {
    	var raw_value = ctx.i == 0 ? '' : '&nbsp;', raw_before, raw_after, t0, span0, t1_value = ctx.abridgedAnalysis ? '' : ctx.field, t1, t2, span1, t3_value = bigNum(ctx.target.battler[ctx.field]), t3, span1_class_value;

    	return {
    		c: function create() {
    			raw_before = element('noscript');
    			raw_after = element('noscript');
    			t0 = space();
    			span0 = element("span");
    			t1 = text(t1_value);
    			t2 = space();
    			span1 = element("span");
    			t3 = text(t3_value);
    			attr(span0, "class", "field-name");
    			add_location(span0, file$3, 15, 4, 360);
    			attr(span1, "class", span1_class_value = ctx.fg(ctx.field));
    			add_location(span1, file$3, 16, 4, 429);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, raw_before, anchor);
    			raw_before.insertAdjacentHTML("afterend", raw_value);
    			insert(target_1, raw_after, anchor);
    			insert(target_1, t0, anchor);
    			insert(target_1, span0, anchor);
    			append(span0, t1);
    			insert(target_1, t2, anchor);
    			insert(target_1, span1, anchor);
    			append(span1, t3);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.abridgedAnalysis || changed.$game) && t1_value !== (t1_value = ctx.abridgedAnalysis ? '' : ctx.field)) {
    				set_data(t1, t1_value);
    			}

    			if ((changed.target || changed.$game) && t3_value !== (t3_value = bigNum(ctx.target.battler[ctx.field]))) {
    				set_data(t3, t3_value);
    			}

    			if ((changed.fg || changed.$game) && span1_class_value !== (span1_class_value = ctx.fg(ctx.field))) {
    				attr(span1, "class", span1_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_between(raw_before, raw_after);
    				detach(raw_before);
    				detach(raw_after);
    				detach(t0);
    				detach(span0);
    				detach(t2);
    				detach(span1);
    			}
    		}
    	};
    }

    // (22:2) {#if target.xp}
    function create_if_block_3$1(ctx) {
    	var t0_value = ctx.abridgedAnalysis ? '' : ctx.target.xp[0], t0, t1, span, t2_value = (ctx.abridgedAnalysis ? '' : '+') + bigNum(ctx.target.xp[1]), t2, span_class_value;

    	return {
    		c: function create() {
    			t0 = text(t0_value);
    			t1 = space();
    			span = element("span");
    			t2 = text(t2_value);
    			attr(span, "class", span_class_value = ctx.fg(ctx.target.xp[0]));
    			add_location(span, file$3, 23, 4, 611);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, t0, anchor);
    			insert(target_1, t1, anchor);
    			insert(target_1, span, anchor);
    			append(span, t2);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.abridgedAnalysis || changed.target) && t0_value !== (t0_value = ctx.abridgedAnalysis ? '' : ctx.target.xp[0])) {
    				set_data(t0, t0_value);
    			}

    			if ((changed.abridgedAnalysis || changed.target) && t2_value !== (t2_value = (ctx.abridgedAnalysis ? '' : '+') + bigNum(ctx.target.xp[1]))) {
    				set_data(t2, t2_value);
    			}

    			if ((changed.fg || changed.target) && span_class_value !== (span_class_value = ctx.fg(ctx.target.xp[0]))) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t0);
    				detach(t1);
    				detach(span);
    			}
    		}
    	};
    }

    // (38:4) {:else}
    function create_else_block_1(ctx) {
    	var div, nobr, span0, t0_value = ctx.move.a.isProto ? 'Made' : 'Took', t0, span0_class_value, t1, span1, t2_value = bigNum(ctx.move.damageRoll), t2, span1_class_value, t3, span2, t4_value = bigNum(ctx.move.def), t4, span2_class_value, t5;

    	function select_block_type_2(ctx) {
    		if (ctx.move.damage <= 0) return create_if_block_2$1;
    		return create_else_block_2;
    	}

    	var current_block_type = select_block_type_2(ctx);
    	var if_block = current_block_type(ctx);

    	return {
    		c: function create() {
    			div = element("div");
    			nobr = element("nobr");
    			span0 = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			span1 = element("span");
    			t2 = text(t2_value);
    			t3 = text("\r\n          -\r\n          ");
    			span2 = element("span");
    			t4 = text(t4_value);
    			t5 = space();
    			if_block.c();
    			attr(span0, "class", span0_class_value = ctx.move.a.isProto ? 'attacking' : 'defending');
    			add_location(span0, file$3, 40, 10, 1127);
    			attr(span1, "class", span1_class_value = ctx.fg('str'));
    			add_location(span1, file$3, 43, 10, 1263);
    			attr(span2, "class", span2_class_value = ctx.fg('def'));
    			add_location(span2, file$3, 45, 10, 1344);
    			add_location(nobr, file$3, 39, 8, 1109);
    			attr(div, "class", "complete-log");
    			add_location(div, file$3, 38, 6, 1073);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div, anchor);
    			append(div, nobr);
    			append(nobr, span0);
    			append(span0, t0);
    			append(nobr, t1);
    			append(nobr, span1);
    			append(span1, t2);
    			append(nobr, t3);
    			append(nobr, span2);
    			append(span2, t4);
    			append(nobr, t5);
    			if_block.m(nobr, null);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.target) && t0_value !== (t0_value = ctx.move.a.isProto ? 'Made' : 'Took')) {
    				set_data(t0, t0_value);
    			}

    			if ((changed.target) && span0_class_value !== (span0_class_value = ctx.move.a.isProto ? 'attacking' : 'defending')) {
    				attr(span0, "class", span0_class_value);
    			}

    			if ((changed.target) && t2_value !== (t2_value = bigNum(ctx.move.damageRoll))) {
    				set_data(t2, t2_value);
    			}

    			if ((changed.fg) && span1_class_value !== (span1_class_value = ctx.fg('str'))) {
    				attr(span1, "class", span1_class_value);
    			}

    			if ((changed.target) && t4_value !== (t4_value = bigNum(ctx.move.def))) {
    				set_data(t4, t4_value);
    			}

    			if ((changed.fg) && span2_class_value !== (span2_class_value = ctx.fg('def'))) {
    				attr(span2, "class", span2_class_value);
    			}

    			if (current_block_type === (current_block_type = select_block_type_2(ctx)) && if_block) {
    				if_block.p(changed, ctx);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);
    				if (if_block) {
    					if_block.c();
    					if_block.m(nobr, null);
    				}
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if_block.d();
    		}
    	};
    }

    // (34:4) {#if abridgedAnalysis}
    function create_if_block$2(ctx) {
    	var span, span_class_value;

    	function select_block_type_1(ctx) {
    		if (ctx.move.damage > 0) return create_if_block_1$1;
    		return create_else_block$1;
    	}

    	var current_block_type = select_block_type_1(ctx);
    	var if_block = current_block_type(ctx);

    	return {
    		c: function create() {
    			span = element("span");
    			if_block.c();
    			attr(span, "class", span_class_value = ctx.move.a.isProto ? 'attacking' : 'defending');
    			add_location(span, file$3, 34, 6, 919);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, span, anchor);
    			if_block.m(span, null);
    		},

    		p: function update(changed, ctx) {
    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block) {
    				if_block.p(changed, ctx);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);
    				if (if_block) {
    					if_block.c();
    					if_block.m(span, null);
    				}
    			}

    			if ((changed.target) && span_class_value !== (span_class_value = ctx.move.a.isProto ? 'attacking' : 'defending')) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			if_block.d();
    		}
    	};
    }

    // (50:10) {:else}
    function create_else_block_2(ctx) {
    	var t0, span0, t1_value = bigNum(ctx.move.damage), t1, span0_class_value, t2, span1, t3_value = bigNum(ctx.move.hp), t3, span1_class_value, t4;

    	return {
    		c: function create() {
    			t0 = text("=\r\n            ");
    			span0 = element("span");
    			t1 = text(t1_value);
    			t2 = text("\r\n            dmg,\r\n            ");
    			span1 = element("span");
    			t3 = text(t3_value);
    			t4 = text("\r\n            hp left");
    			attr(span0, "class", span0_class_value = ctx.fg('str'));
    			add_location(span0, file$3, 51, 12, 1544);
    			attr(span1, "class", span1_class_value = ctx.move.a.isProto ? 'attacking' : 'defending');
    			add_location(span1, file$3, 53, 12, 1628);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, t0, anchor);
    			insert(target_1, span0, anchor);
    			append(span0, t1);
    			insert(target_1, t2, anchor);
    			insert(target_1, span1, anchor);
    			append(span1, t3);
    			insert(target_1, t4, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.target) && t1_value !== (t1_value = bigNum(ctx.move.damage))) {
    				set_data(t1, t1_value);
    			}

    			if ((changed.fg) && span0_class_value !== (span0_class_value = ctx.fg('str'))) {
    				attr(span0, "class", span0_class_value);
    			}

    			if ((changed.target) && t3_value !== (t3_value = bigNum(ctx.move.hp))) {
    				set_data(t3, t3_value);
    			}

    			if ((changed.target) && span1_class_value !== (span1_class_value = ctx.move.a.isProto ? 'attacking' : 'defending')) {
    				attr(span1, "class", span1_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t0);
    				detach(span0);
    				detach(t2);
    				detach(span1);
    				detach(t4);
    			}
    		}
    	};
    }

    // (47:10) {#if move.damage <= 0}
    function create_if_block_2$1(ctx) {
    	var t0, span, t1, span_class_value;

    	return {
    		c: function create() {
    			t0 = text("=\r\n            ");
    			span = element("span");
    			t1 = text("no damage");
    			attr(span, "class", span_class_value = ctx.fg('def'));
    			add_location(span, file$3, 48, 12, 1456);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, t0, anchor);
    			insert(target_1, span, anchor);
    			append(span, t1);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.fg) && span_class_value !== (span_class_value = ctx.fg('def'))) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t0);
    				detach(span);
    			}
    		}
    	};
    }

    // (36:46) {:else}
    function create_else_block$1(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("=");
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, t, anchor);
    		},

    		p: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (36:8) {#if move.damage > 0}
    function create_if_block_1$1(ctx) {
    	var t_value = bigNum(ctx.move.hp), t;

    	return {
    		c: function create() {
    			t = text(t_value);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, t, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.target) && t_value !== (t_value = bigNum(ctx.move.hp))) {
    				set_data(t, t_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (33:2) {#each target.battle.log as move}
    function create_each_block$3(ctx) {
    	var t, span;

    	function select_block_type(ctx) {
    		if (ctx.abridgedAnalysis) return create_if_block$2;
    		return create_else_block_1;
    	}

    	var current_block_type = select_block_type(ctx);
    	var if_block = current_block_type(ctx);

    	return {
    		c: function create() {
    			if_block.c();
    			t = space();
    			span = element("span");
    			add_location(span, file$3, 61, 4, 1825);
    		},

    		m: function mount(target_1, anchor) {
    			if_block.m(target_1, anchor);
    			insert(target_1, t, anchor);
    			insert(target_1, span, anchor);
    		},

    		p: function update(changed, ctx) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(changed, ctx);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);
    				if (if_block) {
    					if_block.c();
    					if_block.m(t.parentNode, t);
    				}
    			}
    		},

    		d: function destroy(detaching) {
    			if_block.d(detaching);

    			if (detaching) {
    				detach(t);
    				detach(span);
    			}
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	var div0, t0, div1, t1, t2_value = ctx.abridgedAnalysis ? '' : 'score', t2, t3, span0, t4, t5_value = ctx.target.score, t5, t6, div2, t7, span1, t8_value = ctx.target.battle.outcome.toUpperCase(), t8, span1_class_value;

    	var each_value_1 = ctx.$game.statsOrder;

    	var each_blocks_1 = [];

    	for (var i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	var if_block = (ctx.target.xp) && create_if_block_3$1(ctx);

    	var each_value = ctx.target.battle.log;

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	return {
    		c: function create() {
    			div0 = element("div");

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t0 = space();
    			div1 = element("div");
    			if (if_block) if_block.c();
    			t1 = space();
    			t2 = text(t2_value);
    			t3 = space();
    			span0 = element("span");
    			t4 = text("+ ");
    			t5 = text(t5_value);
    			t6 = space();
    			div2 = element("div");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t7 = space();
    			span1 = element("span");
    			t8 = text(t8_value);
    			attr(div0, "class", "detached-title");
    			add_location(div0, file$3, 12, 0, 250);
    			attr(span0, "class", ctx.dream);
    			add_location(span0, file$3, 28, 2, 767);
    			attr(div1, "class", "battle-outcome");
    			add_location(div1, file$3, 20, 0, 514);
    			attr(span1, "class", span1_class_value = "battle-" + ctx.target.battle.outcome);
    			add_location(span1, file$3, 63, 2, 1848);
    			attr(div2, "class", "combat-log");
    			add_location(div2, file$3, 31, 0, 822);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div0, anchor);

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div0, null);
    			}

    			insert(target_1, t0, anchor);
    			insert(target_1, div1, anchor);
    			if (if_block) if_block.m(div1, null);
    			append(div1, t1);
    			append(div1, t2);
    			append(div1, t3);
    			append(div1, span0);
    			append(span0, t4);
    			append(span0, t5);
    			insert(target_1, t6, anchor);
    			insert(target_1, div2, anchor);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div2, null);
    			}

    			append(div2, t7);
    			append(div2, span1);
    			append(span1, t8);
    		},

    		p: function update(changed, ctx) {
    			if (changed.fg || changed.$game || changed.bigNum || changed.target || changed.abridgedAnalysis) {
    				each_value_1 = ctx.$game.statsOrder;

    				for (var i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_1$1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}
    				each_blocks_1.length = each_value_1.length;
    			}

    			if (ctx.target.xp) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_3$1(ctx);
    					if_block.c();
    					if_block.m(div1, t1);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if ((changed.abridgedAnalysis) && t2_value !== (t2_value = ctx.abridgedAnalysis ? '' : 'score')) {
    				set_data(t2, t2_value);
    			}

    			if ((changed.target) && t5_value !== (t5_value = ctx.target.score)) {
    				set_data(t5, t5_value);
    			}

    			if (changed.dream) {
    				attr(span0, "class", ctx.dream);
    			}

    			if (changed.abridgedAnalysis || changed.target || changed.bigNum || changed.fg) {
    				each_value = ctx.target.battle.log;

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div2, t7);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}

    			if ((changed.target) && t8_value !== (t8_value = ctx.target.battle.outcome.toUpperCase())) {
    				set_data(t8, t8_value);
    			}

    			if ((changed.target) && span1_class_value !== (span1_class_value = "battle-" + ctx.target.battle.outcome)) {
    				attr(span1, "class", span1_class_value);
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div0);
    			}

    			destroy_each(each_blocks_1, detaching);

    			if (detaching) {
    				detach(t0);
    				detach(div1);
    			}

    			if (if_block) if_block.d();

    			if (detaching) {
    				detach(t6);
    				detach(div2);
    			}

    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $settings, $game;

    	validate_store(settings, 'settings');
    	subscribe($$self, settings, $$value => { $settings = $$value; $$invalidate('$settings', $settings); });
    	validate_store(game, 'game');
    	subscribe($$self, game, $$value => { $game = $$value; $$invalidate('$game', $game); });

    	

      let { target, fg, dream } = $$props;

      let abridgedAnalysis;

    	const writable_props = ['target', 'fg', 'dream'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<MonstrominoAnalysis> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ('target' in $$props) $$invalidate('target', target = $$props.target);
    		if ('fg' in $$props) $$invalidate('fg', fg = $$props.fg);
    		if ('dream' in $$props) $$invalidate('dream', dream = $$props.dream);
    	};

    	$$self.$$.update = ($$dirty = { $settings: 1 }) => {
    		if ($$dirty.$settings) { $$invalidate('abridgedAnalysis', abridgedAnalysis = $settings.abridgedAnalysis); }
    	};

    	return {
    		target,
    		fg,
    		dream,
    		abridgedAnalysis,
    		$game
    	};
    }

    class MonstrominoAnalysis extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, ["target", "fg", "dream"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.target === undefined && !('target' in props)) {
    			console.warn("<MonstrominoAnalysis> was created without expected prop 'target'");
    		}
    		if (ctx.fg === undefined && !('fg' in props)) {
    			console.warn("<MonstrominoAnalysis> was created without expected prop 'fg'");
    		}
    		if (ctx.dream === undefined && !('dream' in props)) {
    			console.warn("<MonstrominoAnalysis> was created without expected prop 'dream'");
    		}
    	}

    	get target() {
    		throw new Error("<MonstrominoAnalysis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set target(value) {
    		throw new Error("<MonstrominoAnalysis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fg() {
    		throw new Error("<MonstrominoAnalysis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fg(value) {
    		throw new Error("<MonstrominoAnalysis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dream() {
    		throw new Error("<MonstrominoAnalysis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dream(value) {
    		throw new Error("<MonstrominoAnalysis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\LifeAnalysis.svelte generated by Svelte v3.6.7 */

    const file$4 = "src\\LifeAnalysis.svelte";

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.field = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    // (56:4) {#if target.stats[field]}
    function create_if_block_3$2(ctx) {
    	var raw_value = ctx.i == 0 ? '' : '&nbsp;', raw_before, raw_after, t0, span0, t1_value = ctx.abridgedAnalysis ? '' : ctx.field, t1, t2, span1, t3_value = bigNum(ctx.target.stats[ctx.field]), t3, span1_class_value;

    	return {
    		c: function create() {
    			raw_before = element('noscript');
    			raw_after = element('noscript');
    			t0 = space();
    			span0 = element("span");
    			t1 = text(t1_value);
    			t2 = space();
    			span1 = element("span");
    			t3 = text(t3_value);
    			attr(span0, "class", "field-name");
    			add_location(span0, file$4, 57, 6, 1634);
    			attr(span1, "class", span1_class_value = ctx.fg(ctx.field));
    			add_location(span1, file$4, 58, 6, 1705);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, raw_before, anchor);
    			raw_before.insertAdjacentHTML("afterend", raw_value);
    			insert(target_1, raw_after, anchor);
    			insert(target_1, t0, anchor);
    			insert(target_1, span0, anchor);
    			append(span0, t1);
    			insert(target_1, t2, anchor);
    			insert(target_1, span1, anchor);
    			append(span1, t3);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.abridgedAnalysis || changed.target) && t1_value !== (t1_value = ctx.abridgedAnalysis ? '' : ctx.field)) {
    				set_data(t1, t1_value);
    			}

    			if ((changed.target) && t3_value !== (t3_value = bigNum(ctx.target.stats[ctx.field]))) {
    				set_data(t3, t3_value);
    			}

    			if ((changed.fg || changed.target) && span1_class_value !== (span1_class_value = ctx.fg(ctx.field))) {
    				attr(span1, "class", span1_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_between(raw_before, raw_after);
    				detach(raw_before);
    				detach(raw_after);
    				detach(t0);
    				detach(span0);
    				detach(t2);
    				detach(span1);
    			}
    		}
    	};
    }

    // (55:2) {#each target.game.statsOrder as field, i}
    function create_each_block$4(ctx) {
    	var if_block_anchor;

    	var if_block = (ctx.target.stats[ctx.field]) && create_if_block_3$2(ctx);

    	return {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},

    		m: function mount(target_1, anchor) {
    			if (if_block) if_block.m(target_1, anchor);
    			insert(target_1, if_block_anchor, anchor);
    		},

    		p: function update(changed, ctx) {
    			if (ctx.target.stats[ctx.field]) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_3$2(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},

    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach(if_block_anchor);
    			}
    		}
    	};
    }

    // (65:2) {#if target.outcome != 'possible'}
    function create_if_block_2$2(ctx) {
    	var span, t_value = ctx.target.outcome.toUpperCase(), t, span_class_value;

    	return {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			attr(span, "class", span_class_value = "battle-" + ctx.target.outcome);
    			add_location(span, file$4, 65, 4, 1871);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, span, anchor);
    			append(span, t);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.target) && t_value !== (t_value = ctx.target.outcome.toUpperCase())) {
    				set_data(t, t_value);
    			}

    			if ((changed.target) && span_class_value !== (span_class_value = "battle-" + ctx.target.outcome)) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (68:2) {#if target.outcome == 'possible'}
    function create_if_block$3(ctx) {
    	var t0, span, t1, t2_value = ctx.target.score, t2, t3, raw_value = ctx.abridgedAnalysis ? '' : `<span class="field-name">score</span>`, raw_before, raw_after;

    	var if_block = (ctx.target.xp) && create_if_block_1$2(ctx);

    	return {
    		c: function create() {
    			if (if_block) if_block.c();
    			t0 = space();
    			span = element("span");
    			t1 = text("+ ");
    			t2 = text(t2_value);
    			t3 = space();
    			raw_before = element('noscript');
    			raw_after = element('noscript');
    			attr(span, "class", ctx.dream);
    			add_location(span, file$4, 74, 4, 2227);
    		},

    		m: function mount(target_1, anchor) {
    			if (if_block) if_block.m(target_1, anchor);
    			insert(target_1, t0, anchor);
    			insert(target_1, span, anchor);
    			append(span, t1);
    			append(span, t2);
    			insert(target_1, t3, anchor);
    			insert(target_1, raw_before, anchor);
    			raw_before.insertAdjacentHTML("afterend", raw_value);
    			insert(target_1, raw_after, anchor);
    		},

    		p: function update(changed, ctx) {
    			if (ctx.target.xp) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_1$2(ctx);
    					if_block.c();
    					if_block.m(t0.parentNode, t0);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if ((changed.target) && t2_value !== (t2_value = ctx.target.score)) {
    				set_data(t2, t2_value);
    			}

    			if (changed.dream) {
    				attr(span, "class", ctx.dream);
    			}

    			if ((changed.abridgedAnalysis) && raw_value !== (raw_value = ctx.abridgedAnalysis ? '' : `<span class="field-name">score</span>`)) {
    				detach_between(raw_before, raw_after);
    				raw_before.insertAdjacentHTML("afterend", raw_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach(t0);
    				detach(span);
    				detach(t3);
    				detach_between(raw_before, raw_after);
    				detach(raw_before);
    				detach(raw_after);
    			}
    		}
    	};
    }

    // (69:4) {#if target.xp}
    function create_if_block_1$2(ctx) {
    	var span0, t0_value = (ctx.abridgedAnalysis ? '' : '+') + bigNum(ctx.target.xp[1]), t0, span0_class_value, t1, span1, t2_value = ctx.abridgedAnalysis ? '' : ctx.target.xp[0], t2;

    	return {
    		c: function create() {
    			span0 = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			span1 = element("span");
    			t2 = text(t2_value);
    			attr(span0, "class", span0_class_value = ctx.fg(ctx.target.xp[0]));
    			add_location(span0, file$4, 69, 6, 2022);
    			attr(span1, "class", "field-name");
    			add_location(span1, file$4, 72, 6, 2140);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, span0, anchor);
    			append(span0, t0);
    			insert(target_1, t1, anchor);
    			insert(target_1, span1, anchor);
    			append(span1, t2);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.abridgedAnalysis || changed.target) && t0_value !== (t0_value = (ctx.abridgedAnalysis ? '' : '+') + bigNum(ctx.target.xp[1]))) {
    				set_data(t0, t0_value);
    			}

    			if ((changed.fg || changed.target) && span0_class_value !== (span0_class_value = ctx.fg(ctx.target.xp[0]))) {
    				attr(span0, "class", span0_class_value);
    			}

    			if ((changed.abridgedAnalysis || changed.target) && t2_value !== (t2_value = ctx.abridgedAnalysis ? '' : ctx.target.xp[0])) {
    				set_data(t2, t2_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span0);
    				detach(t1);
    				detach(span1);
    			}
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	var div0, t0, div1, t1, t2, div2;

    	var each_value = ctx.target.game.statsOrder;

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	var if_block0 = (ctx.target.outcome != 'possible') && create_if_block_2$2(ctx);

    	var if_block1 = (ctx.target.outcome == 'possible') && create_if_block$3(ctx);

    	return {
    		c: function create() {
    			div0 = element("div");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			div1 = element("div");
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			div2 = element("div");
    			attr(div0, "class", "detached-title");
    			add_location(div0, file$4, 53, 0, 1483);
    			attr(div1, "class", "battle-outcome");
    			add_location(div1, file$4, 63, 0, 1799);
    			attr(div2, "class", "combat-log");
    			add_location(div2, file$4, 79, 0, 2368);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div0, anchor);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div0, null);
    			}

    			insert(target_1, t0, anchor);
    			insert(target_1, div1, anchor);
    			if (if_block0) if_block0.m(div1, null);
    			append(div1, t1);
    			if (if_block1) if_block1.m(div1, null);
    			insert(target_1, t2, anchor);
    			insert(target_1, div2, anchor);
    			div2.innerHTML = ctx.combatLog;
    		},

    		p: function update(changed, ctx) {
    			if (changed.target || changed.fg || changed.bigNum || changed.abridgedAnalysis) {
    				each_value = ctx.target.game.statsOrder;

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}

    			if (ctx.target.outcome != 'possible') {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    				} else {
    					if_block0 = create_if_block_2$2(ctx);
    					if_block0.c();
    					if_block0.m(div1, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (ctx.target.outcome == 'possible') {
    				if (if_block1) {
    					if_block1.p(changed, ctx);
    				} else {
    					if_block1 = create_if_block$3(ctx);
    					if_block1.c();
    					if_block1.m(div1, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (changed.combatLog) {
    				div2.innerHTML = ctx.combatLog;
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div0);
    			}

    			destroy_each(each_blocks, detaching);

    			if (detaching) {
    				detach(t0);
    				detach(div1);
    			}

    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();

    			if (detaching) {
    				detach(t2);
    				detach(div2);
    			}
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $settings, $game, $state;

    	validate_store(settings, 'settings');
    	subscribe($$self, settings, $$value => { $settings = $$value; $$invalidate('$settings', $settings); });
    	validate_store(game, 'game');
    	subscribe($$self, game, $$value => { $game = $$value; $$invalidate('$game', $game); });
    	validate_store(state, 'state');
    	subscribe($$self, state, $$value => { $state = $$value; $$invalidate('$state', $state); });

    	

      let { target, fg, dream } = $$props;

      let combatLog;
      let abridgedAnalysis;

    	const writable_props = ['target', 'fg', 'dream'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<LifeAnalysis> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ('target' in $$props) $$invalidate('target', target = $$props.target);
    		if ('fg' in $$props) $$invalidate('fg', fg = $$props.fg);
    		if ('dream' in $$props) $$invalidate('dream', dream = $$props.dream);
    	};

    	$$self.$$.update = ($$dirty = { $settings: 1, target: 1, $game: 1, $state: 1, fg: 1 }) => {
    		if ($$dirty.$settings) { $$invalidate('abridgedAnalysis', abridgedAnalysis = $settings.abridgedAnalysis); }
    		if ($$dirty.target || $$dirty.$game || $$dirty.$state || $$dirty.fg) { {
            if (target.dream) {
              let all = [];
              for (let stat of $game.statsOrder) {
                let possible = $state[stat] >= target.stats[stat];
                let s = `
        <span class=${fg(stat)}>${bigNum($state[stat])}</span>
        <span class="fg-${possible ? "green" : "red"
            }">${possible ? ">" : "<"}</span>
        <span class=${fg(stat)}>${bigNum(target.stats[stat])}</span>
        `;
                all.push(s);
              }
              $$invalidate('combatLog', combatLog = all.join("<br/>"));
            } else {
              let same;
              let other = [];
              for (let stat of $game.statsOrder) {
                let s = `<span class=${bigNum(fg(stat))}>${bigNum($state[stat])}</span>`;
                if (target.kind == stat) same = s;
                else other.push(s);
              }
              $$invalidate('combatLog', combatLog = `
      (${other.join("+")}) / 3 + ${same} = ${bigNum(
            bigNum($game.prota.power(target.kind))
          )}
      <span class="fg-${target.possible ? "green" : "red"}">${
            target.possible ? ">" : "<"
          }</span>
      <span class=${fg(target.kind)}>${bigNum(target.stats[target.kind])}</span>
      `);
            }
          } }
    	};

    	return {
    		target,
    		fg,
    		dream,
    		combatLog,
    		abridgedAnalysis
    	};
    }

    class LifeAnalysis extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, ["target", "fg", "dream"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.target === undefined && !('target' in props)) {
    			console.warn("<LifeAnalysis> was created without expected prop 'target'");
    		}
    		if (ctx.fg === undefined && !('fg' in props)) {
    			console.warn("<LifeAnalysis> was created without expected prop 'fg'");
    		}
    		if (ctx.dream === undefined && !('dream' in props)) {
    			console.warn("<LifeAnalysis> was created without expected prop 'dream'");
    		}
    	}

    	get target() {
    		throw new Error("<LifeAnalysis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set target(value) {
    		throw new Error("<LifeAnalysis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fg() {
    		throw new Error("<LifeAnalysis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fg(value) {
    		throw new Error("<LifeAnalysis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dream() {
    		throw new Error("<LifeAnalysis>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dream(value) {
    		throw new Error("<LifeAnalysis>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\App.svelte generated by Svelte v3.6.7 */
    const { Object: Object_1 } = globals;

    const file$5 = "src\\App.svelte";

    function get_each_context$5(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.line = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    function get_each_context_1$2(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.fig = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    function get_each_context_2$1(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.anim = list[i];
    	return child_ctx;
    }

    function get_each_context_3$1(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.field = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    function get_each_context_4$1(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.stat = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    // (393:0) {#if target}
    function create_if_block_7(ctx) {
    	var current_block_type_index, if_block, if_block_anchor, current;

    	var if_block_creators = [
    		create_if_block_8,
    		create_if_block_9,
    		create_if_block_10
    	];

    	var if_blocks = [];

    	function select_block_type(ctx) {
    		if (ctx.target.wasted) return 0;
    		if (ctx.$game.mode == 'monstromino' && ctx.target.battle) return 1;
    		if (ctx.$game.mode == 'life' && ctx.target.stats) return 2;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	return {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},

    		m: function mount(target_1, anchor) {
    			if (~current_block_type_index) if_blocks[current_block_type_index].m(target_1, anchor);
    			insert(target_1, if_block_anchor, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);
    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				if (if_block) {
    					group_outros();
    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});
    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];
    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					}
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				} else {
    					if_block = null;
    				}
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (~current_block_type_index) if_blocks[current_block_type_index].d(detaching);

    			if (detaching) {
    				detach(if_block_anchor);
    			}
    		}
    	};
    }

    // (413:49) 
    function create_if_block_10(ctx) {
    	var div, div_class_value, current;

    	var lifeanalysis_spread_levels = [
    		{ target: ctx.target, fg: ctx.fg, dream: ctx.dream }
    	];

    	let lifeanalysis_props = {};
    	for (var i = 0; i < lifeanalysis_spread_levels.length; i += 1) {
    		lifeanalysis_props = assign(lifeanalysis_props, lifeanalysis_spread_levels[i]);
    	}
    	var lifeanalysis = new LifeAnalysis({
    		props: lifeanalysis_props,
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			div = element("div");
    			lifeanalysis.$$.fragment.c();
    			attr(div, "style", ctx.analysisPosition);
    			attr(div, "class", div_class_value = "analysis " + (!ctx.moveTimeout ? 'analysis-shown' : ''));
    			add_location(div, file$5, 413, 4, 9764);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div, anchor);
    			mount_component(lifeanalysis, div, null);
    			ctx.div_binding_1(div);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var lifeanalysis_changes = (changed.target || changed.fg || changed.dream) ? get_spread_update(lifeanalysis_spread_levels, [
    				{ target: ctx.target, fg: ctx.fg, dream: ctx.dream }
    			]) : {};
    			lifeanalysis.$set(lifeanalysis_changes);

    			if (!current || changed.analysisPosition) {
    				attr(div, "style", ctx.analysisPosition);
    			}

    			if ((!current || changed.moveTimeout) && div_class_value !== (div_class_value = "analysis " + (!ctx.moveTimeout ? 'analysis-shown' : ''))) {
    				attr(div, "class", div_class_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(lifeanalysis.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(lifeanalysis.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			destroy_component(lifeanalysis, );

    			ctx.div_binding_1(null);
    		}
    	};
    }

    // (406:57) 
    function create_if_block_9(ctx) {
    	var div, div_class_value, current;

    	var monstrominoanalysis_spread_levels = [
    		{ target: ctx.target, fg: ctx.fg, dream: ctx.dream }
    	];

    	let monstrominoanalysis_props = {};
    	for (var i = 0; i < monstrominoanalysis_spread_levels.length; i += 1) {
    		monstrominoanalysis_props = assign(monstrominoanalysis_props, monstrominoanalysis_spread_levels[i]);
    	}
    	var monstrominoanalysis = new MonstrominoAnalysis({
    		props: monstrominoanalysis_props,
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			div = element("div");
    			monstrominoanalysis.$$.fragment.c();
    			attr(div, "style", ctx.analysisPosition);
    			attr(div, "class", div_class_value = "analysis " + (!ctx.moveTimeout ? 'analysis-shown' : ''));
    			add_location(div, file$5, 406, 4, 9509);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div, anchor);
    			mount_component(monstrominoanalysis, div, null);
    			ctx.div_binding(div);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var monstrominoanalysis_changes = (changed.target || changed.fg || changed.dream) ? get_spread_update(monstrominoanalysis_spread_levels, [
    				{ target: ctx.target, fg: ctx.fg, dream: ctx.dream }
    			]) : {};
    			monstrominoanalysis.$set(monstrominoanalysis_changes);

    			if (!current || changed.analysisPosition) {
    				attr(div, "style", ctx.analysisPosition);
    			}

    			if ((!current || changed.moveTimeout) && div_class_value !== (div_class_value = "analysis " + (!ctx.moveTimeout ? 'analysis-shown' : ''))) {
    				attr(div, "class", div_class_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(monstrominoanalysis.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(monstrominoanalysis.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			destroy_component(monstrominoanalysis, );

    			ctx.div_binding(null);
    		}
    	};
    }

    // (394:2) {#if target.wasted}
    function create_if_block_8(ctx) {
    	var div2, div0, raw0_value = lang.wasted, t, div1, raw1_value = strfmt(lang.tip_wasted, ctx.$game.wastedDelay, ctx.$game.turnsPerWastedLine), div2_class_value;

    	return {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			t = space();
    			div1 = element("div");
    			attr(div0, "class", "detached-title");
    			add_location(div0, file$5, 398, 6, 9229);
    			attr(div1, "class", "combat-log");
    			add_location(div1, file$5, 401, 6, 9308);
    			attr(div2, "style", ctx.analysisPosition);
    			attr(div2, "class", div2_class_value = "analysis width-300 " + (!ctx.moveTimeout ? 'analysis-shown' : ''));
    			add_location(div2, file$5, 394, 4, 9083);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div2, anchor);
    			append(div2, div0);
    			div0.innerHTML = raw0_value;
    			append(div2, t);
    			append(div2, div1);
    			div1.innerHTML = raw1_value;
    			ctx.div2_binding(div2);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$game) && raw1_value !== (raw1_value = strfmt(lang.tip_wasted, ctx.$game.wastedDelay, ctx.$game.turnsPerWastedLine))) {
    				div1.innerHTML = raw1_value;
    			}

    			if (changed.analysisPosition) {
    				attr(div2, "style", ctx.analysisPosition);
    			}

    			if ((changed.moveTimeout) && div2_class_value !== (div2_class_value = "analysis width-300 " + (!ctx.moveTimeout ? 'analysis-shown' : ''))) {
    				attr(div2, "class", div2_class_value);
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div2);
    			}

    			ctx.div2_binding(null);
    		}
    	};
    }

    // (451:2) {:else}
    function create_else_block$2(ctx) {
    	var button, t1, div, t2, dispose;

    	return {
    		c: function create() {
    			button = element("button");
    			button.textContent = "back";
    			t1 = space();
    			div = element("div");
    			t2 = text(ctx.page);
    			attr(button, "class", "hotkey");
    			add_location(button, file$5, 451, 4, 10916);
    			attr(div, "class", "page-title");
    			add_location(div, file$5, 452, 4, 10990);
    			dispose = listen(button, "click", ctx.click_handler_3);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, button, anchor);
    			insert(target_1, t1, anchor);
    			insert(target_1, div, anchor);
    			append(div, t2);
    		},

    		p: function update(changed, ctx) {
    			if (changed.page) {
    				set_data(t2, ctx.page);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(button);
    				detach(t1);
    				detach(div);
    			}

    			dispose();
    		}
    	};
    }

    // (434:2) {#if page == 'board'}
    function create_if_block_6(ctx) {
    	var button0, t1, div, t2, button1, t3, button1_data_tooltip_value, dispose;

    	var each_value_4 = ctx.$game.statsOrder;

    	var each_blocks = [];

    	for (var i = 0; i < each_value_4.length; i += 1) {
    		each_blocks[i] = create_each_block_4$1(get_each_context_4$1(ctx, each_value_4, i));
    	}

    	return {
    		c: function create() {
    			button0 = element("button");
    			button0.textContent = "undo";
    			t1 = space();
    			div = element("div");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			button1 = element("button");
    			t3 = text("ability");
    			attr(button0, "class", "hotkey");
    			add_location(button0, file$5, 434, 4, 10396);
    			attr(div, "class", "stats");
    			add_location(div, file$5, 435, 4, 10454);
    			attr(button1, "class", "hotkey wip tooltip-bottom");
    			button1.dataset.tooltip = button1_data_tooltip_value = lang.tip_ability;
    			add_location(button1, file$5, 447, 4, 10795);
    			dispose = listen(button0, "click", ctx.undo);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, button0, anchor);
    			insert(target_1, t1, anchor);
    			insert(target_1, div, anchor);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			insert(target_1, t2, anchor);
    			insert(target_1, button1, anchor);
    			append(button1, t3);
    		},

    		p: function update(changed, ctx) {
    			if (changed.fg || changed.$game || changed.lang || changed.bigNum || changed.$state) {
    				each_value_4 = ctx.$game.statsOrder;

    				for (var i = 0; i < each_value_4.length; i += 1) {
    					const child_ctx = get_each_context_4$1(ctx, each_value_4, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_4$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value_4.length;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(button0);
    				detach(t1);
    				detach(div);
    			}

    			destroy_each(each_blocks, detaching);

    			if (detaching) {
    				detach(t2);
    				detach(button1);
    			}

    			dispose();
    		}
    	};
    }

    // (437:6) {#each $game.statsOrder as stat, i}
    function create_each_block_4$1(ctx) {
    	var raw_value = ctx.i > 0 ? '&nbsp' : '', raw_before, raw_after, t0, span0, t1_value = ctx.stat, t1, t2, span1, t3_value = bigNum(ctx.$state[ctx.stat]), t3, t4, span1_class_value, span1_data_tooltip_value;

    	return {
    		c: function create() {
    			raw_before = element('noscript');
    			raw_after = element('noscript');
    			t0 = space();
    			span0 = element("span");
    			t1 = text(t1_value);
    			t2 = space();
    			span1 = element("span");
    			t3 = text(t3_value);
    			t4 = space();
    			attr(span0, "class", "field-name");
    			add_location(span0, file$5, 439, 8, 10566);
    			attr(span1, "class", span1_class_value = "" + ctx.fg(ctx.stat) + " tooltip-bottom");
    			span1.dataset.tooltip = span1_data_tooltip_value = lang['tip_' + ctx.stat];
    			add_location(span1, file$5, 440, 8, 10614);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, raw_before, anchor);
    			raw_before.insertAdjacentHTML("afterend", raw_value);
    			insert(target_1, raw_after, anchor);
    			insert(target_1, t0, anchor);
    			insert(target_1, span0, anchor);
    			append(span0, t1);
    			insert(target_1, t2, anchor);
    			insert(target_1, span1, anchor);
    			append(span1, t3);
    			append(span1, t4);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$game) && t1_value !== (t1_value = ctx.stat)) {
    				set_data(t1, t1_value);
    			}

    			if ((changed.$state || changed.$game) && t3_value !== (t3_value = bigNum(ctx.$state[ctx.stat]))) {
    				set_data(t3, t3_value);
    			}

    			if ((changed.$game) && span1_class_value !== (span1_class_value = "" + ctx.fg(ctx.stat) + " tooltip-bottom")) {
    				attr(span1, "class", span1_class_value);
    			}

    			if ((changed.$game) && span1_data_tooltip_value !== (span1_data_tooltip_value = lang['tip_' + ctx.stat])) {
    				span1.dataset.tooltip = span1_data_tooltip_value;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_between(raw_before, raw_after);
    				detach(raw_before);
    				detach(raw_after);
    				detach(t0);
    				detach(span0);
    				detach(t2);
    				detach(span1);
    			}
    		}
    	};
    }

    // (458:4) {#if page == 'board'}
    function create_if_block_4$1(ctx) {
    	var span0, t1, span1, t2_value = bigNum(ctx.$state.score), t2, span1_class_value, span1_data_tooltip_value, t3, t4, span2, t6, span3, t7_value = ctx.Math.round(ctx.$state.turns), t7;

    	var if_block = (ctx.$conf.goal) && create_if_block_5(ctx);

    	return {
    		c: function create() {
    			span0 = element("span");
    			span0.textContent = "score";
    			t1 = space();
    			span1 = element("span");
    			t2 = text(t2_value);
    			t3 = space();
    			if (if_block) if_block.c();
    			t4 = space();
    			span2 = element("span");
    			span2.textContent = "turns";
    			t6 = space();
    			span3 = element("span");
    			t7 = text(t7_value);
    			attr(span0, "class", "field-name");
    			add_location(span0, file$5, 458, 6, 11121);
    			attr(span1, "class", span1_class_value = "" + ctx.dream + " tooltip-bottom");
    			span1.dataset.tooltip = span1_data_tooltip_value = lang.tip_score;
    			add_location(span1, file$5, 459, 6, 11166);
    			attr(span2, "class", "field-name");
    			add_location(span2, file$5, 465, 6, 11388);
    			add_location(span3, file$5, 466, 6, 11433);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, span0, anchor);
    			insert(target_1, t1, anchor);
    			insert(target_1, span1, anchor);
    			append(span1, t2);
    			insert(target_1, t3, anchor);
    			if (if_block) if_block.m(target_1, anchor);
    			insert(target_1, t4, anchor);
    			insert(target_1, span2, anchor);
    			insert(target_1, t6, anchor);
    			insert(target_1, span3, anchor);
    			append(span3, t7);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$state) && t2_value !== (t2_value = bigNum(ctx.$state.score))) {
    				set_data(t2, t2_value);
    			}

    			if (ctx.$conf.goal) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_5(ctx);
    					if_block.c();
    					if_block.m(t4.parentNode, t4);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if ((changed.$state) && t7_value !== (t7_value = ctx.Math.round(ctx.$state.turns))) {
    				set_data(t7, t7_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span0);
    				detach(t1);
    				detach(span1);
    				detach(t3);
    			}

    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach(t4);
    				detach(span2);
    				detach(t6);
    				detach(span3);
    			}
    		}
    	};
    }

    // (463:6) {#if $conf.goal}
    function create_if_block_5(ctx) {
    	var span, t0, t1_value = ctx.$conf.goal, t1, span_class_value;

    	return {
    		c: function create() {
    			span = element("span");
    			t0 = text("/");
    			t1 = text(t1_value);
    			attr(span, "class", span_class_value = "field-name " + ctx.dream);
    			add_location(span, file$5, 463, 8, 11314);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, span, anchor);
    			append(span, t0);
    			append(span, t1);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$conf) && t1_value !== (t1_value = ctx.$conf.goal)) {
    				set_data(t1, t1_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}
    		}
    	};
    }

    // (495:6) {#if i > 0}
    function create_if_block_3$3(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text(" ");
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (494:4) {#each $game.colorsList.slice(2) as field, i}
    function create_each_block_3$1(ctx) {
    	var t0, t1_value = bigNum(ctx.$debrief[ctx.field]), t1, t2, span, t3_value = ctx.field, t3, span_class_value;

    	var if_block = (ctx.i > 0) && create_if_block_3$3();

    	return {
    		c: function create() {
    			if (if_block) if_block.c();
    			t0 = text("\r\n      + ");
    			t1 = text(t1_value);
    			t2 = space();
    			span = element("span");
    			t3 = text(t3_value);
    			attr(span, "class", span_class_value = ctx.fg(ctx.field));
    			add_location(span, file$5, 496, 6, 12316);
    		},

    		m: function mount(target_1, anchor) {
    			if (if_block) if_block.m(target_1, anchor);
    			insert(target_1, t0, anchor);
    			insert(target_1, t1, anchor);
    			insert(target_1, t2, anchor);
    			insert(target_1, span, anchor);
    			append(span, t3);
    		},

    		p: function update(changed, ctx) {
    			if (ctx.i > 0) {
    				if (!if_block) {
    					if_block = create_if_block_3$3();
    					if_block.c();
    					if_block.m(t0.parentNode, t0);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if ((changed.$debrief || changed.$game) && t1_value !== (t1_value = bigNum(ctx.$debrief[ctx.field]))) {
    				set_data(t1, t1_value);
    			}

    			if ((changed.$game) && t3_value !== (t3_value = ctx.field)) {
    				set_data(t3, t3_value);
    			}

    			if ((changed.$game) && span_class_value !== (span_class_value = ctx.fg(ctx.field))) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach(t0);
    				detach(t1);
    				detach(t2);
    				detach(span);
    			}
    		}
    	};
    }

    // (524:2) {#if page == 'board'}
    function create_if_block_2$3(ctx) {
    	var t0, div2, div0, t1_value = ctx.Math.floor(ctx.$state.turnsToWaste), t1, t2, span, t4, div1, t5, t6, current, dispose;

    	var custom0_spread_levels = [
    		{ custom: ctx.custom, playCustom: ctx.playCustom },
    		{ command: "Restart" }
    	];

    	let custom0_props = {};
    	for (var i = 0; i < custom0_spread_levels.length; i += 1) {
    		custom0_props = assign(custom0_props, custom0_spread_levels[i]);
    	}
    	var custom0 = new Custom({ props: custom0_props, $$inline: true });

    	var each_value_2 = ctx.particles;

    	var each_blocks_1 = [];

    	for (var i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_1[i] = create_each_block_2$1(get_each_context_2$1(ctx, each_value_2, i));
    	}

    	var each_value_1 = ctx.$board;

    	var each_blocks = [];

    	for (var i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1$2(get_each_context_1$2(ctx, each_value_1, i));
    	}

    	var custom1_spread_levels = [
    		{ custom: ctx.custom, playCustom: ctx.playCustom }
    	];

    	let custom1_props = {};
    	for (var i = 0; i < custom1_spread_levels.length; i += 1) {
    		custom1_props = assign(custom1_props, custom1_spread_levels[i]);
    	}
    	var custom1 = new Custom({ props: custom1_props, $$inline: true });

    	return {
    		c: function create() {
    			custom0.$$.fragment.c();
    			t0 = space();
    			div2 = element("div");
    			div0 = element("div");
    			t1 = text(t1_value);
    			t2 = space();
    			span = element("span");
    			span.textContent = "turns";
    			t4 = space();
    			div1 = element("div");

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t5 = space();

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t6 = space();
    			custom1.$$.fragment.c();
    			attr(span, "class", "field-name");
    			add_location(span, file$5, 535, 8, 13404);
    			attr(div0, "class", "waste-line");
    			set_style(div0, "width", "" + (20 * ctx.$conf.width + 100) + "px");
    			set_style(div0, "transform", "translateY(" + ctx.$state.wasteDepth * 20 + "px)");
    			add_location(div0, file$5, 531, 6, 13218);
    			attr(div1, "class", "animations");
    			add_location(div1, file$5, 537, 6, 13463);
    			attr(div2, "class", "board-table");
    			set_style(div2, "width", "" + 20 * ctx.$conf.width + "px");
    			add_location(div2, file$5, 525, 4, 13037);

    			dispose = [
    				listen(div2, "mousemove", ctx.hoverCell),
    				listen(div2, "mousedown", ctx.clickCell),
    				listen(div2, "mouseleave", ctx.unHoverCell)
    			];
    		},

    		m: function mount(target_1, anchor) {
    			mount_component(custom0, target_1, anchor);
    			insert(target_1, t0, anchor);
    			insert(target_1, div2, anchor);
    			append(div2, div0);
    			append(div0, t1);
    			append(div0, t2);
    			append(div0, span);
    			append(div2, t4);
    			append(div2, div1);

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div1, null);
    			}

    			append(div2, t5);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div2, null);
    			}

    			insert(target_1, t6, anchor);
    			mount_component(custom1, target_1, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var custom0_changes = (changed.custom || changed.playCustom) ? get_spread_update(custom0_spread_levels, [
    				{ custom: ctx.custom, playCustom: ctx.playCustom },
    				{ command: "Restart" }
    			]) : {};
    			custom0.$set(custom0_changes);

    			if ((!current || changed.$state) && t1_value !== (t1_value = ctx.Math.floor(ctx.$state.turnsToWaste))) {
    				set_data(t1, t1_value);
    			}

    			if (!current || changed.$conf) {
    				set_style(div0, "width", "" + (20 * ctx.$conf.width + 100) + "px");
    			}

    			if (!current || changed.$state) {
    				set_style(div0, "transform", "translateY(" + ctx.$state.wasteDepth * 20 + "px)");
    			}

    			if (changed.particles) {
    				each_value_2 = ctx.particles;

    				for (var i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2$1(ctx, each_value_2, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_2$1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}
    				each_blocks_1.length = each_value_2.length;
    			}

    			if (changed.cellClasses || changed.$board || changed.target || changed.cellStyle) {
    				each_value_1 = ctx.$board;

    				for (var i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$2(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_1$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div2, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value_1.length;
    			}

    			if (!current || changed.$conf) {
    				set_style(div2, "width", "" + 20 * ctx.$conf.width + "px");
    			}

    			var custom1_changes = (changed.custom || changed.playCustom) ? get_spread_update(custom1_spread_levels, [
    				{ custom: ctx.custom, playCustom: ctx.playCustom }
    			]) : {};
    			custom1.$set(custom1_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(custom0.$$.fragment, local);

    			transition_in(custom1.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(custom0.$$.fragment, local);
    			transition_out(custom1.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(custom0, detaching);

    			if (detaching) {
    				detach(t0);
    				detach(div2);
    			}

    			destroy_each(each_blocks_1, detaching);

    			destroy_each(each_blocks, detaching);

    			if (detaching) {
    				detach(t6);
    			}

    			destroy_component(custom1, detaching);

    			run_all(dispose);
    		}
    	};
    }

    // (539:8) {#each particles as anim}
    function create_each_block_2$1(ctx) {
    	var div, t0_value = ctx.anim.content || '', t0, t1, div_class_value, div_style_value, addDeathAnimation_action;

    	return {
    		c: function create() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			attr(div, "class", div_class_value = ctx.anim.class || 'death');
    			attr(div, "style", div_style_value = ctx.anim.style || '');
    			add_location(div, file$5, 539, 10, 13534);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div, anchor);
    			append(div, t0);
    			append(div, t1);
    			addDeathAnimation_action = addDeathAnimation.call(null, div, ctx.anim) || {};
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			if ((changed.particles) && t0_value !== (t0_value = ctx.anim.content || '')) {
    				set_data(t0, t0_value);
    			}

    			if ((changed.particles) && div_class_value !== (div_class_value = ctx.anim.class || 'death')) {
    				attr(div, "class", div_class_value);
    			}

    			if ((changed.particles) && div_style_value !== (div_style_value = ctx.anim.style || '')) {
    				attr(div, "style", div_style_value);
    			}

    			if (typeof addDeathAnimation_action.update === 'function' && changed.particles) {
    				addDeathAnimation_action.update.call(null, ctx.anim);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if (addDeathAnimation_action && typeof addDeathAnimation_action.destroy === 'function') addDeathAnimation_action.destroy();
    		}
    	};
    }

    // (549:6) {#each $board as fig, i}
    function create_each_block_1$2(ctx) {
    	var div, div_class_value, div_style_value;

    	return {
    		c: function create() {
    			div = element("div");
    			attr(div, "id", ctx.i);
    			attr(div, "class", div_class_value = "cell " + ctx.cellClasses(ctx.fig) + "\r\n          " + (ctx.fig.possible && !ctx.fig.wasted && ctx.fig == ctx.target ? 'aimed' : '') + "\r\n          " + (ctx.fig.dream && !ctx.fig.resolved && !ctx.fig.wasted ? 'shiny' : ''));
    			attr(div, "style", div_style_value = ctx.cellStyle(ctx.fig));
    			add_location(div, file$5, 549, 8, 13789);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$board || changed.target) && div_class_value !== (div_class_value = "cell " + ctx.cellClasses(ctx.fig) + "\r\n          " + (ctx.fig.possible && !ctx.fig.wasted && ctx.fig == ctx.target ? 'aimed' : '') + "\r\n          " + (ctx.fig.dream && !ctx.fig.resolved && !ctx.fig.wasted ? 'shiny' : ''))) {
    				attr(div, "class", div_class_value);
    			}

    			if ((changed.$board) && div_style_value !== (div_style_value = ctx.cellStyle(ctx.fig))) {
    				attr(div, "style", div_style_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}
    		}
    	};
    }

    // (560:2) {#if page == 'files'}
    function create_if_block_1$3(ctx) {
    	var current;

    	var files = new Files({ $$inline: true });

    	return {
    		c: function create() {
    			files.$$.fragment.c();
    		},

    		m: function mount(target_1, anchor) {
    			mount_component(files, target_1, anchor);
    			current = true;
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(files.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(files.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(files, detaching);
    		}
    	};
    }

    // (563:2) {#if page == 'settings'}
    function create_if_block$4(ctx) {
    	var div, label0, input0, t0, t1, label1, input1, t2, dispose;

    	return {
    		c: function create() {
    			div = element("div");
    			label0 = element("label");
    			input0 = element("input");
    			t0 = text("\r\n        Sound");
    			t1 = space();
    			label1 = element("label");
    			input1 = element("input");
    			t2 = text("\r\n        Shortened combat analysis");
    			attr(input0, "type", "checkbox");
    			add_location(input0, file$5, 565, 8, 14244);
    			add_location(label0, file$5, 564, 6, 14227);
    			attr(input1, "type", "checkbox");
    			add_location(input1, file$5, 569, 8, 14356);
    			add_location(label1, file$5, 568, 6, 14339);
    			attr(div, "class", "settings");
    			add_location(div, file$5, 563, 4, 14197);

    			dispose = [
    				listen(input0, "change", ctx.input0_change_handler),
    				listen(input1, "change", ctx.input1_change_handler)
    			];
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div, anchor);
    			append(div, label0);
    			append(label0, input0);

    			input0.checked = ctx.$settings.sound;

    			append(label0, t0);
    			append(div, t1);
    			append(div, label1);
    			append(label1, input1);

    			input1.checked = ctx.$settings.abridgedAnalysis;

    			append(label1, t2);
    		},

    		p: function update(changed, ctx) {
    			if (changed.$settings) input0.checked = ctx.$settings.sound;
    			if (changed.$settings) input1.checked = ctx.$settings.abridgedAnalysis;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			run_all(dispose);
    		}
    	};
    }

    // (582:2) {#each $logs as line, i}
    function create_each_block$5(ctx) {
    	var div, t_value = ctx.line, t;

    	return {
    		c: function create() {
    			div = element("div");
    			t = text(t_value);
    			add_location(div, file$5, 582, 4, 14677);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div, anchor);
    			append(div, t);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$logs) && t_value !== (t_value = ctx.line)) {
    				set_data(t, t_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	var t0, div5, div1, button0, t2, div0, button1, t4, button2, t6, button3, t8, button4, t10, div2, t11, t12, div3, t13, div4, t14, div6, updating_whatPage, t15, button5, div6_class_value, t17, div10, div7, t18_value = ctx.$state.complete ? (ctx.$state.haveMoves ? 'Board clear' : 'You have failed at life') : '', t18, t19, div9, big, t20, span0, t21_value = ctx.$debrief.score, t21, t22, br0, t23, t24_value = ctx.$debrief.dreamsResolved, t24, t25, span1, t26, t27, t28, t29_value = ctx.$debrief.turns, t29, t30, br1, t31, br2, t32, small, t33, br3, t34, u, a, t35_value = ctx.$debrief.challengeUrl, t35, a_href_value, t36, br4, t37, br5, t38, div8, button6, t40, span2, div10_class_value, t42, div11, t43, t44, t45, div12, button7, t47, div13, current, dispose;

    	var if_block0 = (ctx.target) && create_if_block_7(ctx);

    	function select_block_type_1(ctx) {
    		if (ctx.page == 'board') return create_if_block_6;
    		return create_else_block$2;
    	}

    	var current_block_type = select_block_type_1(ctx);
    	var if_block1 = current_block_type(ctx);

    	var if_block2 = (ctx.page == 'board') && create_if_block_4$1(ctx);

    	var what_1_spread_levels = [
    		{ fg: ctx.fg, bg: ctx.bg, dream: ctx.dream }
    	];

    	function what_1_whatPage_binding(value) {
    		ctx.what_1_whatPage_binding.call(null, value);
    		updating_whatPage = true;
    		add_flush_callback(() => updating_whatPage = false);
    	}

    	let what_1_props = {};
    	for (var i = 0; i < what_1_spread_levels.length; i += 1) {
    		what_1_props = assign(what_1_props, what_1_spread_levels[i]);
    	}
    	if (ctx.whatPage !== void 0) {
    		what_1_props.whatPage = ctx.whatPage;
    	}
    	var what_1 = new What({ props: what_1_props, $$inline: true });

    	binding_callbacks.push(() => bind(what_1, 'whatPage', what_1_whatPage_binding));

    	var each_value_3 = ctx.$game.colorsList.slice(2);

    	var each_blocks_1 = [];

    	for (var i = 0; i < each_value_3.length; i += 1) {
    		each_blocks_1[i] = create_each_block_3$1(get_each_context_3$1(ctx, each_value_3, i));
    	}

    	var if_block3 = (ctx.page == 'board') && create_if_block_2$3(ctx);

    	var if_block4 = (ctx.page == 'files') && create_if_block_1$3();

    	var if_block5 = (ctx.page == 'settings') && create_if_block$4(ctx);

    	var each_value = ctx.$logs;

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
    	}

    	return {
    		c: function create() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div5 = element("div");
    			div1 = element("div");
    			button0 = element("button");
    			button0.textContent = "menu";
    			t2 = space();
    			div0 = element("div");
    			button1 = element("button");
    			button1.textContent = "Board";
    			t4 = space();
    			button2 = element("button");
    			button2.textContent = "Files";
    			t6 = space();
    			button3 = element("button");
    			button3.textContent = "Settings";
    			t8 = space();
    			button4 = element("button");
    			button4.textContent = "Help";
    			t10 = space();
    			div2 = element("div");
    			t11 = space();
    			if_block1.c();
    			t12 = space();
    			div3 = element("div");
    			t13 = space();
    			div4 = element("div");
    			if (if_block2) if_block2.c();
    			t14 = space();
    			div6 = element("div");
    			what_1.$$.fragment.c();
    			t15 = space();
    			button5 = element("button");
    			button5.textContent = "Ok, got it";
    			t17 = space();
    			div10 = element("div");
    			div7 = element("div");
    			t18 = text(t18_value);
    			t19 = space();
    			div9 = element("div");
    			big = element("big");
    			t20 = text("Score:\r\n      ");
    			span0 = element("span");
    			t21 = text(t21_value);
    			t22 = text("\r\n    =\r\n    ");
    			br0 = element("br");
    			t23 = space();
    			t24 = text(t24_value);
    			t25 = space();
    			span1 = element("span");
    			t26 = text("dream");
    			t27 = text("\r\n    * 100\r\n    ");

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t28 = text("\r\n    - ");
    			t29 = text(t29_value);
    			t30 = text(" turns * 3\r\n    ");
    			br1 = element("br");
    			t31 = space();
    			br2 = element("br");
    			t32 = space();
    			small = element("small");
    			t33 = text("Challenge url - you can share it with someone who wants to try and beat\r\n      your record on this board:\r\n      ");
    			br3 = element("br");
    			t34 = space();
    			u = element("u");
    			a = element("a");
    			t35 = text(t35_value);
    			t36 = space();
    			br4 = element("br");
    			t37 = space();
    			br5 = element("br");
    			t38 = space();
    			div8 = element("div");
    			button6 = element("button");
    			button6.textContent = "Undo";
    			t40 = space();
    			span2 = element("span");
    			span2.textContent = "Or use the form at the bottom for another board/mode.";
    			t42 = space();
    			div11 = element("div");
    			if (if_block3) if_block3.c();
    			t43 = space();
    			if (if_block4) if_block4.c();
    			t44 = space();
    			if (if_block5) if_block5.c();
    			t45 = space();
    			div12 = element("div");
    			button7 = element("button");
    			button7.textContent = "Help";
    			t47 = space();
    			div13 = element("div");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}
    			add_location(button0, file$5, 424, 4, 10025);
    			add_location(button1, file$5, 426, 6, 10082);
    			add_location(button2, file$5, 427, 6, 10144);
    			add_location(button3, file$5, 428, 6, 10206);
    			add_location(button4, file$5, 429, 6, 10274);
    			attr(div0, "class", "dropdown");
    			add_location(div0, file$5, 425, 4, 10052);
    			attr(div1, "class", "menu");
    			add_location(div1, file$5, 423, 2, 9999);
    			attr(div2, "class", "spacer");
    			add_location(div2, file$5, 432, 2, 10343);
    			attr(div3, "class", "spacer");
    			add_location(div3, file$5, 455, 2, 11041);
    			attr(div4, "class", "turns");
    			add_location(div4, file$5, 456, 2, 11067);
    			attr(div5, "class", "header");
    			add_location(div5, file$5, 422, 0, 9975);
    			attr(button5, "class", "explicit");
    			add_location(button5, file$5, 473, 2, 11621);
    			attr(div6, "class", div6_class_value = "bottom panel card " + (ctx.$what ? '' : 'panel-hidden-s'));
    			add_location(div6, file$5, 471, 0, 11505);
    			attr(div7, "class", "detached-title card large-font");
    			set_style(div7, "padding", "5px");
    			add_location(div7, file$5, 479, 2, 11803);
    			attr(span0, "class", ctx.dream);
    			add_location(span0, file$5, 486, 6, 12038);
    			add_location(big, file$5, 484, 4, 12011);
    			add_location(br0, file$5, 489, 4, 12106);
    			attr(span1, "class", ctx.dream);
    			add_location(span1, file$5, 491, 4, 12149);
    			add_location(br1, file$5, 499, 4, 12407);
    			add_location(br2, file$5, 500, 4, 12419);
    			add_location(br3, file$5, 504, 6, 12559);
    			add_location(small, file$5, 501, 4, 12431);
    			attr(a, "href", a_href_value = ctx.$debrief.challengeUrl);
    			add_location(a, file$5, 507, 6, 12596);
    			add_location(u, file$5, 506, 4, 12585);
    			add_location(br4, file$5, 510, 4, 12673);
    			add_location(br5, file$5, 511, 4, 12685);
    			add_location(button6, file$5, 513, 6, 12737);
    			set_style(span2, "margin", "0px 10px");
    			add_location(span2, file$5, 514, 6, 12782);
    			attr(div8, "class", "buttons-horizontal");
    			add_location(div8, file$5, 512, 4, 12697);
    			attr(div9, "class", "card wide-lines");
    			add_location(div9, file$5, 483, 2, 11976);
    			attr(div10, "class", div10_class_value = "center panel " + (ctx.$state.complete && ctx.page == 'board' ? '' : 'panel-hidden'));
    			add_location(div10, file$5, 476, 0, 11709);
    			attr(div11, "class", "main");
    			add_location(div11, file$5, 522, 0, 12926);
    			attr(button7, "class", "important");
    			add_location(button7, file$5, 577, 2, 14534);
    			attr(div12, "class", "se-corner");
    			add_location(div12, file$5, 576, 0, 14507);
    			attr(div13, "class", "log");
    			add_location(div13, file$5, 580, 0, 14607);

    			dispose = [
    				listen(button1, "click", ctx.click_handler),
    				listen(button2, "click", ctx.click_handler_1),
    				listen(button3, "click", ctx.click_handler_2),
    				listen(button4, "click", ctx.toggleWhat),
    				listen(button5, "click", ctx.click_handler_4),
    				listen(button6, "click", ctx.undo),
    				listen(button7, "click", ctx.toggleWhat)
    			];
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target_1, anchor) {
    			if (if_block0) if_block0.m(target_1, anchor);
    			insert(target_1, t0, anchor);
    			insert(target_1, div5, anchor);
    			append(div5, div1);
    			append(div1, button0);
    			append(div1, t2);
    			append(div1, div0);
    			append(div0, button1);
    			append(div0, t4);
    			append(div0, button2);
    			append(div0, t6);
    			append(div0, button3);
    			append(div0, t8);
    			append(div0, button4);
    			append(div5, t10);
    			append(div5, div2);
    			append(div5, t11);
    			if_block1.m(div5, null);
    			append(div5, t12);
    			append(div5, div3);
    			append(div5, t13);
    			append(div5, div4);
    			if (if_block2) if_block2.m(div4, null);
    			insert(target_1, t14, anchor);
    			insert(target_1, div6, anchor);
    			mount_component(what_1, div6, null);
    			append(div6, t15);
    			append(div6, button5);
    			insert(target_1, t17, anchor);
    			insert(target_1, div10, anchor);
    			append(div10, div7);
    			append(div7, t18);
    			append(div10, t19);
    			append(div10, div9);
    			append(div9, big);
    			append(big, t20);
    			append(big, span0);
    			append(span0, t21);
    			append(div9, t22);
    			append(div9, br0);
    			append(div9, t23);
    			append(div9, t24);
    			append(div9, t25);
    			append(div9, span1);
    			append(span1, t26);
    			append(div9, t27);

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div9, null);
    			}

    			append(div9, t28);
    			append(div9, t29);
    			append(div9, t30);
    			append(div9, br1);
    			append(div9, t31);
    			append(div9, br2);
    			append(div9, t32);
    			append(div9, small);
    			append(small, t33);
    			append(small, br3);
    			append(div9, t34);
    			append(div9, u);
    			append(u, a);
    			append(a, t35);
    			append(div9, t36);
    			append(div9, br4);
    			append(div9, t37);
    			append(div9, br5);
    			append(div9, t38);
    			append(div9, div8);
    			append(div8, button6);
    			append(div8, t40);
    			append(div8, span2);
    			insert(target_1, t42, anchor);
    			insert(target_1, div11, anchor);
    			if (if_block3) if_block3.m(div11, null);
    			append(div11, t43);
    			if (if_block4) if_block4.m(div11, null);
    			append(div11, t44);
    			if (if_block5) if_block5.m(div11, null);
    			insert(target_1, t45, anchor);
    			insert(target_1, div12, anchor);
    			append(div12, button7);
    			insert(target_1, t47, anchor);
    			insert(target_1, div13, anchor);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div13, null);
    			}

    			ctx.div13_binding(div13);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (ctx.target) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_7(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();
    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});
    				check_outros();
    			}

    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block1) {
    				if_block1.p(changed, ctx);
    			} else {
    				if_block1.d(1);
    				if_block1 = current_block_type(ctx);
    				if (if_block1) {
    					if_block1.c();
    					if_block1.m(div5, t12);
    				}
    			}

    			if (ctx.page == 'board') {
    				if (if_block2) {
    					if_block2.p(changed, ctx);
    				} else {
    					if_block2 = create_if_block_4$1(ctx);
    					if_block2.c();
    					if_block2.m(div4, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			var what_1_changes = (changed.fg || changed.bg || changed.dream) ? get_spread_update(what_1_spread_levels, [
    				{ fg: ctx.fg, bg: ctx.bg, dream: ctx.dream }
    			]) : {};
    			if (!updating_whatPage && changed.whatPage) {
    				what_1_changes.whatPage = ctx.whatPage;
    			}
    			what_1.$set(what_1_changes);

    			if ((!current || changed.$what) && div6_class_value !== (div6_class_value = "bottom panel card " + (ctx.$what ? '' : 'panel-hidden-s'))) {
    				attr(div6, "class", div6_class_value);
    			}

    			if ((!current || changed.$state) && t18_value !== (t18_value = ctx.$state.complete ? (ctx.$state.haveMoves ? 'Board clear' : 'You have failed at life') : '')) {
    				set_data(t18, t18_value);
    			}

    			if ((!current || changed.$debrief) && t21_value !== (t21_value = ctx.$debrief.score)) {
    				set_data(t21, t21_value);
    			}

    			if ((!current || changed.$debrief) && t24_value !== (t24_value = ctx.$debrief.dreamsResolved)) {
    				set_data(t24, t24_value);
    			}

    			if (changed.fg || changed.$game || changed.bigNum || changed.$debrief) {
    				each_value_3 = ctx.$game.colorsList.slice(2);

    				for (var i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3$1(ctx, each_value_3, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_3$1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div9, t28);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}
    				each_blocks_1.length = each_value_3.length;
    			}

    			if ((!current || changed.$debrief) && t29_value !== (t29_value = ctx.$debrief.turns)) {
    				set_data(t29, t29_value);
    			}

    			if ((!current || changed.$debrief) && t35_value !== (t35_value = ctx.$debrief.challengeUrl)) {
    				set_data(t35, t35_value);
    			}

    			if ((!current || changed.$debrief) && a_href_value !== (a_href_value = ctx.$debrief.challengeUrl)) {
    				attr(a, "href", a_href_value);
    			}

    			if ((!current || changed.$state || changed.page) && div10_class_value !== (div10_class_value = "center panel " + (ctx.$state.complete && ctx.page == 'board' ? '' : 'panel-hidden'))) {
    				attr(div10, "class", div10_class_value);
    			}

    			if (ctx.page == 'board') {
    				if (if_block3) {
    					if_block3.p(changed, ctx);
    					transition_in(if_block3, 1);
    				} else {
    					if_block3 = create_if_block_2$3(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(div11, t43);
    				}
    			} else if (if_block3) {
    				group_outros();
    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});
    				check_outros();
    			}

    			if (ctx.page == 'files') {
    				if (!if_block4) {
    					if_block4 = create_if_block_1$3();
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(div11, t44);
    				} else {
    									transition_in(if_block4, 1);
    				}
    			} else if (if_block4) {
    				group_outros();
    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});
    				check_outros();
    			}

    			if (ctx.page == 'settings') {
    				if (if_block5) {
    					if_block5.p(changed, ctx);
    				} else {
    					if_block5 = create_if_block$4(ctx);
    					if_block5.c();
    					if_block5.m(div11, null);
    				}
    			} else if (if_block5) {
    				if_block5.d(1);
    				if_block5 = null;
    			}

    			if (changed.$logs) {
    				each_value = ctx.$logs;

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$5(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$5(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div13, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);

    			transition_in(what_1.$$.fragment, local);

    			transition_in(if_block3);
    			transition_in(if_block4);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(what_1.$$.fragment, local);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (if_block0) if_block0.d(detaching);

    			if (detaching) {
    				detach(t0);
    				detach(div5);
    			}

    			if_block1.d();
    			if (if_block2) if_block2.d();

    			if (detaching) {
    				detach(t14);
    				detach(div6);
    			}

    			destroy_component(what_1, );

    			if (detaching) {
    				detach(t17);
    				detach(div10);
    			}

    			destroy_each(each_blocks_1, detaching);

    			if (detaching) {
    				detach(t42);
    				detach(div11);
    			}

    			if (if_block3) if_block3.d();
    			if (if_block4) if_block4.d();
    			if (if_block5) if_block5.d();

    			if (detaching) {
    				detach(t45);
    				detach(div12);
    				detach(t47);
    				detach(div13);
    			}

    			destroy_each(each_blocks, detaching);

    			ctx.div13_binding(null);
    			run_all(dispose);
    		}
    	};
    }

    function goTo$1(conf) {
      window.scrollTo(0, 0);
      window.location.hash = "#" + new URLSearchParams(conf).toString();
      createGame();
    }

    function addDeathAnimation(node, anim) {
      let dy = anim.content ? -40 : -70;
      let initialY = anim.content ? -20 : 0;
      let duration = anim.content ? 1500 : 200;

      node.animate(
        [
          {
            opacity: 1,
            display: "block",
            transform: `translate(0px,${initialY}px) rotate3d(1, 0, 0, 0deg)`
          },
          {
            opacity: 0,
            display: "none",
            transform: `translate(${Math.random() * 60 -
          30}px, ${dy}px) rotate3d(${Math.random() * 180 -
          90}, ${Math.random() * 180 - 90}, ${Math.random() * 180 -
          90}, ${Math.random() * 180 - 90}deg)`
          }
        ],
        { duration, easing: "ease-out", fill: "forwards" }
      );
    }

    function toStringColor(n) {
      return "#" + ("000000" + n.toString(16)).substr(-6);
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let $game, $helpSeen, $what, $logs, $settings, $state, $conf, $debrief, $board;

    	validate_store(game, 'game');
    	subscribe($$self, game, $$value => { $game = $$value; $$invalidate('$game', $game); });
    	validate_store(helpSeen, 'helpSeen');
    	subscribe($$self, helpSeen, $$value => { $helpSeen = $$value; $$invalidate('$helpSeen', $helpSeen); });
    	validate_store(what, 'what');
    	subscribe($$self, what, $$value => { $what = $$value; $$invalidate('$what', $what); });
    	validate_store(logs, 'logs');
    	subscribe($$self, logs, $$value => { $logs = $$value; $$invalidate('$logs', $logs); });
    	validate_store(settings, 'settings');
    	subscribe($$self, settings, $$value => { $settings = $$value; $$invalidate('$settings', $settings); });
    	validate_store(state, 'state');
    	subscribe($$self, state, $$value => { $state = $$value; $$invalidate('$state', $state); });
    	validate_store(conf, 'conf');
    	subscribe($$self, conf, $$value => { $conf = $$value; $$invalidate('$conf', $conf); });
    	validate_store(debrief, 'debrief');
    	subscribe($$self, debrief, $$value => { $debrief = $$value; $$invalidate('$debrief', $debrief); });
    	validate_store(board, 'board');
    	subscribe($$self, board, $$value => { $board = $$value; $$invalidate('$board', $board); });

    	

      let paper = [new Audio("paper2.ogg"), new Audio("paper.ogg")];
      let bell = new Audio("bell.ogg");

      let target;
      let page = "board";
      let hovered;
      let mousePosition = [0, 0];
      let logDiv;
      let whatPage;

      what.subscribe(v => {
        if (v) {
          let hs = $helpSeen;
          hs[whatPage] = true;
          $helpSeen = hs; helpSeen.set($helpSeen);
        }
      });

      let modes = {
        monstromino: {
          attackable: "attackable",
          impossible: "darken"
        },
        life: {
          attackable: "attackable",
          impossible: "darken"
        },
        rainbow: {
          attackable: "attackable outlined",
          impossible: "somewhat-darken"
        }
      };

      /*let state = state1;
      stateRef.subscribe(s=>{if(s) {
        state = s;
      }})*/

      let mode;

      function fg(c) {
        return "fg-" + $game.colors(c);
      }

      function bg(c) {
        return "bg-" + $game.colors(c);
      }

      let dream = "dream" + (chrome ? " dream-animation" : "");
      let useTransition = chrome ? " transition" : "";

      let custom = {};

      conf.subscribe(v => {
        Object.assign(custom, v);
        delete custom.goal;
      });

      logs.subscribe(v => {
        console.log(logDiv);
        console.log($logs);
        if (logDiv)
          logDiv.animate(
            [
              {
                opacity: 0,
                display: "none",
                offset: 0
              },
              {
                opacity: 1,
                display: "flex",
                offset: 0.1
              },
              {
                opacity: 1,
                display: "flex",
                offset: 0.9
              },
              {
                opacity: 0,
                display: "none"
              }
            ],
            { duration: 5000, easing: "ease-out", fill: "forwards" }
          );
      });

      function clickCell(e) {
        if (e.button != 0) return;
        if (e.shiftKey) {
          $game.logFigAt(e.target.id);
        } else {
          let result = $game.attackFigAt(e.target.id);
          if (result) {
            if ($settings.sound) {
              let sound = result.dream
                ? bell
                : paper[Math.floor(Math.random() * 2)];
              sound.playbackRate =
                (1 + Math.random() * 1.3) * (result.dream ? 0.5 : 1);
              sound.volume = 0.5 + Math.random() / 2;
              sound.play();
            }
            animateDeath(result);
          }
        }
      }

      function hoverCell(e) {
        hovered = e.target.id;
      }

      function showInfo() {
        let fig = $game.figAt(hovered);
        hovered = null;
        if (!fig || fig.resolved || fig.none) {
          $$invalidate('target', target = null);
        } else {
          fig.updateAnalysis();
          $$invalidate('target', target = fig);
        }
      }

      function unHoverCell(e) {
        hovered = target = null; $$invalidate('target', target);
      }

      let analysis;

      let analysisPosition = "";

      function updateAnalysisPosition() {
        let [x, y] = mousePosition;
        let width = analysis ? analysis.offsetWidth : 400;
        let s = `left: ${
      x > window.innerWidth - width - 70 ? x - width - 50 : x + 100
    }px; top: ${Math.min(
      y,
      window.innerHeight - (analysis ? analysis.offsetHeight : 50) - 50
    )}px`;
        $$invalidate('analysisPosition', analysisPosition = s);
      }

      let moveTimeout;

      document.onmousemove = e => {
        mousePosition = [e.x, e.y];
        let movement = Math.abs(e.movementX) + Math.abs(e.movementY);
        showInfo();
        updateAnalysisPosition();

        if (movement > 4) {
          if (moveTimeout) clearTimeout(moveTimeout);
          $$invalidate('moveTimeout', moveTimeout = setTimeout(_ => {
            $$invalidate('moveTimeout', moveTimeout = null);
          }, 1000));
        }
      };

      function undo() {
        $game.undo();
        particles.length = 0; $$invalidate('particles', particles);
      }

      function toPage(p) {
        particles.length = 0; $$invalidate('particles', particles);
        hovered = target = null; $$invalidate('target', target);
        $$invalidate('page', page = p);
      }

      function playCustom() {
        $game.wipeAuto();
        goTo$1(custom);
      }

      function toggleWhat() {
        $what = !$what; what.set($what);
      }

      function cellClasses(fig) {
        let classes = [
          fig.dream ? "bg-none" : "bg-" + fig.color,
          fig.resolved && !fig.dream ? "resolved" : "",
          useTransition
        ];

        if (fig.wasted) {
          classes.push("wasted");
        } else {
          classes = classes.concat([
            fig.dream && fig.resolved && chrome ? "dream-animation" : "",
            fig.possibility == 1 ? mode.attackable : "",
            fig.dream || fig.possibility > 0 || (fig.resolved && fig.reached)
              ? ""
              : mode.impossible
          ]);
        }
        classes = classes.filter(s => s != "").join(" ");
        return classes;
      }

      function cellStyle(fig) {
        if (fig.possibility > 0 && fig.possibility < 1) {
          let color = fig.dream ? colors[fig.color].bg : "rgba(0,0,0,0.3)";
          return `box-shadow: inset 0px 0px 0px ${10 -
        8 * fig.possibility}px ${color};`;
        } else {
          return "";
        }
      }

      let particles = [];
      let animId = 1;

      function animateDeath(fig) {
        if (!fig) return;
        let text = fig.deathText;
        let tileClass =
          "death " + (text ? bg(text.class) || text.class : bg(fig.kind));

        let added = [];

        for (let cell of fig.cells) {
          added.push({
            style: `left:${(cell % $game.width) * 20}px;top:${Math.floor(
          cell / $game.width
        ) * 20}px;`,
            class: tileClass,
            id: animId++
          });    }

        if (text) {
          added.push({
            style: `left:${(fig.cells[0] % $game.width) * 20}px;top:${Math.floor(
          fig.cells[0] / $game.width
        ) * 20}px;`,
            class: "flying-text " + (fg(text.class) || text.class),
            content: bigNum(text.text),
            id: animId++
          });    }

        $$invalidate('particles', particles = particles.length > 30 ? added : particles.concat(added));
      }

      document.onkeydown = e => {
        switch (e.code) {
          case "KeyS":
            if (page == "settings") toPage("board");
            else toPage("settings");
            return;
          case "KeyF":
            if (page == "files") toPage("board");
            else toPage("files");
            return;
          case "KeyB":
            toPage("board");
            return;
          case "KeyH":
            toggleWhat();
            return;
          case "KeyU":
            undo();
            return;
        }
      };

      let colors = {
        red: [0xff0000, 0xff0000],
        orange: [0xff8000, 0xff8000],
        yellow: [0xffdd00, 0xffd700],
        green: [0x00bb00, 0x00ee00],
        cyan: [0x00bbbb, 0x00ffff],
        blue: [0x0000ff, 0x3333ff],
        violet: [0xbb00ff, 0xbb00ff],
        dream: [0x00bbbb, 0x00ffff],
        none: [0xffffff, 0xffffff]
      };

      for (let k in colors) {
        colors[k] = {
          fg: toStringColor(colors[k][0]),
          bg: toStringColor(colors[k][1])
        };  }

      let style = document.createElement("style");
      style.type = "text/css";  document.getElementsByTagName("head")[0].appendChild(style);
      style.innerHTML = Object.keys(colors)
        .map(
          color => `
    .fg-${color} { color: ${colors[color].fg}}
    .bg-${color} { background: ${colors[color].bg}}
    `
        )
        .join("\n");
    	function div2_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			$$invalidate('analysis', analysis = $$value);
    		});
    	}

    	function div_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			$$invalidate('analysis', analysis = $$value);
    		});
    	}

    	function div_binding_1($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			$$invalidate('analysis', analysis = $$value);
    		});
    	}

    	function click_handler(e) {
    		return toPage('board');
    	}

    	function click_handler_1(e) {
    		return toPage('files');
    	}

    	function click_handler_2(e) {
    		return toPage('settings');
    	}

    	function click_handler_3(e) {
    		return toPage('board');
    	}

    	function what_1_whatPage_binding(value) {
    		whatPage = value;
    		$$invalidate('whatPage', whatPage), $$invalidate('page', page), $$invalidate('$game', $game), $$invalidate('$helpSeen', $helpSeen);
    	}

    	function click_handler_4(e) {
    		const $$result = ($what = false);
    		what.set($what);
    		return $$result;
    	}

    	function input0_change_handler() {
    		settings.update($$value => ($$value.sound = this.checked, $$value));
    	}

    	function input1_change_handler() {
    		settings.update($$value => ($$value.abridgedAnalysis = this.checked, $$value));
    	}

    	function div13_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			$$invalidate('logDiv', logDiv = $$value);
    		});
    	}

    	$$self.$$.update = ($$dirty = { page: 1, $game: 1, $helpSeen: 1, whatPage: 1, modes: 1 }) => {
    		if ($$dirty.page || $$dirty.$game || $$dirty.$helpSeen || $$dirty.whatPage) { {
            if (page == "files") $$invalidate('whatPage', whatPage = "files");
            else if (page == "board") $$invalidate('whatPage', whatPage = $game.mode);
            else $$invalidate('whatPage', whatPage = undefined);
        
            if (!$helpSeen[whatPage]) {
              $what = true; what.set($what);
            }
          } }
    		if ($$dirty.modes || $$dirty.$game) { {
            mode = modes[$game.mode];
          } }
    	};

    	return {
    		target,
    		page,
    		logDiv,
    		whatPage,
    		fg,
    		bg,
    		dream,
    		custom,
    		clickCell,
    		hoverCell,
    		unHoverCell,
    		analysis,
    		analysisPosition,
    		moveTimeout,
    		undo,
    		toPage,
    		playCustom,
    		toggleWhat,
    		cellClasses,
    		cellStyle,
    		particles,
    		$game,
    		$what,
    		$logs,
    		$settings,
    		Math,
    		$state,
    		$conf,
    		$debrief,
    		$board,
    		div2_binding,
    		div_binding,
    		div_binding_1,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3,
    		what_1_whatPage_binding,
    		click_handler_4,
    		input0_change_handler,
    		input1_change_handler,
    		div13_binding
    	};
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, []);
    	}
    }

    window.onload = function() {
      createGame();

      new App({
        target: document.body
      });
    };

}());
