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
        duration: 100,
        easing: t => t
    };
    const conf = writable({});
    const debrief = writable({});
    const board = writable([]);
    const game = writable(null);
    let state;
    let settings = writable({});
    function setGameState(o) {
        if (!state)
            state = tweened(o, tween);
        else
            state.set(o);
    }
    const what = writable(true);
    what.set(localStorage.what == "no" ? false : true);
    what.subscribe(v => localStorage.setItem("what", v ? "yes" : "no"));
    settings.set(localStorage.settings ? JSON.parse(localStorage.settings) : { sound: true, abridgedAnalysis: false });
    settings.subscribe(v => localStorage.setItem("settings", JSON.stringify(v)));
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
                    description = `t${data.turns.length} ${data.conf.width}x${data.conf.height} #${data.conf.seed} ${data.date.toLocaleString()}`;
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
            this.loot();
        }
        get possible() {
            return this.reached && !this.resolved;
        }
        loot() {
        }
        get score() {
            return this.cells.length * (this.dream ? 100 : 1);
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
            return null;
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
            console.log(data);
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
            console.log(raw);
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
        init() {
        }
        play(turns = []) {
            this.init();
            this.turns = turns;
            this.score = 0;
            this.dreamsTotal = 0;
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
            for (let b of this.figs) {
                if (b.reached && !b.resolved) {
                    b.updateAnalysis();
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
            this.complete = this.dreamsResolved + this.dreamsWasted == this.dreamsTotal;
            let state = {
                turns: this.turns.length,
                score: this.score,
                complete: this.complete ? 1 : 0
            };
            Object.assign(state, this.stateExtraFields());
            setGameState(state);
            debrief.set(this.debrief);
        }
        wasted(i) {
            return (i <
                this.width *
                    Math.floor((this.turns.length - this.wastedDelay) / this.turnsPerWastedLine));
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
            let params = new URLSearchParams(this.conf);
            params.append("goal", this.score.toString());
            let url = window.location.host + window.location.pathname + "?" + params.toString();
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

    let lang = {
        what_files: `
<ol type="I">
  <li>After each your move game is saved to the AUTO slot. 
  <li>You can save in new slot, load any save or delete them with X.
</ol>  
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

    const file = "src\\What.svelte";

    // (15:2) {#if $game.mode == 'monstromino'}
    function create_if_block_1(ctx) {
    	var tr0, td0, t1, td1, t2, span, t3, t4, tr1, td2, t6, td3, t8, tr2, td4, t10, td5, t12, tr3, td6, t14, td7;

    	return {
    		c: function create() {
    			tr0 = element("tr");
    			td0 = element("td");
    			td0.textContent = "Objective";
    			t1 = space();
    			td1 = element("td");
    			t2 = text("Collect all\r\n        ");
    			span = element("span");
    			t3 = text("\r\n        dreams.");
    			t4 = space();
    			tr1 = element("tr");
    			td2 = element("td");
    			td2.textContent = "Method";
    			t6 = space();
    			td3 = element("td");
    			td3.textContent = "You can collect a dream or any other figure by clicking it. But only if\r\n        you have a path to it and can defeat it in combat.";
    			t8 = space();
    			tr2 = element("tr");
    			td4 = element("td");
    			td4.textContent = "Combat";
    			t10 = space();
    			td5 = element("td");
    			td5.textContent = "Combat is automatic and you know how it will go beforehand. It's\r\n        calculated based on yours and enemy's stats. Combat is a draw if it's\r\n        not over after 20 attacks.";
    			t12 = space();
    			tr3 = element("tr");
    			td6 = element("td");
    			td6.textContent = "Stats";
    			t14 = space();
    			td7 = element("td");
    			td7.textContent = "Enemy stats depend on their depth, size, color and neighbors. You gain\r\n        stats by defeating enemies. Mouse over your stats and score at the top\r\n        for details of what each of them do.";
    			attr(td0, "class", "svelte-23rsga");
    			add_location(td0, file, 16, 6, 250);
    			set_style(span, "margin", "15px");
    			attr(span, "class", "shiny");
    			add_location(span, file, 19, 8, 311);
    			attr(td1, "class", "svelte-23rsga");
    			add_location(td1, file, 17, 6, 276);
    			add_location(tr0, file, 15, 4, 238);
    			attr(td2, "class", "svelte-23rsga");
    			add_location(td2, file, 25, 6, 414);
    			attr(td3, "class", "svelte-23rsga");
    			add_location(td3, file, 26, 6, 437);
    			add_location(tr1, file, 24, 4, 402);
    			attr(td4, "class", "svelte-23rsga");
    			add_location(td4, file, 32, 6, 624);
    			attr(td5, "class", "svelte-23rsga");
    			add_location(td5, file, 33, 6, 647);
    			add_location(tr2, file, 31, 4, 612);
    			attr(td6, "class", "svelte-23rsga");
    			add_location(td6, file, 40, 6, 882);
    			attr(td7, "class", "svelte-23rsga");
    			add_location(td7, file, 41, 6, 904);
    			add_location(tr3, file, 39, 4, 870);
    		},

    		m: function mount(target, anchor) {
    			insert(target, tr0, anchor);
    			append(tr0, td0);
    			append(tr0, t1);
    			append(tr0, td1);
    			append(td1, t2);
    			append(td1, span);
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
    			insert(target, t12, anchor);
    			insert(target, tr3, anchor);
    			append(tr3, td6);
    			append(tr3, t14);
    			append(tr3, td7);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(tr0);
    				detach(t4);
    				detach(tr1);
    				detach(t8);
    				detach(tr2);
    				detach(t12);
    				detach(tr3);
    			}
    		}
    	};
    }

    // (49:2) {#if $game.mode == 'rainbow'}
    function create_if_block(ctx) {
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
    			t7 = text("Colors of figure you can collect are rotated in rainbow order (red>yellow>green>blue>violet).\r\n        ");
    			span1 = element("span");
    			span1.textContent = "Dream";
    			t9 = text(" can follow any color and be followed by any color.");
    			attr(td0, "class", "svelte-23rsga");
    			add_location(td0, file, 50, 6, 1198);
    			set_style(span0, "margin", "15px");
    			attr(span0, "class", "shiny");
    			add_location(span0, file, 53, 8, 1259);
    			attr(td1, "class", "svelte-23rsga");
    			add_location(td1, file, 51, 6, 1224);
    			add_location(tr0, file, 49, 4, 1186);
    			attr(td2, "class", "svelte-23rsga");
    			add_location(td2, file, 58, 6, 1368);
    			attr(span1, "style", "dream");
    			add_location(span1, file, 61, 8, 1520);
    			attr(td3, "class", "svelte-23rsga");
    			add_location(td3, file, 59, 6, 1391);
    			add_location(tr1, file, 57, 4, 1356);
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

    function create_fragment(ctx) {
    	var table, t;

    	var if_block0 = (ctx.$game.mode == 'monstromino') && create_if_block_1();

    	var if_block1 = (ctx.$game.mode == 'rainbow') && create_if_block();

    	return {
    		c: function create() {
    			table = element("table");
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			attr(table, "class", "what");
    			add_location(table, file, 12, 0, 173);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, table, anchor);
    			if (if_block0) if_block0.m(table, null);
    			append(table, t);
    			if (if_block1) if_block1.m(table, null);
    		},

    		p: function update(changed, ctx) {
    			if (ctx.$game.mode == 'monstromino') {
    				if (!if_block0) {
    					if_block0 = create_if_block_1();
    					if_block0.c();
    					if_block0.m(table, t);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (ctx.$game.mode == 'rainbow') {
    				if (!if_block1) {
    					if_block1 = create_if_block();
    					if_block1.c();
    					if_block1.m(table, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(table);
    			}

    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let $game;

    	validate_store(game, 'game');
    	subscribe($$self, game, $$value => { $game = $$value; $$invalidate('$game', $game); });

    	return { $game };
    }

    class What extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, []);
    	}
    }

    /* src\Files.svelte generated by Svelte v3.6.7 */

    const file$1 = "src\\Files.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.save = list[i];
    	return child_ctx;
    }

    // (51:8) {:else}
    function create_else_block(ctx) {
    	var span, t_value = ctx.save[0] == 'auto' ? 'AUTO' : '', t;

    	return {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			add_location(span, file$1, 51, 10, 1015);
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

    // (44:8) {#if save[0] != 'auto' && save[1] != '#NEW'}
    function create_if_block$1(ctx) {
    	var button, t, button_data_tooltip_value, dispose;

    	function click_handler(...args) {
    		return ctx.click_handler(ctx, ...args);
    	}

    	return {
    		c: function create() {
    			button = element("button");
    			t = text("X");
    			attr(button, "class", "tooltip-bottom");
    			button.dataset.tooltip = button_data_tooltip_value = lang.tip_erase;
    			add_location(button, file$1, 44, 10, 814);
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

    // (40:4) {#each [...$saves].sort((a, b) =>        Number(a[0].substr(5)) < Number(b[0].substr(5)) ? -1 : 1      ) as save}
    function create_each_block(ctx) {
    	var li, t0, button, t1_value = ctx.save[1] == '#NEW' ? 'Save in a new slot' : ctx.save[1], t1, t2, dispose;

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
    			li = element("li");
    			if_block.c();
    			t0 = space();
    			button = element("button");
    			t1 = text(t1_value);
    			t2 = space();
    			attr(button, "class", "save");
    			add_location(button, file$1, 53, 8, 1086);
    			add_location(li, file$1, 42, 6, 744);
    			dispose = listen(button, "click", click_handler_1);
    		},

    		m: function mount(target, anchor) {
    			insert(target, li, anchor);
    			if_block.m(li, null);
    			append(li, t0);
    			append(li, button);
    			append(button, t1);
    			append(li, t2);
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
    					if_block.m(li, t0);
    				}
    			}

    			if ((changed.$saves) && t1_value !== (t1_value = ctx.save[1] == '#NEW' ? 'Save in a new slot' : ctx.save[1])) {
    				set_data(t1, t1_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(li);
    			}

    			if_block.d();
    			dispose();
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	var div, ul;

    	var each_value = [...ctx.$saves].sort(func
        );

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c: function create() {
    			div = element("div");
    			ul = element("ul");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}
    			add_location(ul, file$1, 38, 2, 613);
    			attr(div, "class", "files");
    			add_location(div, file$1, 37, 0, 590);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			append(div, ul);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}
    		},

    		p: function update(changed, ctx) {
    			if (changed.$saves || changed.lang) {
    				each_value = [...ctx.$saves].sort(func
        );

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
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

    function instance$1($$self, $$props, $$invalidate) {
    	let $game, $saves;

    	validate_store(game, 'game');
    	subscribe($$self, game, $$value => { $game = $$value; $$invalidate('$game', $game); });
    	validate_store(saves, 'saves');
    	subscribe($$self, saves, $$value => { $saves = $$value; $$invalidate('$saves', $saves); });

    	

      updateSaves();

      function deleteSave(id) {
        console.log("del", id);
        $game.erase(id);
        updateSaves();
      }

      function loadSave(id) {
        console.log("load", id);
        $game.load(id);
        goTo($game.conf);
      }

      function newSave(id) {
        $game.save(id);
        updateSaves();
        console.log("new", id);
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
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, []);
    	}
    }

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
        }
        get enemy() {
            return this.bats[1];
        }
        over() {
            return this.log.length >= 20 || !this.bats.every(b => b.hp > 0);
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
            return n;
        let i;
        for (i = 0; Math.abs(n) > 10000 && i < bigNumLetters.length; i++)
            n /= 1000;
        return Math.round(n) + bigNumLetters[i];
    }
    function strfmt(fmt, ...args) {
        return fmt.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] != 'undefined'
                ? args[number]
                : match;
        });
    }

    /* src\MonstrominoAnalysis.svelte generated by Svelte v3.6.7 */

    const file$2 = "src\\MonstrominoAnalysis.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.move = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.field = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    // (18:2) {#each Battler.statsOrder as field, i}
    function create_each_block_1(ctx) {
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
    			add_location(span0, file$2, 19, 4, 401);
    			attr(span1, "class", span1_class_value = ctx.fg(ctx.field));
    			add_location(span1, file$2, 20, 4, 470);
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
    			if ((changed.abridgedAnalysis) && t1_value !== (t1_value = ctx.abridgedAnalysis ? '' : ctx.field)) {
    				set_data(t1, t1_value);
    			}

    			if ((changed.target) && t3_value !== (t3_value = bigNum(ctx.target.battler[ctx.field]))) {
    				set_data(t3, t3_value);
    			}

    			if ((changed.fg) && span1_class_value !== (span1_class_value = ctx.fg(ctx.field))) {
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

    // (26:2) {#if target.battle.outcome != 'win' || !abridgedAnalysis}
    function create_if_block_5(ctx) {
    	var span, t_value = ctx.target.battle.outcome.toUpperCase(), t, span_class_value;

    	return {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			attr(span, "class", span_class_value = "battle-" + ctx.target.battle.outcome);
    			add_location(span, file$2, 26, 4, 650);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, span, anchor);
    			append(span, t);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.target) && t_value !== (t_value = ctx.target.battle.outcome.toUpperCase())) {
    				set_data(t, t_value);
    			}

    			if ((changed.target) && span_class_value !== (span_class_value = "battle-" + ctx.target.battle.outcome)) {
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

    // (31:2) {#if target.battle.outcome == 'win'}
    function create_if_block_3(ctx) {
    	var t0, t1_value = ctx.abridgedAnalysis ? '' : 'score', t1, t2, span, t3, t4_value = ctx.target.score, t4;

    	var if_block = (ctx.target.xp) && create_if_block_4(ctx);

    	return {
    		c: function create() {
    			if (if_block) if_block.c();
    			t0 = space();
    			t1 = text(t1_value);
    			t2 = space();
    			span = element("span");
    			t3 = text("+ ");
    			t4 = text(t4_value);
    			attr(span, "class", ctx.dream);
    			add_location(span, file$2, 38, 4, 1035);
    		},

    		m: function mount(target_1, anchor) {
    			if (if_block) if_block.m(target_1, anchor);
    			insert(target_1, t0, anchor);
    			insert(target_1, t1, anchor);
    			insert(target_1, t2, anchor);
    			insert(target_1, span, anchor);
    			append(span, t3);
    			append(span, t4);
    		},

    		p: function update(changed, ctx) {
    			if (ctx.target.xp) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_4(ctx);
    					if_block.c();
    					if_block.m(t0.parentNode, t0);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if ((changed.abridgedAnalysis) && t1_value !== (t1_value = ctx.abridgedAnalysis ? '' : 'score')) {
    				set_data(t1, t1_value);
    			}

    			if ((changed.target) && t4_value !== (t4_value = ctx.target.score)) {
    				set_data(t4, t4_value);
    			}

    			if (changed.dream) {
    				attr(span, "class", ctx.dream);
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

    // (32:4) {#if target.xp}
    function create_if_block_4(ctx) {
    	var t0_value = ctx.abridgedAnalysis ? '' : ctx.target.xp[0], t0, t1, span, t2_value = (ctx.abridgedAnalysis ? '' : '+') + bigNum(ctx.target.xp[1]), t2, span_class_value;

    	return {
    		c: function create() {
    			t0 = text(t0_value);
    			t1 = space();
    			span = element("span");
    			t2 = text(t2_value);
    			attr(span, "class", span_class_value = ctx.fg(ctx.target.xp[0]));
    			add_location(span, file$2, 33, 4, 873);
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

    // (49:4) {:else}
    function create_else_block_1(ctx) {
    	var div, nobr, span0, t0_value = ctx.move.a.isProto ? 'Made' : 'Took', t0, span0_class_value, t1, span1, t2_value = bigNum(ctx.move.damageRoll), t2, span1_class_value, t3, span2, t4_value = bigNum(ctx.move.def), t4, span2_class_value, t5;

    	function select_block_type_2(ctx) {
    		if (ctx.move.damage <= 0) return create_if_block_2;
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
    			add_location(span0, file$2, 51, 10, 1404);
    			attr(span1, "class", span1_class_value = ctx.fg('str'));
    			add_location(span1, file$2, 54, 10, 1540);
    			attr(span2, "class", span2_class_value = ctx.fg('def'));
    			add_location(span2, file$2, 56, 10, 1621);
    			add_location(nobr, file$2, 50, 8, 1386);
    			attr(div, "class", "complete-log");
    			add_location(div, file$2, 49, 6, 1350);
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

    // (45:4) {#if abridgedAnalysis}
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
    			add_location(span, file$2, 45, 6, 1196);
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

    // (61:10) {:else}
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
    			add_location(span0, file$2, 62, 12, 1821);
    			attr(span1, "class", span1_class_value = ctx.move.a.isProto ? 'attacking' : 'defending');
    			add_location(span1, file$2, 64, 12, 1905);
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

    // (58:10) {#if move.damage <= 0}
    function create_if_block_2(ctx) {
    	var t0, span, t1, span_class_value;

    	return {
    		c: function create() {
    			t0 = text("=\r\n            ");
    			span = element("span");
    			t1 = text("no damage");
    			attr(span, "class", span_class_value = ctx.fg('def'));
    			add_location(span, file$2, 59, 12, 1733);
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

    // (47:46) {:else}
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

    // (47:8) {#if move.damage > 0}
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

    // (44:2) {#each target.battle.log as move}
    function create_each_block$1(ctx) {
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
    			add_location(span, file$2, 72, 4, 2102);
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

    function create_fragment$2(ctx) {
    	var div0, t0, div1, t1, t2, div2;

    	var each_value_1 = Battler.statsOrder;

    	var each_blocks_1 = [];

    	for (var i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	var if_block0 = (ctx.target.battle.outcome != 'win' || !ctx.abridgedAnalysis) && create_if_block_5(ctx);

    	var if_block1 = (ctx.target.battle.outcome == 'win') && create_if_block_3(ctx);

    	var each_value = ctx.target.battle.log;

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	return {
    		c: function create() {
    			div0 = element("div");

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t0 = space();
    			div1 = element("div");
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			div2 = element("div");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}
    			attr(div0, "class", "detached-title");
    			add_location(div0, file$2, 16, 0, 289);
    			attr(div1, "class", "battle-outcome");
    			add_location(div1, file$2, 24, 0, 555);
    			attr(div2, "class", "combat-log");
    			add_location(div2, file$2, 42, 0, 1099);
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
    			if (if_block0) if_block0.m(div1, null);
    			append(div1, t1);
    			if (if_block1) if_block1.m(div1, null);
    			insert(target_1, t2, anchor);
    			insert(target_1, div2, anchor);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div2, null);
    			}
    		},

    		p: function update(changed, ctx) {
    			if (changed.fg || changed.Battler || changed.bigNum || changed.target || changed.abridgedAnalysis) {
    				each_value_1 = Battler.statsOrder;

    				for (var i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}
    				each_blocks_1.length = each_value_1.length;
    			}

    			if (ctx.target.battle.outcome != 'win' || !ctx.abridgedAnalysis) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    				} else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					if_block0.m(div1, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (ctx.target.battle.outcome == 'win') {
    				if (if_block1) {
    					if_block1.p(changed, ctx);
    				} else {
    					if_block1 = create_if_block_3(ctx);
    					if_block1.c();
    					if_block1.m(div1, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (changed.abridgedAnalysis || changed.target || changed.bigNum || changed.fg) {
    				each_value = ctx.target.battle.log;

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div2, null);
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
    				detach(div0);
    			}

    			destroy_each(each_blocks_1, detaching);

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

    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $settings;

    	validate_store(settings, 'settings');
    	subscribe($$self, settings, $$value => { $settings = $$value; $$invalidate('$settings', $settings); });

    	

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

    	return { target, fg, dream, abridgedAnalysis };
    }

    class MonstrominoAnalysis extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, ["target", "fg", "dream"]);

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

    const file$3 = "src\\LifeAnalysis.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.field = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    // (17:2) {#each target.game.statsOrder as field, i}
    function create_each_block$2(ctx) {
    	var raw_value = ctx.i == 0 ? '' : '&nbsp;', raw_before, raw_after, t0, span0, t1_value = ctx.abridgedAnalysis ? '' : ctx.field, t1, t2, span1, t3_value = bigNum(ctx.target.state[ctx.field]), t3, span1_class_value;

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
    			add_location(span0, file$3, 18, 4, 369);
    			attr(span1, "class", span1_class_value = ctx.fg(ctx.field));
    			add_location(span1, file$3, 19, 4, 438);
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

    			if ((changed.target) && t3_value !== (t3_value = bigNum(ctx.target.state[ctx.field]))) {
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

    // (25:2) {#if target.outcome != 'possible' || !abridgedAnalysis}
    function create_if_block_2$1(ctx) {
    	var span, t_value = ctx.target.outcome.toUpperCase(), t, span_class_value;

    	return {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			attr(span, "class", span_class_value = "battle-" + ctx.target.outcome);
    			add_location(span, file$3, 25, 4, 614);
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

    // (30:2) {#if target.outcome == 'possible'}
    function create_if_block$3(ctx) {
    	var t0, t1_value = ctx.abridgedAnalysis ? '' : 'score', t1, t2, span, t3, t4_value = ctx.target.score, t4;

    	var if_block = (ctx.target.xp) && create_if_block_1$2(ctx);

    	return {
    		c: function create() {
    			if (if_block) if_block.c();
    			t0 = space();
    			t1 = text(t1_value);
    			t2 = space();
    			span = element("span");
    			t3 = text("+ ");
    			t4 = text(t4_value);
    			attr(span, "class", ctx.dream);
    			add_location(span, file$3, 37, 4, 983);
    		},

    		m: function mount(target_1, anchor) {
    			if (if_block) if_block.m(target_1, anchor);
    			insert(target_1, t0, anchor);
    			insert(target_1, t1, anchor);
    			insert(target_1, t2, anchor);
    			insert(target_1, span, anchor);
    			append(span, t3);
    			append(span, t4);
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

    			if ((changed.abridgedAnalysis) && t1_value !== (t1_value = ctx.abridgedAnalysis ? '' : 'score')) {
    				set_data(t1, t1_value);
    			}

    			if ((changed.target) && t4_value !== (t4_value = ctx.target.score)) {
    				set_data(t4, t4_value);
    			}

    			if (changed.dream) {
    				attr(span, "class", ctx.dream);
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

    // (31:4) {#if target.xp}
    function create_if_block_1$2(ctx) {
    	var t0_value = ctx.abridgedAnalysis ? '' : ctx.target.xp[0], t0, t1, span, t2_value = (ctx.abridgedAnalysis ? '' : '+') + bigNum(ctx.target.xp[1]), t2, span_class_value;

    	return {
    		c: function create() {
    			t0 = text(t0_value);
    			t1 = space();
    			span = element("span");
    			t2 = text(t2_value);
    			attr(span, "class", span_class_value = ctx.fg(ctx.target.xp[0]));
    			add_location(span, file$3, 32, 4, 821);
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

    function create_fragment$3(ctx) {
    	var div0, t0, div1, t1, t2, div2;

    	var each_value = ctx.target.game.statsOrder;

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	var if_block0 = (ctx.target.outcome != 'possible' || !ctx.abridgedAnalysis) && create_if_block_2$1(ctx);

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
    			add_location(div0, file$3, 15, 0, 253);
    			attr(div1, "class", "battle-outcome");
    			add_location(div1, file$3, 23, 0, 521);
    			attr(div2, "class", "combat-log");
    			add_location(div2, file$3, 41, 0, 1047);
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
    		},

    		p: function update(changed, ctx) {
    			if (changed.fg || changed.target || changed.bigNum || changed.abridgedAnalysis) {
    				each_value = ctx.target.game.statsOrder;

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}

    			if (ctx.target.outcome != 'possible' || !ctx.abridgedAnalysis) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    				} else {
    					if_block0 = create_if_block_2$1(ctx);
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

    function instance$3($$self, $$props, $$invalidate) {
    	let $settings;

    	validate_store(settings, 'settings');
    	subscribe($$self, settings, $$value => { $settings = $$value; $$invalidate('$settings', $settings); });

    	

      let { target, fg, dream } = $$props;

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

    	$$self.$$.update = ($$dirty = { $settings: 1 }) => {
    		if ($$dirty.$settings) { $$invalidate('abridgedAnalysis', abridgedAnalysis = $settings.abridgedAnalysis); }
    	};

    	return { target, fg, dream, abridgedAnalysis };
    }

    class LifeAnalysis extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, ["target", "fg", "dream"]);

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

    const file$4 = "src\\App.svelte";

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.question = list[i];
    	return child_ctx;
    }

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.fig = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.anim = list[i];
    	return child_ctx;
    }

    function get_each_context_3(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.field = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    function get_each_context_4(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.stat = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    // (290:0) {#if target}
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
    		if (ctx.$game.mode == "monstromino" && ctx.target.battle) return 1;
    		if (ctx.$game.mode == "life" && ctx.target.state) return 2;
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

    // (310:49) 
    function create_if_block_10(ctx) {
    	var div, div_style_value, div_class_value, current;

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
    			attr(div, "style", div_style_value = ctx.analysisPosition());
    			attr(div, "class", div_class_value = "analysis " + (!ctx.moveTimeout ? 'analysis-shown' : ''));
    			add_location(div, file$4, 310, 4, 7397);
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

    // (303:57) 
    function create_if_block_9(ctx) {
    	var div, div_style_value, div_class_value, current;

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
    			attr(div, "style", div_style_value = ctx.analysisPosition());
    			attr(div, "class", div_class_value = "analysis " + (!ctx.moveTimeout ? 'analysis-shown' : ''));
    			add_location(div, file$4, 303, 4, 7140);
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

    // (291:2) {#if target.wasted}
    function create_if_block_8(ctx) {
    	var div2, div0, raw0_value = lang.wasted, t, div1, raw1_value = strfmt(lang.tip_wasted, ctx.$game.wastedDelay, ctx.$game.turnsPerWastedLine), div2_style_value, div2_class_value;

    	return {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			t = space();
    			div1 = element("div");
    			attr(div0, "class", "detached-title");
    			add_location(div0, file$4, 295, 6, 6860);
    			attr(div1, "class", "combat-log");
    			add_location(div1, file$4, 298, 6, 6939);
    			attr(div2, "style", div2_style_value = ctx.analysisPosition());
    			attr(div2, "class", div2_class_value = "analysis width-300 " + (!ctx.moveTimeout ? 'analysis-shown' : ''));
    			add_location(div2, file$4, 291, 4, 6712);
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

    // (348:2) {:else}
    function create_else_block_1$1(ctx) {
    	var button, t1, div, t2, dispose;

    	return {
    		c: function create() {
    			button = element("button");
    			button.textContent = "back";
    			t1 = space();
    			div = element("div");
    			t2 = text(ctx.page);
    			attr(button, "class", "hotkey");
    			add_location(button, file$4, 348, 4, 8549);
    			attr(div, "class", "page-title");
    			add_location(div, file$4, 349, 4, 8623);
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

    // (331:2) {#if page == 'board'}
    function create_if_block_6(ctx) {
    	var button0, t1, div, t2, button1, t3, button1_data_tooltip_value, dispose;

    	var each_value_4 = ctx.$game.statsOrder;

    	var each_blocks = [];

    	for (var i = 0; i < each_value_4.length; i += 1) {
    		each_blocks[i] = create_each_block_4(get_each_context_4(ctx, each_value_4, i));
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
    			add_location(button0, file$4, 331, 4, 8029);
    			attr(div, "class", "stats");
    			add_location(div, file$4, 332, 4, 8087);
    			attr(button1, "class", "hotkey wip tooltip-bottom");
    			button1.dataset.tooltip = button1_data_tooltip_value = lang.tip_ability;
    			add_location(button1, file$4, 344, 4, 8428);
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
    					const child_ctx = get_each_context_4(ctx, each_value_4, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_4(child_ctx);
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

    // (334:6) {#each $game.statsOrder as stat, i}
    function create_each_block_4(ctx) {
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
    			add_location(span0, file$4, 336, 8, 8199);
    			attr(span1, "class", span1_class_value = "" + ctx.fg(ctx.stat) + " tooltip-bottom");
    			span1.dataset.tooltip = span1_data_tooltip_value = lang['tip_' + ctx.stat];
    			add_location(span1, file$4, 337, 8, 8247);
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

    // (355:4) {#if page == 'board'}
    function create_if_block_5$1(ctx) {
    	var span0, t1, span1, t2_value = bigNum(ctx.$state.score), t2, span1_class_value, span1_data_tooltip_value, t3, span2, t5, span3, t6_value = ctx.Math.round(ctx.$state.turns), t6;

    	return {
    		c: function create() {
    			span0 = element("span");
    			span0.textContent = "score";
    			t1 = space();
    			span1 = element("span");
    			t2 = text(t2_value);
    			t3 = space();
    			span2 = element("span");
    			span2.textContent = "turns";
    			t5 = space();
    			span3 = element("span");
    			t6 = text(t6_value);
    			attr(span0, "class", "field-name");
    			add_location(span0, file$4, 355, 6, 8754);
    			attr(span1, "class", span1_class_value = "" + ctx.dream + " tooltip-bottom");
    			span1.dataset.tooltip = span1_data_tooltip_value = lang.tip_score;
    			add_location(span1, file$4, 356, 6, 8799);
    			attr(span2, "class", "field-name");
    			add_location(span2, file$4, 359, 6, 8921);
    			add_location(span3, file$4, 360, 6, 8966);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, span0, anchor);
    			insert(target_1, t1, anchor);
    			insert(target_1, span1, anchor);
    			append(span1, t2);
    			insert(target_1, t3, anchor);
    			insert(target_1, span2, anchor);
    			insert(target_1, t5, anchor);
    			insert(target_1, span3, anchor);
    			append(span3, t6);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$state) && t2_value !== (t2_value = bigNum(ctx.$state.score))) {
    				set_data(t2, t2_value);
    			}

    			if ((changed.$state) && t6_value !== (t6_value = ctx.Math.round(ctx.$state.turns))) {
    				set_data(t6, t6_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span0);
    				detach(t1);
    				detach(span1);
    				detach(t3);
    				detach(span2);
    				detach(t5);
    				detach(span3);
    			}
    		}
    	};
    }

    // (369:2) {:else}
    function create_else_block$2(ctx) {
    	var current;

    	var what_1 = new What({ $$inline: true });

    	return {
    		c: function create() {
    			what_1.$$.fragment.c();
    		},

    		m: function mount(target_1, anchor) {
    			mount_component(what_1, target_1, anchor);
    			current = true;
    		},

    		p: noop,

    		i: function intro(local) {
    			if (current) return;
    			transition_in(what_1.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(what_1.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(what_1, detaching);
    		}
    	};
    }

    // (367:2) {#if page == 'files'}
    function create_if_block_4$1(ctx) {
    	var raw_value = lang.what_files, raw_before, raw_after;

    	return {
    		c: function create() {
    			raw_before = element('noscript');
    			raw_after = element('noscript');
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, raw_before, anchor);
    			raw_before.insertAdjacentHTML("afterend", raw_value);
    			insert(target_1, raw_after, anchor);
    		},

    		p: noop,
    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_between(raw_before, raw_after);
    				detach(raw_before);
    				detach(raw_after);
    			}
    		}
    	};
    }

    // (392:6) {#if i>0}
    function create_if_block_3$1(ctx) {
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

    // (391:4) {#each $game.colorsList.slice(2) as field, i}
    function create_each_block_3(ctx) {
    	var t0, t1_value = bigNum(ctx.$debrief[ctx.field]), t1, t2, span, t3_value = ctx.field, t3, span_class_value;

    	var if_block = (ctx.i>0) && create_if_block_3$1();

    	return {
    		c: function create() {
    			if (if_block) if_block.c();
    			t0 = text("\r\n      + ");
    			t1 = text(t1_value);
    			t2 = space();
    			span = element("span");
    			t3 = text(t3_value);
    			attr(span, "class", span_class_value = ctx.fg(ctx.field));
    			add_location(span, file$4, 393, 6, 9795);
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
    			if (ctx.i>0) {
    				if (!if_block) {
    					if_block = create_if_block_3$1();
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

    // (419:2) {#if page == 'board'}
    function create_if_block_2$2(ctx) {
    	var div1, div0, t0, t1, div2, t2, select, t3, input0, t4, input1, t5, input2, t6, button, dispose;

    	var each_value_2 = ctx.particles;

    	var each_blocks_2 = [];

    	for (var i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	var each_value_1 = ctx.$board;

    	var each_blocks_1 = [];

    	for (var i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	var each_value = ["monstromino", "rainbow", "life"];

    	var each_blocks = [];

    	for (var i = 0; i < 3; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	return {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");

    			for (var i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t0 = space();

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t1 = space();
    			div2 = element("div");
    			t2 = text("Mode\r\n      ");
    			select = element("select");

    			for (var i = 0; i < 3; i += 1) {
    				each_blocks[i].c();
    			}

    			t3 = text("    \r\n      Seed\r\n      ");
    			input0 = element("input");
    			t4 = text("\r\n       Width\r\n      ");
    			input1 = element("input");
    			t5 = text("\r\n       Height\r\n      ");
    			input2 = element("input");
    			t6 = text("\r\n       \r\n      ");
    			button = element("button");
    			button.textContent = "play";
    			attr(div0, "class", "particles");
    			add_location(div0, file$4, 425, 6, 10575);
    			attr(div1, "class", "board-table");
    			set_style(div1, "width", "" + 20 * ctx.$conf.width + "px");
    			add_location(div1, file$4, 419, 4, 10394);
    			if (ctx.custom.mode === void 0) add_render_callback(() => ctx.select_change_handler.call(select));
    			add_location(select, file$4, 446, 6, 11188);
    			add_location(input0, file$4, 454, 6, 11425);
    			add_location(input1, file$4, 456, 6, 11486);
    			add_location(input2, file$4, 458, 6, 11549);
    			add_location(button, file$4, 460, 6, 11607);
    			attr(div2, "class", "board-conf");
    			add_location(div2, file$4, 444, 4, 11144);

    			dispose = [
    				listen(div1, "mousemove", ctx.hoverCell),
    				listen(div1, "mousedown", ctx.clickCell),
    				listen(div1, "mouseleave", ctx.unHoverCell),
    				listen(select, "change", ctx.select_change_handler),
    				listen(input0, "input", ctx.input0_input_handler),
    				listen(input1, "input", ctx.input1_input_handler),
    				listen(input2, "input", ctx.input2_input_handler),
    				listen(button, "click", ctx.playCustom)
    			];
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div1, anchor);
    			append(div1, div0);

    			for (var i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(div0, null);
    			}

    			append(div1, t0);

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div1, null);
    			}

    			insert(target_1, t1, anchor);
    			insert(target_1, div2, anchor);
    			append(div2, t2);
    			append(div2, select);

    			for (var i = 0; i < 3; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			select_option(select, ctx.custom.mode);

    			append(div2, t3);
    			append(div2, input0);

    			input0.value = ctx.custom.seed;

    			append(div2, t4);
    			append(div2, input1);

    			input1.value = ctx.custom.width;

    			append(div2, t5);
    			append(div2, input2);

    			input2.value = ctx.custom.height;

    			append(div2, t6);
    			append(div2, button);
    		},

    		p: function update(changed, ctx) {
    			if (changed.particles) {
    				each_value_2 = ctx.particles;

    				for (var i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(changed, child_ctx);
    					} else {
    						each_blocks_2[i] = create_each_block_2(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}
    				each_blocks_2.length = each_value_2.length;
    			}

    			if (changed.cellClasses || changed.$board || changed.target) {
    				each_value_1 = ctx.$board;

    				for (var i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_1$1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}
    				each_blocks_1.length = each_value_1.length;
    			}

    			if (changed.$conf) {
    				set_style(div1, "width", "" + 20 * ctx.$conf.width + "px");
    			}

    			if (changed.custom) select_option(select, ctx.custom.mode);
    			if (changed.custom && (input0.value !== ctx.custom.seed)) input0.value = ctx.custom.seed;
    			if (changed.custom && (input1.value !== ctx.custom.width)) input1.value = ctx.custom.width;
    			if (changed.custom && (input2.value !== ctx.custom.height)) input2.value = ctx.custom.height;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div1);
    			}

    			destroy_each(each_blocks_2, detaching);

    			destroy_each(each_blocks_1, detaching);

    			if (detaching) {
    				detach(t1);
    				detach(div2);
    			}

    			destroy_each(each_blocks, detaching);

    			run_all(dispose);
    		}
    	};
    }

    // (427:8) {#each particles as anim}
    function create_each_block_2(ctx) {
    	var div, t0_value = ctx.anim.content || '', t0, t1, div_class_value, div_style_value, addDeathAnimation_action;

    	return {
    		c: function create() {
    			div = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			attr(div, "class", div_class_value = ctx.anim.class || 'death');
    			attr(div, "style", div_style_value = ctx.anim.style || '');
    			add_location(div, file$4, 427, 10, 10645);
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

    // (437:6) {#each $board as fig, i}
    function create_each_block_1$1(ctx) {
    	var div, div_class_value;

    	return {
    		c: function create() {
    			div = element("div");
    			attr(div, "id", ctx.i);
    			attr(div, "class", div_class_value = "cell " + ctx.cellClasses(ctx.fig) + "\r\n          " + (ctx.fig.possible && !ctx.fig.wasted && ctx.fig == ctx.target ? 'aimed' : '') + "\r\n          " + (ctx.fig.dream && !ctx.fig.resolved && !ctx.fig.wasted ? 'shiny' : ''));
    			add_location(div, file$4, 437, 8, 10900);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, div, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$board || changed.target) && div_class_value !== (div_class_value = "cell " + ctx.cellClasses(ctx.fig) + "\r\n          " + (ctx.fig.possible && !ctx.fig.wasted && ctx.fig == ctx.target ? 'aimed' : '') + "\r\n          " + (ctx.fig.dream && !ctx.fig.resolved && !ctx.fig.wasted ? 'shiny' : ''))) {
    				attr(div, "class", div_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}
    		}
    	};
    }

    // (448:8) {#each ["monstromino", "rainbow", "life"] as question}
    function create_each_block$3(ctx) {
    	var option, t0, t1;

    	return {
    		c: function create() {
    			option = element("option");
    			t0 = text(ctx.question);
    			t1 = space();
    			option.__value = ctx.question;
    			option.value = option.__value;
    			add_location(option, file$4, 448, 10, 11297);
    		},

    		m: function mount(target_1, anchor) {
    			insert(target_1, option, anchor);
    			append(option, t0);
    			append(option, t1);
    		},

    		p: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(option);
    			}
    		}
    	};
    }

    // (464:2) {#if page == 'files'}
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

    // (467:2) {#if page == 'settings'}
    function create_if_block$4(ctx) {
    	var div, label0, input0, t0, t1, label1, input1, t2, dispose;

    	return {
    		c: function create() {
    			div = element("div");
    			label0 = element("label");
    			input0 = element("input");
    			t0 = text("\r\n      Sound");
    			t1 = space();
    			label1 = element("label");
    			input1 = element("input");
    			t2 = text("\r\n      Shortened combat analysis");
    			attr(input0, "type", "checkbox");
    			add_location(input0, file$4, 469, 6, 11797);
    			add_location(label0, file$4, 468, 4, 11782);
    			attr(input1, "type", "checkbox");
    			add_location(input1, file$4, 473, 6, 11897);
    			add_location(label1, file$4, 472, 4, 11882);
    			attr(div, "class", "settings");
    			add_location(div, file$4, 467, 4, 11754);

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

    function create_fragment$4(ctx) {
    	var t0, div5, div1, button0, t2, div0, button1, t4, button2, t6, button3, t8, button4, t10, div2, t11, t12, div3, t13, div4, t14, div7, current_block_type_index, if_block3, t15, div6, t16, button5, div7_class_value, t18, div11, div8, t20, div10, big, t21, span0, t22_value = ctx.$debrief.score, t22, t23, br0, t24, t25_value = ctx.$debrief.dreamsResolved, t25, t26, span1, t27, t28, t29, t30_value = ctx.$debrief.turns, t30, t31, br1, t32, br2, t33, small, t34, br3, t35, u, a, t36_value = ctx.$debrief.challengeUrl, t36, a_href_value, t37, br4, t38, br5, t39, div9, button6, t41, button7, div11_class_value, t43, div12, t44, t45, current, dispose;

    	var if_block0 = (ctx.target) && create_if_block_7(ctx);

    	function select_block_type_1(ctx) {
    		if (ctx.page == 'board') return create_if_block_6;
    		return create_else_block_1$1;
    	}

    	var current_block_type = select_block_type_1(ctx);
    	var if_block1 = current_block_type(ctx);

    	var if_block2 = (ctx.page == 'board') && create_if_block_5$1(ctx);

    	var if_block_creators = [
    		create_if_block_4$1,
    		create_else_block$2
    	];

    	var if_blocks = [];

    	function select_block_type_2(ctx) {
    		if (ctx.page == 'files') return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_2(ctx);
    	if_block3 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	var each_value_3 = ctx.$game.colorsList.slice(2);

    	var each_blocks = [];

    	for (var i = 0; i < each_value_3.length; i += 1) {
    		each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    	}

    	var if_block4 = (ctx.page == 'board') && create_if_block_2$2(ctx);

    	var if_block5 = (ctx.page == 'files') && create_if_block_1$3();

    	var if_block6 = (ctx.page == 'settings') && create_if_block$4(ctx);

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
    			button1.textContent = "Help";
    			t4 = space();
    			button2 = element("button");
    			button2.textContent = "Board";
    			t6 = space();
    			button3 = element("button");
    			button3.textContent = "Files";
    			t8 = space();
    			button4 = element("button");
    			button4.textContent = "Settings";
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
    			div7 = element("div");
    			if_block3.c();
    			t15 = space();
    			div6 = element("div");
    			t16 = space();
    			button5 = element("button");
    			button5.textContent = "Ok, got it";
    			t18 = space();
    			div11 = element("div");
    			div8 = element("div");
    			div8.textContent = "Board clear";
    			t20 = space();
    			div10 = element("div");
    			big = element("big");
    			t21 = text("Score:\r\n      ");
    			span0 = element("span");
    			t22 = text(t22_value);
    			t23 = text("\r\n    =\r\n    ");
    			br0 = element("br");
    			t24 = space();
    			t25 = text(t25_value);
    			t26 = space();
    			span1 = element("span");
    			t27 = text("dream");
    			t28 = text("\r\n    * 100\r\n    ");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t29 = text("\r\n    - ");
    			t30 = text(t30_value);
    			t31 = text(" turns * 3\r\n    ");
    			br1 = element("br");
    			t32 = space();
    			br2 = element("br");
    			t33 = space();
    			small = element("small");
    			t34 = text("Challenge url - you can share it with someone who wants to try and beat\r\n      your record on this board:\r\n      ");
    			br3 = element("br");
    			t35 = space();
    			u = element("u");
    			a = element("a");
    			t36 = text(t36_value);
    			t37 = space();
    			br4 = element("br");
    			t38 = space();
    			br5 = element("br");
    			t39 = space();
    			div9 = element("div");
    			button6 = element("button");
    			button6.textContent = "Undo";
    			t41 = space();
    			button7 = element("button");
    			button7.textContent = "Edit board";
    			t43 = space();
    			div12 = element("div");
    			if (if_block4) if_block4.c();
    			t44 = space();
    			if (if_block5) if_block5.c();
    			t45 = space();
    			if (if_block6) if_block6.c();
    			add_location(button0, file$4, 321, 4, 7658);
    			add_location(button1, file$4, 323, 6, 7715);
    			add_location(button2, file$4, 324, 6, 7766);
    			add_location(button3, file$4, 325, 6, 7828);
    			add_location(button4, file$4, 326, 6, 7890);
    			attr(div0, "class", "dropdown");
    			add_location(div0, file$4, 322, 4, 7685);
    			attr(div1, "class", "menu");
    			add_location(div1, file$4, 320, 2, 7634);
    			attr(div2, "class", "spacer");
    			add_location(div2, file$4, 329, 2, 7976);
    			attr(div3, "class", "spacer");
    			add_location(div3, file$4, 352, 2, 8674);
    			attr(div4, "class", "turns");
    			add_location(div4, file$4, 353, 2, 8700);
    			attr(div5, "class", "header");
    			add_location(div5, file$4, 319, 0, 7610);
    			add_location(div6, file$4, 371, 2, 9194);
    			add_location(button5, file$4, 372, 2, 9205);
    			attr(div7, "class", div7_class_value = "bottom panel card " + (ctx.$what ? '' : 'panel-hidden-ne'));
    			add_location(div7, file$4, 365, 0, 9038);
    			attr(div8, "class", "detached-title card large-font");
    			set_style(div8, "padding", "5px");
    			add_location(div8, file$4, 378, 2, 9370);
    			attr(span0, "class", ctx.dream);
    			add_location(span0, file$4, 383, 6, 9519);
    			add_location(big, file$4, 381, 4, 9492);
    			add_location(br0, file$4, 386, 4, 9587);
    			attr(span1, "class", ctx.dream);
    			add_location(span1, file$4, 388, 4, 9630);
    			add_location(br1, file$4, 396, 4, 9886);
    			add_location(br2, file$4, 397, 4, 9898);
    			add_location(br3, file$4, 401, 6, 10038);
    			add_location(small, file$4, 398, 4, 9910);
    			attr(a, "href", a_href_value = ctx.$debrief.challengeUrl);
    			add_location(a, file$4, 404, 6, 10075);
    			add_location(u, file$4, 403, 4, 10064);
    			add_location(br4, file$4, 407, 4, 10152);
    			add_location(br5, file$4, 408, 4, 10164);
    			add_location(button6, file$4, 410, 6, 10216);
    			add_location(button7, file$4, 411, 6, 10261);
    			attr(div9, "class", "buttons-horizontal");
    			add_location(div9, file$4, 409, 4, 10176);
    			attr(div10, "class", "card wide-lines");
    			add_location(div10, file$4, 380, 2, 9457);
    			attr(div11, "class", div11_class_value = "center panel " + (ctx.$state.complete && ctx.page == 'board' ? '' : 'panel-hidden'));
    			add_location(div11, file$4, 375, 0, 9276);
    			attr(div12, "class", "main");
    			add_location(div12, file$4, 417, 0, 10345);

    			dispose = [
    				listen(button1, "click", ctx.toggleWhat),
    				listen(button2, "click", ctx.click_handler),
    				listen(button3, "click", ctx.click_handler_1),
    				listen(button4, "click", ctx.click_handler_2),
    				listen(button5, "click", ctx.click_handler_4),
    				listen(button6, "click", ctx.undo),
    				listen(button7, "click", customize)
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
    			insert(target_1, div7, anchor);
    			if_blocks[current_block_type_index].m(div7, null);
    			append(div7, t15);
    			append(div7, div6);
    			append(div7, t16);
    			append(div7, button5);
    			insert(target_1, t18, anchor);
    			insert(target_1, div11, anchor);
    			append(div11, div8);
    			append(div11, t20);
    			append(div11, div10);
    			append(div10, big);
    			append(big, t21);
    			append(big, span0);
    			append(span0, t22);
    			append(div10, t23);
    			append(div10, br0);
    			append(div10, t24);
    			append(div10, t25);
    			append(div10, t26);
    			append(div10, span1);
    			append(span1, t27);
    			append(div10, t28);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div10, null);
    			}

    			append(div10, t29);
    			append(div10, t30);
    			append(div10, t31);
    			append(div10, br1);
    			append(div10, t32);
    			append(div10, br2);
    			append(div10, t33);
    			append(div10, small);
    			append(small, t34);
    			append(small, br3);
    			append(div10, t35);
    			append(div10, u);
    			append(u, a);
    			append(a, t36);
    			append(div10, t37);
    			append(div10, br4);
    			append(div10, t38);
    			append(div10, br5);
    			append(div10, t39);
    			append(div10, div9);
    			append(div9, button6);
    			append(div9, t41);
    			append(div9, button7);
    			insert(target_1, t43, anchor);
    			insert(target_1, div12, anchor);
    			if (if_block4) if_block4.m(div12, null);
    			append(div12, t44);
    			if (if_block5) if_block5.m(div12, null);
    			append(div12, t45);
    			if (if_block6) if_block6.m(div12, null);
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
    					if_block2 = create_if_block_5$1(ctx);
    					if_block2.c();
    					if_block2.m(div4, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			var previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx);
    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();
    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});
    				check_outros();

    				if_block3 = if_blocks[current_block_type_index];
    				if (!if_block3) {
    					if_block3 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block3.c();
    				}
    				transition_in(if_block3, 1);
    				if_block3.m(div7, t15);
    			}

    			if ((!current || changed.$what) && div7_class_value !== (div7_class_value = "bottom panel card " + (ctx.$what ? '' : 'panel-hidden-ne'))) {
    				attr(div7, "class", div7_class_value);
    			}

    			if ((!current || changed.$debrief) && t22_value !== (t22_value = ctx.$debrief.score)) {
    				set_data(t22, t22_value);
    			}

    			if ((!current || changed.$debrief) && t25_value !== (t25_value = ctx.$debrief.dreamsResolved)) {
    				set_data(t25, t25_value);
    			}

    			if (changed.fg || changed.$game || changed.bigNum || changed.$debrief) {
    				each_value_3 = ctx.$game.colorsList.slice(2);

    				for (var i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3(ctx, each_value_3, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div10, t29);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value_3.length;
    			}

    			if ((!current || changed.$debrief) && t30_value !== (t30_value = ctx.$debrief.turns)) {
    				set_data(t30, t30_value);
    			}

    			if ((!current || changed.$debrief) && t36_value !== (t36_value = ctx.$debrief.challengeUrl)) {
    				set_data(t36, t36_value);
    			}

    			if ((!current || changed.$debrief) && a_href_value !== (a_href_value = ctx.$debrief.challengeUrl)) {
    				attr(a, "href", a_href_value);
    			}

    			if ((!current || changed.$state || changed.page) && div11_class_value !== (div11_class_value = "center panel " + (ctx.$state.complete && ctx.page == 'board' ? '' : 'panel-hidden'))) {
    				attr(div11, "class", div11_class_value);
    			}

    			if (ctx.page == 'board') {
    				if (if_block4) {
    					if_block4.p(changed, ctx);
    				} else {
    					if_block4 = create_if_block_2$2(ctx);
    					if_block4.c();
    					if_block4.m(div12, t44);
    				}
    			} else if (if_block4) {
    				if_block4.d(1);
    				if_block4 = null;
    			}

    			if (ctx.page == 'files') {
    				if (!if_block5) {
    					if_block5 = create_if_block_1$3();
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(div12, t45);
    				} else {
    									transition_in(if_block5, 1);
    				}
    			} else if (if_block5) {
    				group_outros();
    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});
    				check_outros();
    			}

    			if (ctx.page == 'settings') {
    				if (if_block6) {
    					if_block6.p(changed, ctx);
    				} else {
    					if_block6 = create_if_block$4(ctx);
    					if_block6.c();
    					if_block6.m(div12, null);
    				}
    			} else if (if_block6) {
    				if_block6.d(1);
    				if_block6 = null;
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block3);
    			transition_in(if_block5);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block3);
    			transition_out(if_block5);
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
    				detach(div7);
    			}

    			if_blocks[current_block_type_index].d();

    			if (detaching) {
    				detach(t18);
    				detach(div11);
    			}

    			destroy_each(each_blocks, detaching);

    			if (detaching) {
    				detach(t43);
    				detach(div12);
    			}

    			if (if_block4) if_block4.d();
    			if (if_block5) if_block5.d();
    			if (if_block6) if_block6.d();
    			run_all(dispose);
    		}
    	};
    }

    function customize() {}

    function goTo$1(conf) {
      window.location.search = "?" + new URLSearchParams(conf).toString();
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

    function instance$4($$self, $$props, $$invalidate) {
    	let $game, $settings, $what, $state, $debrief, $conf, $board;

    	validate_store(game, 'game');
    	subscribe($$self, game, $$value => { $game = $$value; $$invalidate('$game', $game); });
    	validate_store(settings, 'settings');
    	subscribe($$self, settings, $$value => { $settings = $$value; $$invalidate('$settings', $settings); });
    	validate_store(what, 'what');
    	subscribe($$self, what, $$value => { $what = $$value; $$invalidate('$what', $what); });
    	validate_store(state, 'state');
    	subscribe($$self, state, $$value => { $state = $$value; $$invalidate('$state', $state); });
    	validate_store(debrief, 'debrief');
    	subscribe($$self, debrief, $$value => { $debrief = $$value; $$invalidate('$debrief', $debrief); });
    	validate_store(conf, 'conf');
    	subscribe($$self, conf, $$value => { $conf = $$value; $$invalidate('$conf', $conf); });
    	validate_store(board, 'board');
    	subscribe($$self, board, $$value => { $board = $$value; $$invalidate('$board', $board); });

    	

      let paper = [new Audio("paper2.ogg"), new Audio("paper.ogg")];

      let target;
      let page = "board";
      let hovered;
      let mousePosition = [0, 0];

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

      let mode;

      /*let colors = $game.colors;
      let fg = {};
      let bg = {};
      for (let c in colors) {
        fg[c] = "fg-" + colors[c];
        bg[c] = "bg-" + colors[c];
      }*/

      function fg(c) {
        return "fg-" + $game.colors(c);
      }

      function bg(c) {
        return "bg-" + $game.colors(c);
      }

      let chrome = navigator.userAgent.search("Chrome") >= 0;
      let dream = "dream" + (chrome ? " dream-animation" : "");

      let custom = {};

      conf.subscribe(v => {
        Object.assign(custom, v);
      });

      function clickCell(e) {
        if (e.button != 0) return;
        if (e.shiftKey) {
          $game.logFigAt(e.target.id);
        } else {
          let result = $game.attackFigAt(e.target.id);
          if (result) {
            if($settings.sound){
              let sound = paper[Math.floor(Math.random()*2)];
              sound.playbackRate = 1 + Math.random() * 1.3;
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
      function analysisPosition() {
        let [x, y] = mousePosition;
        let width = analysis ? analysis.offsetWidth : 400;
        let s = `left: ${
      x > window.innerWidth - width - 50 ? x - width - 50 : x + 100
    }px; top: ${Math.min(
      y,
      window.innerHeight - (analysis ? analysis.offsetHeight : 50) - 50
    )}px`;
        return s;
      }

      let moveTimeout;

      document.onmousemove = e => {
        mousePosition = [e.x, e.y];
        let movement = Math.abs(e.movementX) + Math.abs(e.movementY);
        showInfo();

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
        /*for (let k in custom) custom[k] = +custom[k];
        $game.start(custom);*/
        /*let c = {};
        Object.assign(c, custom);
        $game.play([]);*/
        $game.wipeAuto();
        goTo$1(custom);
      }

      function toggleWhat() {
        $what = !$what; what.set($what);
      }

      function cellClasses(fig) {
        let classes = [
          fig.dream && !fig.resolved ? "bg-none" : bg(fig.kind),
          fig.resolved && !fig.dream ? "resolved" : ""
        ];

        if (fig.wasted) {
          classes.push("wasted");
        } else {
          classes = classes.concat([
            fig.dream && fig.resolved && chrome ? "dream-animation" : "",
            fig.possible ? mode.attackable : "",
            fig.dream || fig.possible || (fig.resolved && fig.reached)
              ? ""
              : mode.impossible
          ]);
        }
        classes = classes.filter(s => s != "").join(" ");
        return classes;
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

      window.onkeydown = e => {
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
    		return toPage("board");
    	}

    	function click_handler_4(e) {
    		const $$result = ($what = false);
    		what.set($what);
    		return $$result;
    	}

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

    	function input0_change_handler() {
    		settings.update($$value => ($$value.sound = this.checked, $$value));
    	}

    	function input1_change_handler() {
    		settings.update($$value => ($$value.abridgedAnalysis = this.checked, $$value));
    	}

    	$$self.$$.update = ($$dirty = { modes: 1, $game: 1 }) => {
    		if ($$dirty.modes || $$dirty.$game) { {
            mode = modes[$game.mode];
          } }
    	};

    	return {
    		target,
    		page,
    		fg,
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
    		particles,
    		$game,
    		$settings,
    		Math,
    		$what,
    		$state,
    		$debrief,
    		$conf,
    		$board,
    		div2_binding,
    		div_binding,
    		div_binding_1,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3,
    		click_handler_4,
    		select_change_handler,
    		input0_input_handler,
    		input1_input_handler,
    		input2_input_handler,
    		input0_change_handler,
    		input1_change_handler
    	};
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, []);
    	}
    }

    class MonstrominoFig extends Fig {
        get battler() {
            return this.battle ? this.battle.enemy : null;
        }
        get monstromino() {
            return this.game;
        }
        loot() {
            let statName = this.kind;
            if (statName == "none")
                return;
            this.monstromino.prota[statName] += Math.floor(this.battle.enemy[statName] / 10);
            this.game.score += this.score - 3;
        }
        get xp() {
            if (this.kind == "dream")
                return null;
            let statName = this.kind;
            return [statName, Math.floor(this.battle.enemy[statName] / 10)];
        }
        get deathText() {
            if (this.kind == "dream")
                return { class: "dream", text: 100 };
            let xp = this.xp;
            return { class: xp[0], text: xp[1] };
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
            let depthScaling = 0.04;
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
        get possible() {
            return (this.reached &&
                !this.resolved &&
                this.battle &&
                this.battle.outcome == "win");
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
                str: 25,
                vit: 40,
                def: 10,
                spd: 30
            });
        }
        stateExtraFields() {
            return this.prota;
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
        get possible() {
            return (this.reached &&
                !this.resolved &&
                (this.rainbow.color <= 1 || this.kind == "dream" || this.rainbow.colorsList.indexOf(this.kind) == this.rainbow.color));
        }
    }

    class Rainbow extends Game$1 {
        get statsOrder() {
            return ["color"];
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
        stateExtraFields() {
            return {
                color: this.color,
            };
        }
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
            return (Object.values(this).reduce((a, b) => a + b) + (kind ? this[kind] * 2 : 0));
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
            this.state = new LifeState();
        }
        loot() {
            if (!(this.kind in this.state))
                return;
            this.game.score += this.score - 3;
            this.life.prota[this.kind] += Math.floor(this.state[this.kind] / 10);
        }
        get life() {
            return this.game;
        }
        get possible() {
            if (!this.reached || this.resolved)
                return false;
            if (!this.state)
                this.updateAnalysis();
            if (this.dream) {
                return Object.keys(this.state).every(k => {
                    return this.state[k] <= this.life.prota[k];
                });
            }
            else {
                let thisPower = this.state.power(this.kind);
                let protaPower = this.life.prota.power(this.kind);
                return protaPower >= thisPower;
            }
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
            let dreamMultiplier = 3;
            let baseBonus = 5;
            let finalMultiplier = 0.015;
            let depthScaling = 0.035;
            let bonuses = { self: 0, friends: 0, family: 0, career: 0, dream: 0 };
            bonuses[this.kind] = this.cells.length * ownMultiplier;
            for (let n of this.neighbors) {
                if (!n.resolved) {
                    bonuses[n.kind] += n.cells.length * neighborMultiplier;
                }
            }
            for (let stat of this.life.statsOrder) {
                bonuses[stat] += bonuses.dream * dreamMultiplier;
            }
            bonuses.dream = 0;
            for (let stat in statsBase) {
                this.state[stat] = Math.floor(statsBase[stat] *
                    (baseBonus + bonuses[stat]) *
                    Math.pow(10, 1 + this.depth * depthScaling) *
                    finalMultiplier);
            }
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
            return 400;
        }
    }

    function createGame() {
        let urlConf;
        let defaultConf = { width: 30, height: 80, seed: 1, mode: "monstromino" };
        if (document.location.search) {
            let usp = new URLSearchParams(document.location.search.substr(1));
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

    window.onload = function() {
      createGame();

      new App({
        target: document.body
      });
    };

}());
