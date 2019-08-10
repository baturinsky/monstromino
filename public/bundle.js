var app = (function () {
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
    function detach_before(after) {
        while (after.previousSibling) {
            after.parentNode.removeChild(after.previousSibling);
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
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }

    const globals = (typeof window !== 'undefined' ? window : global);
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
    function setGameState(o) {
        if (!state)
            state = tweened(o, tween);
        else
            state.set(o);
    }
    const what = writable(true);
    what.set(localStorage.what == "no" ? false : true);
    what.subscribe(v => localStorage.setItem("what", v ? "yes" : "no"));
    const abridgedAnalysis = writable(false);
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
            this.battle = new Battle([this.fig.game.prota, this]);
            return this;
        }
        attack(d, battle) {
            this.nextAttack = battle.time + this.interval();
            let damage = 0;
            let rnd = this.rni();
            let damageRoll = Math.floor((rnd % 2e6) * this.str / 1e6);
            damage = Math.max(0, damageRoll - d.def);
            if (damage > 0)
                d.hp -= damage;
            return { a: this, d, damage, damageRoll, def: d.def, hp: d.hp };
        }
    }
    Battler.statsOrder = "str vit def spd".split(" ");
    Battler.statsBase = { str: 10, vit: 30, def: 10, spd: 10, dream: 0 };

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
        }
        resolve() {
            if (this.resolved)
                return;
            if (!this.battler)
                this.updateBattler();
            this.resolved = true;
            for (let n of this.neighbors)
                n.reach();
            this.loot();
        }
        updateBattler() {
            if (this.resolved || this.kind == "none") {
                this.battler = null;
                return this;
            }
            let bonuses = {};
            for (let stat in Battler.statsBase)
                bonuses[stat] = 0;
            bonuses[this.kind] = this.cells.length * 4;
            for (let n of this.neighbors) {
                if (!n.resolved) {
                    bonuses[n.kind] += n.cells.length;
                }
            }
            if (!this.battler)
                this.battler = new Battler(this);
            for (let stat in Battler.statsBase) {
                this.battler[stat] = Math.floor((Battler.statsBase[stat] *
                    (10 + bonuses[stat] * 2) *
                    Math.pow(10, 1 + this.depth / 20)) /
                    100);
            }
            this.battle = new Battle([this.game.prota, this.battler]);
            return this;
        }
        get possible() {
            return this.reached && !this.resolved && this.battle && this.battle.outcome == "win";
        }
        loot() {
            let statName = this.kind;
            if (statName == "none")
                return;
            this.game.prota[statName] += Math.floor(this.battler[statName] / 10);
            this.game.score += this.score;
        }
        get score() {
            return this.cells.length * (this.dream ? 100 : 1);
        }
        get xp() {
            let statName = this.kind;
            return [statName, Math.floor(this.battler[statName] / 10)];
        }
        get frozen() {
            return !this.resolved && this.game.frozen(this.last);
        }
        get dream() {
            return this.kind == "dream";
        }
        get color() {
            return this.game.colors[this.kind];
        }
    }

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
    const colorsConst = {
        str: "red",
        vit: "green",
        def: "yellow",
        spd: "blue",
        none: "none",
        dream: "rainbow"
    };
    class Game {
        constructor(conf, persist) {
            this.twister = new MersenneTwister();
            this.board = [];
            this.figs = [];
            this.persist = null;
            if (conf)
                this.conf = conf;
            if (persist)
                this.persist = persist;
            game.set(this);
        }
        persistIn(path) {
            this.persist = path;
            return this;
        }
        get colors() {
            return colorsConst;
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
            return "conf turns cash".split(" ");
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
            return 200;
        }
        generate() {
            this.turns = [];
            this.figs = [];
            this.twister.seed(this.conf.seed);
            this.rni = this.twister.int.bind(this.twister);
            this.deltas = [-1, 1, -this.width, +this.width];
            let raw = [...Array(this.cellsNumber)].map(a => weightedRandom([1, 0, 1, 1, 1, 1], this.rni));
            for (let i = 0; i < this.cellsNumber; i += Math.floor(this.dreamFrequency / 2) + this.rni() % this.dreamFrequency) {
                if (i == 0)
                    continue;
                raw[i] = 1;
            }
            this.board = raw.map(_ => null);
            for (let i in raw) {
                this.populate(raw, Number(i));
            }
        }
        populate(raw, start) {
            if (this.board[start])
                return;
            let color = raw[start];
            let kind = ["none", "dream", "str", "vit", "def", "spd"][color];
            let heap = [start];
            let fig = new Fig(this, kind, this.figs.length);
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
        play(turns = []) {
            this.turns = turns;
            this.score = 0;
            this.dreamsTotal = 0;
            this.prota = new Battler().stats({
                str: 20,
                vit: 50,
                def: 10,
                spd: 30
            });
            for (let fig of this.figs) {
                fig.reached = false;
                fig.resolved = false;
                fig.battle = null;
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
            if (fig.frozen)
                return null;
            if (!fig)
                return null;
            if (fig.possible) {
                fig.resolve();
                this.score -= 3;
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
        updateBattles() {
            for (let b of this.figs) {
                if (b.reached && !b.resolved) {
                    b.updateBattler();
                }
            }
        }
        undo() {
            if (this.turns.length > 0)
                this.play(this.turns.slice(0, -1));
        }
        reset() {
            this.play();
        }
        logFigAt(cell) {
            let fig = this.board[cell];
            fig.updateBattler();
            console.log(fig);
        }
        fig(id) {
            return this.figs[id];
        }
        figAt(cell) {
            return this.board[cell];
        }
        stateChanged() {
            this.updateBattles();
            conf.set(this.conf);
            board.set(this.board);
            this.dreamsResolved = 0;
            this.dreamsFrozen = 0;
            for (let f of this.figs) {
                if (f.dream) {
                    if (f.resolved)
                        this.dreamsResolved++;
                    else if (f.frozen)
                        this.dreamsFrozen++;
                }
            }
            this.complete = this.dreamsResolved + this.dreamsFrozen == this.dreamsTotal;
            setGameState({
                turns: this.turns.length,
                score: this.score,
                str: this.prota.str,
                vit: this.prota.vit,
                def: this.prota.def,
                spd: this.prota.spd,
                complete: this.complete ? 1 : 0
            });
            debrief.set(this.debrief);
        }
        frozen(i) {
            return i < this.width * Math.floor(this.turns.length / 3 - 5);
        }
        start(custom) {
            this.config(custom);
            this.generate();
            this.play();
            this.saveAuto();
        }
        get debrief() {
            let d = {
                score: this.score,
                dreamsResolved: this.dreamsResolved,
                dreamsFrozen: this.dreamsFrozen,
                turns: this.turns.length,
                challengeUrl: this.challengeUrl
            };
            for (let stat of Battler.statsOrder) {
                d[stat] = 0;
            }
            for (let f of this.figs) {
                if (f.resolved)
                    d[f.kind] += f.cells.length;
            }
            return d;
        }
        get challengeUrl() {
            let params = new URLSearchParams(this.conf);
            params.append("goal", this.score.toString());
            let url = window.location.host + window.location.pathname + "?" + params.toString();
            return url;
        }
        static create() {
            let urlConf;
            let defaultConf = { width: 30, height: 80, seed: 1 };
            if (document.location.search) {
                let usp = new URLSearchParams(document.location.search.substr(1));
                urlConf = Object.fromEntries(usp.entries());
            }
            let auto = "auto";
            let raw = Game.loadRaw(auto);
            if (!raw) {
                let game = new Game(urlConf || defaultConf, auto);
                return game;
            }
            let confMatches = !urlConf || compareObjects(raw.conf, urlConf);
            let game = new Game(urlConf, auto);
            if (confMatches) {
                game.load(raw);
            }
            return game;
        }
        colorAt(cell) {
            return this.figAt(cell).color;
        }
    }

    let lang = {
        what: `
<ol type="I">
<li>Objective is to reach the bottom of the board and get as much money as possible until you run out of turns.
<li>Each colored shape is a monster.
<li>If the monster is highlighted, it means that it's in your reach and you are powerful enough to win. Click to do it.
<li>You will expend one turn on fight and will be rewarded with some of enemy's stats and some money. 
<li>You can see enemy stats, battle projection and expected loot simply by mouse-overing it.
<li>Combat is automatic. 
<li>VIT is how many HP you start with.
You attack as often as your SPD is, deal damage to enemy HP at random between 0% and 200% of STR, minus target's DEF.
<li>Enemy does the same. 
<li>There is a draw if no one loses after 20 attacks are made. It's equivalent to your defeat in most cases.
</ol>
  `,
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
        tip_score: `Score is +1 per cleared cell, +100 per cleared rainbow cell, -3 per turn`,
        tip_erase: `Delete file`,
        tip_frozen: `One row of board is frozen per 3 turns.<br/>Frozen cells are completely unaccessible.`,
        tip_ability: `Not implemented yet`,
        FROZEN: `FROZEN`
    };

    /* src\App.svelte generated by Svelte v3.6.7 */
    const { Object: Object_1 } = globals;

    const file = "src\\App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.save = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
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
    	return child_ctx;
    }

    function get_each_context_4(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.stat = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    function get_each_context_5(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.move = list[i];
    	return child_ctx;
    }

    function get_each_context_6(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.field = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    // (227:0) {#if enemy && enemy.battle && enemy.battler}
    function create_if_block_5(ctx) {
    	var div, div_style_value, div_class_value;

    	function select_block_type(ctx) {
    		if (ctx.enemy.frozen) return create_if_block_6;
    		return create_else_block_2;
    	}

    	var current_block_type = select_block_type(ctx);
    	var if_block = current_block_type(ctx);

    	return {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			attr(div, "style", div_style_value = ctx.analysisPosition());
    			attr(div, "class", div_class_value = "analysis " + (!ctx.moveTimeout ? 'analysis-shown' : ''));
    			add_location(div, file, 227, 2, 5153);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			if_block.m(div, null);
    			ctx.div_binding(div);
    		},

    		p: function update(changed, ctx) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(changed, ctx);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);
    				if (if_block) {
    					if_block.c();
    					if_block.m(div, null);
    				}
    			}

    			if ((changed.moveTimeout) && div_class_value !== (div_class_value = "analysis " + (!ctx.moveTimeout ? 'analysis-shown' : ''))) {
    				attr(div, "class", div_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if_block.d();
    			ctx.div_binding(null);
    		}
    	};
    }

    // (240:4) {:else}
    function create_else_block_2(ctx) {
    	var div0, t0, div1, t1, div2, t2;

    	var each_value_6 = Battler.statsOrder;

    	var each_blocks_1 = [];

    	for (var i = 0; i < each_value_6.length; i += 1) {
    		each_blocks_1[i] = create_each_block_6(get_each_context_6(ctx, each_value_6, i));
    	}

    	var each_value_5 = ctx.enemy.battle.log;

    	var each_blocks = [];

    	for (var i = 0; i < each_value_5.length; i += 1) {
    		each_blocks[i] = create_each_block_5(get_each_context_5(ctx, each_value_5, i));
    	}

    	var if_block0 = (ctx.enemy.battle.outcome != 'win' || !ctx.$abridgedAnalysis) && create_if_block_8(ctx);

    	var if_block1 = (ctx.enemy.battle.outcome == 'win') && create_if_block_7(ctx);

    	return {
    		c: function create() {
    			div0 = element("div");

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t0 = space();
    			div1 = element("div");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = space();
    			div2 = element("div");
    			if (if_block0) if_block0.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			attr(div0, "class", "enemy");
    			add_location(div0, file, 240, 6, 5473);
    			attr(div1, "class", "combat-log");
    			add_location(div1, file, 248, 6, 5772);
    			attr(div2, "class", "battle-outcome");
    			add_location(div2, file, 282, 6, 6992);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div0, anchor);

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div0, null);
    			}

    			insert(target, t0, anchor);
    			insert(target, div1, anchor);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			insert(target, t1, anchor);
    			insert(target, div2, anchor);
    			if (if_block0) if_block0.m(div2, null);
    			append(div2, t2);
    			if (if_block1) if_block1.m(div2, null);
    		},

    		p: function update(changed, ctx) {
    			if (changed.fg || changed.Battler || changed.bigNum || changed.enemy || changed.$abridgedAnalysis) {
    				each_value_6 = Battler.statsOrder;

    				for (var i = 0; i < each_value_6.length; i += 1) {
    					const child_ctx = get_each_context_6(ctx, each_value_6, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_6(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}
    				each_blocks_1.length = each_value_6.length;
    			}

    			if (changed.$abridgedAnalysis || changed.enemy || changed.bigNum || changed.fg) {
    				each_value_5 = ctx.enemy.battle.log;

    				for (var i = 0; i < each_value_5.length; i += 1) {
    					const child_ctx = get_each_context_5(ctx, each_value_5, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_5(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value_5.length;
    			}

    			if (ctx.enemy.battle.outcome != 'win' || !ctx.$abridgedAnalysis) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    				} else {
    					if_block0 = create_if_block_8(ctx);
    					if_block0.c();
    					if_block0.m(div2, t2);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (ctx.enemy.battle.outcome == 'win') {
    				if (if_block1) {
    					if_block1.p(changed, ctx);
    				} else {
    					if_block1 = create_if_block_7(ctx);
    					if_block1.c();
    					if_block1.m(div2, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div0);
    			}

    			destroy_each(each_blocks_1, detaching);

    			if (detaching) {
    				detach(t0);
    				detach(div1);
    			}

    			destroy_each(each_blocks, detaching);

    			if (detaching) {
    				detach(t1);
    				detach(div2);
    			}

    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    // (233:4) {#if enemy.frozen}
    function create_if_block_6(ctx) {
    	var div0, raw0_value = lang.FROZEN, t, div1, raw1_value = lang.tip_frozen;

    	return {
    		c: function create() {
    			div0 = element("div");
    			t = space();
    			div1 = element("div");
    			attr(div0, "class", "enemy");
    			add_location(div0, file, 233, 6, 5311);
    			attr(div1, "class", "combat-log");
    			add_location(div1, file, 236, 6, 5381);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div0, anchor);
    			div0.innerHTML = raw0_value;
    			insert(target, t, anchor);
    			insert(target, div1, anchor);
    			div1.innerHTML = raw1_value;
    		},

    		p: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div0);
    				detach(t);
    				detach(div1);
    			}
    		}
    	};
    }

    // (242:8) {#each Battler.statsOrder as field, i}
    function create_each_block_6(ctx) {
    	var raw_value = ctx.i == 0 ? '' : '&nbsp;', raw_before, raw_after, t0, span0, t1_value = ctx.$abridgedAnalysis ? '' : ctx.field, t1, t2, span1, t3_value = ctx.bigNum(ctx.enemy.battler[ctx.field]), t3, span1_class_value;

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
    			add_location(span0, file, 243, 10, 5594);
    			attr(span1, "class", span1_class_value = ctx.fg[ctx.field]);
    			add_location(span1, file, 244, 10, 5670);
    		},

    		m: function mount(target, anchor) {
    			insert(target, raw_before, anchor);
    			raw_before.insertAdjacentHTML("afterend", raw_value);
    			insert(target, raw_after, anchor);
    			insert(target, t0, anchor);
    			insert(target, span0, anchor);
    			append(span0, t1);
    			insert(target, t2, anchor);
    			insert(target, span1, anchor);
    			append(span1, t3);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$abridgedAnalysis) && t1_value !== (t1_value = ctx.$abridgedAnalysis ? '' : ctx.field)) {
    				set_data(t1, t1_value);
    			}

    			if ((changed.enemy) && t3_value !== (t3_value = ctx.bigNum(ctx.enemy.battler[ctx.field]))) {
    				set_data(t3, t3_value);
    			}

    			if ((changed.fg) && span1_class_value !== (span1_class_value = ctx.fg[ctx.field])) {
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

    // (255:10) {:else}
    function create_else_block_4(ctx) {
    	var div, nobr, span0, t0_value = ctx.move.a.isProto ? 'Made' : 'Took', t0, span0_class_value, t1, span1, t2_value = ctx.bigNum(ctx.move.damageRoll), t2, span1_class_value, t3, span2, t4_value = ctx.bigNum(ctx.move.def), t4, span2_class_value, t5;

    	function select_block_type_3(ctx) {
    		if (ctx.move.damage <= 0) return create_if_block_11;
    		return create_else_block_5;
    	}

    	var current_block_type = select_block_type_3(ctx);
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
    			t3 = text("\r\n                -\r\n                ");
    			span2 = element("span");
    			t4 = text(t4_value);
    			t5 = space();
    			if_block.c();
    			attr(span0, "class", span0_class_value = ctx.move.a.isProto ? 'attacking' : 'defending');
    			add_location(span0, file, 257, 16, 6131);
    			attr(span1, "class", span1_class_value = ctx.fg.str);
    			add_location(span1, file, 260, 16, 6285);
    			attr(span2, "class", span2_class_value = ctx.fg.def);
    			add_location(span2, file, 262, 16, 6375);
    			add_location(nobr, file, 256, 14, 6107);
    			attr(div, "class", "complete-log");
    			add_location(div, file, 255, 12, 6065);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
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
    			if ((changed.enemy) && t0_value !== (t0_value = ctx.move.a.isProto ? 'Made' : 'Took')) {
    				set_data(t0, t0_value);
    			}

    			if ((changed.enemy) && span0_class_value !== (span0_class_value = ctx.move.a.isProto ? 'attacking' : 'defending')) {
    				attr(span0, "class", span0_class_value);
    			}

    			if ((changed.enemy) && t2_value !== (t2_value = ctx.bigNum(ctx.move.damageRoll))) {
    				set_data(t2, t2_value);
    			}

    			if ((changed.fg) && span1_class_value !== (span1_class_value = ctx.fg.str)) {
    				attr(span1, "class", span1_class_value);
    			}

    			if ((changed.enemy) && t4_value !== (t4_value = ctx.bigNum(ctx.move.def))) {
    				set_data(t4, t4_value);
    			}

    			if ((changed.fg) && span2_class_value !== (span2_class_value = ctx.fg.def)) {
    				attr(span2, "class", span2_class_value);
    			}

    			if (current_block_type === (current_block_type = select_block_type_3(ctx)) && if_block) {
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

    // (251:10) {#if $abridgedAnalysis}
    function create_if_block_9(ctx) {
    	var span, span_class_value;

    	function select_block_type_2(ctx) {
    		if (ctx.move.damage > 0) return create_if_block_10;
    		return create_else_block_3;
    	}

    	var current_block_type = select_block_type_2(ctx);
    	var if_block = current_block_type(ctx);

    	return {
    		c: function create() {
    			span = element("span");
    			if_block.c();
    			attr(span, "class", span_class_value = ctx.move.a.isProto ? 'attacking' : 'defending');
    			add_location(span, file, 251, 12, 5887);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			if_block.m(span, null);
    		},

    		p: function update(changed, ctx) {
    			if (current_block_type === (current_block_type = select_block_type_2(ctx)) && if_block) {
    				if_block.p(changed, ctx);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);
    				if (if_block) {
    					if_block.c();
    					if_block.m(span, null);
    				}
    			}

    			if ((changed.enemy) && span_class_value !== (span_class_value = ctx.move.a.isProto ? 'attacking' : 'defending')) {
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

    // (267:16) {:else}
    function create_else_block_5(ctx) {
    	var t0, span0, t1_value = ctx.bigNum(ctx.move.damage), t1, span0_class_value, t2, span1, t3_value = ctx.bigNum(ctx.move.hp), t3, span1_class_value, t4;

    	return {
    		c: function create() {
    			t0 = text("=\r\n                  ");
    			span0 = element("span");
    			t1 = text(t1_value);
    			t2 = text("\r\n                  dmg,\r\n                  ");
    			span1 = element("span");
    			t3 = text(t3_value);
    			t4 = text("\r\n                  hp left");
    			attr(span0, "class", span0_class_value = ctx.fg.str);
    			add_location(span0, file, 268, 18, 6605);
    			attr(span1, "class", span1_class_value = ctx.move.a.isProto ? 'attacking' : 'defending');
    			add_location(span1, file, 270, 18, 6698);
    		},

    		m: function mount(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, span0, anchor);
    			append(span0, t1);
    			insert(target, t2, anchor);
    			insert(target, span1, anchor);
    			append(span1, t3);
    			insert(target, t4, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.enemy) && t1_value !== (t1_value = ctx.bigNum(ctx.move.damage))) {
    				set_data(t1, t1_value);
    			}

    			if ((changed.fg) && span0_class_value !== (span0_class_value = ctx.fg.str)) {
    				attr(span0, "class", span0_class_value);
    			}

    			if ((changed.enemy) && t3_value !== (t3_value = ctx.bigNum(ctx.move.hp))) {
    				set_data(t3, t3_value);
    			}

    			if ((changed.enemy) && span1_class_value !== (span1_class_value = ctx.move.a.isProto ? 'attacking' : 'defending')) {
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

    // (264:16) {#if move.damage <= 0}
    function create_if_block_11(ctx) {
    	var t0, span, t1, span_class_value;

    	return {
    		c: function create() {
    			t0 = text("=\r\n                  ");
    			span = element("span");
    			t1 = text("no damage");
    			attr(span, "class", span_class_value = ctx.fg.def);
    			add_location(span, file, 265, 18, 6502);
    		},

    		m: function mount(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, span, anchor);
    			append(span, t1);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.fg) && span_class_value !== (span_class_value = ctx.fg.def)) {
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

    // (253:52) {:else}
    function create_else_block_3(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("=");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		p: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (253:14) {#if move.damage > 0}
    function create_if_block_10(ctx) {
    	var t_value = ctx.bigNum(ctx.move.hp), t;

    	return {
    		c: function create() {
    			t = text(t_value);
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.enemy) && t_value !== (t_value = ctx.bigNum(ctx.move.hp))) {
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

    // (250:8) {#each enemy.battle.log as move}
    function create_each_block_5(ctx) {
    	var t, span;

    	function select_block_type_1(ctx) {
    		if (ctx.$abridgedAnalysis) return create_if_block_9;
    		return create_else_block_4;
    	}

    	var current_block_type = select_block_type_1(ctx);
    	var if_block = current_block_type(ctx);

    	return {
    		c: function create() {
    			if_block.c();
    			t = space();
    			span = element("span");
    			add_location(span, file, 278, 10, 6943);
    		},

    		m: function mount(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, t, anchor);
    			insert(target, span, anchor);
    		},

    		p: function update(changed, ctx) {
    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block) {
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

    // (284:8) {#if enemy.battle.outcome != 'win' || !$abridgedAnalysis}
    function create_if_block_8(ctx) {
    	var span, t_value = ctx.enemy.battle.outcome.toUpperCase(), t, span_class_value;

    	return {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			attr(span, "class", span_class_value = "battle-" + ctx.enemy.battle.outcome);
    			add_location(span, file, 284, 10, 7099);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.enemy) && t_value !== (t_value = ctx.enemy.battle.outcome.toUpperCase())) {
    				set_data(t, t_value);
    			}

    			if ((changed.enemy) && span_class_value !== (span_class_value = "battle-" + ctx.enemy.battle.outcome)) {
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

    // (289:8) {#if enemy.battle.outcome == 'win'}
    function create_if_block_7(ctx) {
    	var t0_value = ctx.$abridgedAnalysis ? '' : ctx.enemy.xp[0], t0, t1, span0, t2_value = (ctx.$abridgedAnalysis ? '' : '+') + ctx.bigNum(ctx.enemy.xp[1]), t2, span0_class_value, t3, span1, t4, t5_value = ctx.enemy.score, t5;

    	return {
    		c: function create() {
    			t0 = text(t0_value);
    			t1 = space();
    			span0 = element("span");
    			t2 = text(t2_value);
    			t3 = text("\r\n          score\r\n          ");
    			span1 = element("span");
    			t4 = text("+ ");
    			t5 = text(t5_value);
    			attr(span0, "class", span0_class_value = ctx.fg[ctx.enemy.xp[0]]);
    			add_location(span0, file, 290, 10, 7334);
    			attr(span1, "class", ctx.rainbow);
    			add_location(span1, file, 294, 10, 7480);
    		},

    		m: function mount(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, span0, anchor);
    			append(span0, t2);
    			insert(target, t3, anchor);
    			insert(target, span1, anchor);
    			append(span1, t4);
    			append(span1, t5);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$abridgedAnalysis || changed.enemy) && t0_value !== (t0_value = ctx.$abridgedAnalysis ? '' : ctx.enemy.xp[0])) {
    				set_data(t0, t0_value);
    			}

    			if ((changed.$abridgedAnalysis || changed.enemy) && t2_value !== (t2_value = (ctx.$abridgedAnalysis ? '' : '+') + ctx.bigNum(ctx.enemy.xp[1]))) {
    				set_data(t2, t2_value);
    			}

    			if ((changed.fg || changed.enemy) && span0_class_value !== (span0_class_value = ctx.fg[ctx.enemy.xp[0]])) {
    				attr(span0, "class", span0_class_value);
    			}

    			if ((changed.enemy) && t5_value !== (t5_value = ctx.enemy.score)) {
    				set_data(t5, t5_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t0);
    				detach(t1);
    				detach(span0);
    				detach(t3);
    				detach(span1);
    			}
    		}
    	};
    }

    // (329:2) {:else}
    function create_else_block_1(ctx) {
    	var div, t;

    	return {
    		c: function create() {
    			div = element("div");
    			t = text(ctx.page);
    			attr(div, "class", "page-title");
    			add_location(div, file, 329, 4, 8446);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.page) {
    				set_data(t, ctx.page);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}
    		}
    	};
    }

    // (312:2) {#if page == 'board'}
    function create_if_block_4(ctx) {
    	var button0, t1, div, t2, button1, t3, button1_data_tooltip_value, dispose;

    	var each_value_4 = ctx.statsOrder;

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
    			add_location(button0, file, 312, 4, 7932);
    			attr(div, "class", "prota");
    			add_location(div, file, 313, 4, 7990);
    			attr(button1, "class", "hotkey wip tooltip-bottom");
    			button1.dataset.tooltip = button1_data_tooltip_value = lang.tip_ability;
    			add_location(button1, file, 325, 4, 8325);
    			dispose = listen(button0, "click", ctx.undo);
    		},

    		m: function mount(target, anchor) {
    			insert(target, button0, anchor);
    			insert(target, t1, anchor);
    			insert(target, div, anchor);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			insert(target, t2, anchor);
    			insert(target, button1, anchor);
    			append(button1, t3);
    		},

    		p: function update(changed, ctx) {
    			if (changed.fg || changed.statsOrder || changed.lang || changed.bigNum || changed.$state) {
    				each_value_4 = ctx.statsOrder;

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

    // (315:6) {#each statsOrder as stat, i}
    function create_each_block_4(ctx) {
    	var raw_value = ctx.i > 0 ? '&nbsp' : '', raw_before, raw_after, t0, span0, t1_value = ctx.stat, t1, t2, span1, t3_value = ctx.bigNum(ctx.$state[ctx.stat]), t3, t4, span1_class_value, span1_data_tooltip_value;

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
    			add_location(span0, file, 317, 8, 8096);
    			attr(span1, "class", span1_class_value = "" + ctx.fg[ctx.stat] + " tooltip-bottom");
    			span1.dataset.tooltip = span1_data_tooltip_value = lang['tip_' + ctx.stat];
    			add_location(span1, file, 318, 8, 8144);
    		},

    		m: function mount(target, anchor) {
    			insert(target, raw_before, anchor);
    			raw_before.insertAdjacentHTML("afterend", raw_value);
    			insert(target, raw_after, anchor);
    			insert(target, t0, anchor);
    			insert(target, span0, anchor);
    			append(span0, t1);
    			insert(target, t2, anchor);
    			insert(target, span1, anchor);
    			append(span1, t3);
    			append(span1, t4);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$state) && t3_value !== (t3_value = ctx.bigNum(ctx.$state[ctx.stat]))) {
    				set_data(t3, t3_value);
    			}

    			if ((changed.fg) && span1_class_value !== (span1_class_value = "" + ctx.fg[ctx.stat] + " tooltip-bottom")) {
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

    // (335:4) {#if page == 'board'}
    function create_if_block_3(ctx) {
    	var span0, t1, span1, t2_value = ctx.bigNum(ctx.$state.score), t2, span1_class_value, span1_data_tooltip_value, t3, span2, t5, span3, t6_value = ctx.Math.round(ctx.$state.turns), t6;

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
    			add_location(span0, file, 335, 6, 8577);
    			attr(span1, "class", span1_class_value = "" + ctx.rainbow + " tooltip-bottom");
    			span1.dataset.tooltip = span1_data_tooltip_value = lang.tip_score;
    			add_location(span1, file, 336, 6, 8622);
    			attr(span2, "class", "field-name");
    			add_location(span2, file, 339, 6, 8746);
    			add_location(span3, file, 340, 6, 8791);
    		},

    		m: function mount(target, anchor) {
    			insert(target, span0, anchor);
    			insert(target, t1, anchor);
    			insert(target, span1, anchor);
    			append(span1, t2);
    			insert(target, t3, anchor);
    			insert(target, span2, anchor);
    			insert(target, t5, anchor);
    			insert(target, span3, anchor);
    			append(span3, t6);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$state) && t2_value !== (t2_value = ctx.bigNum(ctx.$state.score))) {
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

    // (366:4) {#each statsOrder as field}
    function create_each_block_3(ctx) {
    	var t0, t1_value = ctx.bigNum(ctx.$debrief[ctx.field]), t1, t2, span, t3_value = ctx.field, t3, span_class_value, t4;

    	return {
    		c: function create() {
    			t0 = text("+ ");
    			t1 = text(t1_value);
    			t2 = space();
    			span = element("span");
    			t3 = text(t3_value);
    			t4 = text("\r\n      cells ");
    			attr(span, "class", span_class_value = ctx.fg[ctx.field]);
    			add_location(span, file, 367, 6, 9486);
    		},

    		m: function mount(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, t2, anchor);
    			insert(target, span, anchor);
    			append(span, t3);
    			insert(target, t4, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$debrief) && t1_value !== (t1_value = ctx.bigNum(ctx.$debrief[ctx.field]))) {
    				set_data(t1, t1_value);
    			}

    			if ((changed.fg) && span_class_value !== (span_class_value = ctx.fg[ctx.field])) {
    				attr(span, "class", span_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t0);
    				detach(t1);
    				detach(t2);
    				detach(span);
    				detach(t4);
    			}
    		}
    	};
    }

    // (392:2) {#if page == 'board'}
    function create_if_block_2(ctx) {
    	var div1, div0, t0, t1, div2, t2, input0, t3, input1, t4, input2, t5, button, dispose;

    	var each_value_2 = ctx.justResolved;

    	var each_blocks_1 = [];

    	for (var i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_1[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	var each_value_1 = ctx.$board;

    	var each_blocks = [];

    	for (var i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	return {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t0 = space();

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = space();
    			div2 = element("div");
    			t2 = text("Seed\r\n      ");
    			input0 = element("input");
    			t3 = text("\r\n       Width\r\n      ");
    			input1 = element("input");
    			t4 = text("\r\n       Height\r\n      ");
    			input2 = element("input");
    			t5 = text("\r\n       \r\n      ");
    			button = element("button");
    			button.textContent = "play";
    			attr(div0, "class", "animations");
    			add_location(div0, file, 398, 6, 10263);
    			attr(div1, "class", "board-table");
    			set_style(div1, "width", "" + 20 * ctx.$conf.width + "px");
    			add_location(div1, file, 392, 4, 10082);
    			add_location(input0, file, 415, 6, 10768);
    			add_location(input1, file, 417, 6, 10829);
    			add_location(input2, file, 419, 6, 10892);
    			add_location(button, file, 421, 6, 10950);
    			attr(div2, "class", "board-conf");
    			add_location(div2, file, 413, 4, 10724);

    			dispose = [
    				listen(div1, "mousemove", ctx.hoverCell),
    				listen(div1, "mousedown", ctx.clickCell),
    				listen(div1, "mouseleave", ctx.unHoverCell),
    				listen(input0, "input", ctx.input0_input_handler),
    				listen(input1, "input", ctx.input1_input_handler),
    				listen(input2, "input", ctx.input2_input_handler),
    				listen(button, "click", ctx.playCustom)
    			];
    		},

    		m: function mount(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div0, null);
    			}

    			append(div1, t0);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			insert(target, t1, anchor);
    			insert(target, div2, anchor);
    			append(div2, t2);
    			append(div2, input0);

    			input0.value = ctx.custom.seed;

    			append(div2, t3);
    			append(div2, input1);

    			input1.value = ctx.custom.width;

    			append(div2, t4);
    			append(div2, input2);

    			input2.value = ctx.custom.height;

    			append(div2, t5);
    			append(div2, button);
    		},

    		p: function update(changed, ctx) {
    			if (changed.justResolved) {
    				each_value_2 = ctx.justResolved;

    				for (var i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_2(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}
    				each_blocks_1.length = each_value_2.length;
    			}

    			if (changed.cellClasses || changed.$board || changed.enemy) {
    				each_value_1 = ctx.$board;

    				for (var i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value_1.length;
    			}

    			if (changed.$conf) {
    				set_style(div1, "width", "" + 20 * ctx.$conf.width + "px");
    			}

    			if (changed.custom && (input0.value !== ctx.custom.seed)) input0.value = ctx.custom.seed;
    			if (changed.custom && (input1.value !== ctx.custom.width)) input1.value = ctx.custom.width;
    			if (changed.custom && (input2.value !== ctx.custom.height)) input2.value = ctx.custom.height;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div1);
    			}

    			destroy_each(each_blocks_1, detaching);

    			destroy_each(each_blocks, detaching);

    			if (detaching) {
    				detach(t1);
    				detach(div2);
    			}

    			run_all(dispose);
    		}
    	};
    }

    // (400:8) {#each justResolved as anim}
    function create_each_block_2(ctx) {
    	var div, div_style_value, addDeathAnimation_action;

    	return {
    		c: function create() {
    			div = element("div");
    			attr(div, "class", "death");
    			attr(div, "style", div_style_value = ctx.anim);
    			add_location(div, file, 400, 10, 10337);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			addDeathAnimation_action = addDeathAnimation.call(null, div) || {};
    		},

    		p: function update(changed, ctx) {
    			if ((changed.justResolved) && div_style_value !== (div_style_value = ctx.anim)) {
    				attr(div, "style", div_style_value);
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

    // (405:6) {#each $board as fig, i}
    function create_each_block_1(ctx) {
    	var div, div_class_value;

    	return {
    		c: function create() {
    			div = element("div");
    			attr(div, "id", ctx.i);
    			attr(div, "class", div_class_value = "cell " + ctx.cellClasses(ctx.fig) + "\r\n          " + (ctx.fig.possible && !ctx.fig.frozen && ctx.fig == ctx.enemy ? 'aimed' : '') + "\r\n          " + (ctx.fig.dream && !ctx.fig.resolved && !ctx.fig.frozen? 'dream' : ''));
    			add_location(div, file, 405, 8, 10468);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.$board || changed.enemy) && div_class_value !== (div_class_value = "cell " + ctx.cellClasses(ctx.fig) + "\r\n          " + (ctx.fig.possible && !ctx.fig.frozen && ctx.fig == ctx.enemy ? 'aimed' : '') + "\r\n          " + (ctx.fig.dream && !ctx.fig.resolved && !ctx.fig.frozen? 'dream' : ''))) {
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

    // (425:2) {#if page == 'files'}
    function create_if_block(ctx) {
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
    			add_location(ul, file, 426, 6, 11072);
    			attr(div, "class", "files");
    			add_location(div, file, 425, 4, 11045);
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

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (439:12) {:else}
    function create_else_block(ctx) {
    	var span, t_value = ctx.save[0] == 'auto' ? 'AUTO' : '', t;

    	return {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			add_location(span, file, 439, 14, 11526);
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

    // (432:12) {#if save[0] != 'auto' && save[1] != '#NEW'}
    function create_if_block_1(ctx) {
    	var button, t, button_data_tooltip_value, dispose;

    	function click_handler_3(...args) {
    		return ctx.click_handler_3(ctx, ...args);
    	}

    	return {
    		c: function create() {
    			button = element("button");
    			t = text("X");
    			attr(button, "class", "tooltip-bottom");
    			button.dataset.tooltip = button_data_tooltip_value = lang.tip_erase;
    			add_location(button, file, 432, 14, 11297);
    			dispose = listen(button, "click", click_handler_3);
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

    // (428:8) {#each [...$saves].sort((a, b) =>            Number(a[0].substr(5)) < Number(b[0].substr(5)) ? -1 : 1          ) as save}
    function create_each_block(ctx) {
    	var li, t0, button, t1_value = ctx.save[1] == '#NEW' ? 'Save in a new slot' : ctx.save[1], t1, t2, dispose;

    	function select_block_type_5(ctx) {
    		if (ctx.save[0] != 'auto' && ctx.save[1] != '#NEW') return create_if_block_1;
    		return create_else_block;
    	}

    	var current_block_type = select_block_type_5(ctx);
    	var if_block = current_block_type(ctx);

    	function click_handler_4(...args) {
    		return ctx.click_handler_4(ctx, ...args);
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
    			add_location(button, file, 441, 12, 11605);
    			add_location(li, file, 430, 10, 11219);
    			dispose = listen(button, "click", click_handler_4);
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
    			if (current_block_type === (current_block_type = select_block_type_5(ctx)) && if_block) {
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

    function create_fragment(ctx) {
    	var t0, div5, div1, button0, t2, div0, button1, t4, button2, t6, button3, t8, div2, t9, t10, div3, t11, div4, t12, div7, raw_value = { board: lang.what, files: lang.what_files }[ctx.page], raw_after, t13, div6, t14, button4, div7_class_value, t16, div10, div8, h4, t18, big, t19, span0, t20_value = ctx.$debrief.score, t20, t21, br0, t22, br1, t23, t24_value = ctx.$debrief.dreamsResolved, t24, t25, span1, t26, t27, t28, t29_value = ctx.$debrief.turns, t29, t30, t31, br2, t32, small, t33, br3, t34, br4, t35, u, a, t36_value = ctx.$debrief.challengeUrl, t36, a_href_value, t37, br5, t38, br6, t39, div9, button5, t41, button6, div10_class_value, t43, div11, t44, dispose;

    	var if_block0 = (ctx.enemy && ctx.enemy.battle && ctx.enemy.battler) && create_if_block_5(ctx);

    	function select_block_type_4(ctx) {
    		if (ctx.page == 'board') return create_if_block_4;
    		return create_else_block_1;
    	}

    	var current_block_type = select_block_type_4(ctx);
    	var if_block1 = current_block_type(ctx);

    	var if_block2 = (ctx.page == 'board') && create_if_block_3(ctx);

    	var each_value_3 = ctx.statsOrder;

    	var each_blocks = [];

    	for (var i = 0; i < each_value_3.length; i += 1) {
    		each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    	}

    	var if_block3 = (ctx.page == 'board') && create_if_block_2(ctx);

    	var if_block4 = (ctx.page == 'files') && create_if_block(ctx);

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
    			div2 = element("div");
    			t9 = space();
    			if_block1.c();
    			t10 = space();
    			div3 = element("div");
    			t11 = space();
    			div4 = element("div");
    			if (if_block2) if_block2.c();
    			t12 = space();
    			div7 = element("div");
    			raw_after = element('noscript');
    			t13 = space();
    			div6 = element("div");
    			t14 = space();
    			button4 = element("button");
    			button4.textContent = "Ok, got it";
    			t16 = space();
    			div10 = element("div");
    			div8 = element("div");
    			h4 = element("h4");
    			h4.textContent = "Board clear";
    			t18 = space();
    			big = element("big");
    			t19 = text("Score:\r\n      ");
    			span0 = element("span");
    			t20 = text(t20_value);
    			t21 = text("\r\n    =\r\n    ");
    			br0 = element("br");
    			t22 = space();
    			br1 = element("br");
    			t23 = space();
    			t24 = text(t24_value);
    			t25 = space();
    			span1 = element("span");
    			t26 = text(" dream");
    			t27 = text("\r\n    cells * 100\r\n    ");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t28 = text("\r\n    - ");
    			t29 = text(t29_value);
    			t30 = text(" turns * 3");
    			t31 = space();
    			br2 = element("br");
    			t32 = space();
    			small = element("small");
    			t33 = text("Challenge url - you can share it with someone who wants to try and beat your\r\n    record on this board:\r\n    ");
    			br3 = element("br");
    			t34 = space();
    			br4 = element("br");
    			t35 = space();
    			u = element("u");
    			a = element("a");
    			t36 = text(t36_value);
    			t37 = space();
    			br5 = element("br");
    			t38 = space();
    			br6 = element("br");
    			t39 = space();
    			div9 = element("div");
    			button5 = element("button");
    			button5.textContent = "Undo";
    			t41 = space();
    			button6 = element("button");
    			button6.textContent = "Edit board";
    			t43 = space();
    			div11 = element("div");
    			if (if_block3) if_block3.c();
    			t44 = space();
    			if (if_block4) if_block4.c();
    			add_location(button0, file, 303, 4, 7633);
    			add_location(button1, file, 305, 6, 7690);
    			add_location(button2, file, 306, 6, 7741);
    			add_location(button3, file, 307, 6, 7801);
    			attr(div0, "class", "dropdown");
    			add_location(div0, file, 304, 4, 7660);
    			attr(div1, "class", "menu");
    			add_location(div1, file, 302, 2, 7609);
    			attr(div2, "class", "spacer");
    			add_location(div2, file, 310, 2, 7879);
    			attr(div3, "class", "spacer");
    			add_location(div3, file, 332, 2, 8497);
    			attr(div4, "class", "turns");
    			add_location(div4, file, 333, 2, 8523);
    			attr(div5, "class", "header");
    			add_location(div5, file, 301, 0, 7585);
    			add_location(div6, file, 347, 2, 8988);
    			add_location(button4, file, 348, 2, 8999);
    			attr(div7, "class", div7_class_value = "bottom panel " + (ctx.$what ? '' : 'panel-hidden-ne'));
    			add_location(div7, file, 345, 0, 8863);
    			add_location(h4, file, 354, 4, 9175);
    			attr(span0, "class", ctx.rainbow);
    			add_location(span0, file, 357, 6, 9228);
    			add_location(big, file, 355, 4, 9201);
    			add_location(br0, file, 360, 4, 9298);
    			add_location(br1, file, 361, 4, 9310);
    			attr(span1, "class", ctx.rainbow);
    			add_location(span1, file, 363, 4, 9353);
    			add_location(div8, file, 353, 2, 9164);
    			add_location(br2, file, 372, 2, 9604);
    			add_location(br3, file, 376, 4, 9736);
    			add_location(br4, file, 377, 4, 9748);
    			add_location(small, file, 373, 2, 9614);
    			attr(a, "href", a_href_value = ctx.$debrief.challengeUrl);
    			add_location(a, file, 380, 4, 9779);
    			add_location(br5, file, 381, 4, 9844);
    			add_location(br6, file, 382, 4, 9856);
    			add_location(button5, file, 384, 6, 9908);
    			add_location(button6, file, 385, 6, 9953);
    			attr(div9, "class", "buttons-horizontal");
    			add_location(div9, file, 383, 4, 9868);
    			add_location(u, file, 379, 2, 9770);
    			attr(div10, "class", div10_class_value = "center panel " + (ctx.$state.complete && ctx.page == 'board' ? '' : 'panel-hidden-n'));
    			add_location(div10, file, 351, 0, 9070);
    			attr(div11, "class", "main");
    			add_location(div11, file, 390, 0, 10033);

    			dispose = [
    				listen(button1, "click", ctx.toggleWhat),
    				listen(button2, "click", ctx.click_handler),
    				listen(button3, "click", ctx.click_handler_1),
    				listen(button4, "click", ctx.click_handler_2),
    				listen(button5, "click", ctx.undo),
    				listen(button6, "click", customize)
    			];
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			insert(target, div5, anchor);
    			append(div5, div1);
    			append(div1, button0);
    			append(div1, t2);
    			append(div1, div0);
    			append(div0, button1);
    			append(div0, t4);
    			append(div0, button2);
    			append(div0, t6);
    			append(div0, button3);
    			append(div5, t8);
    			append(div5, div2);
    			append(div5, t9);
    			if_block1.m(div5, null);
    			append(div5, t10);
    			append(div5, div3);
    			append(div5, t11);
    			append(div5, div4);
    			if (if_block2) if_block2.m(div4, null);
    			insert(target, t12, anchor);
    			insert(target, div7, anchor);
    			append(div7, raw_after);
    			raw_after.insertAdjacentHTML("beforebegin", raw_value);
    			append(div7, t13);
    			append(div7, div6);
    			append(div7, t14);
    			append(div7, button4);
    			insert(target, t16, anchor);
    			insert(target, div10, anchor);
    			append(div10, div8);
    			append(div8, h4);
    			append(div8, t18);
    			append(div8, big);
    			append(big, t19);
    			append(big, span0);
    			append(span0, t20);
    			append(div8, t21);
    			append(div8, br0);
    			append(div8, t22);
    			append(div8, br1);
    			append(div8, t23);
    			append(div8, t24);
    			append(div8, t25);
    			append(div8, span1);
    			append(span1, t26);
    			append(div8, t27);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div8, null);
    			}

    			append(div8, t28);
    			append(div8, t29);
    			append(div8, t30);
    			append(div10, t31);
    			append(div10, br2);
    			append(div10, t32);
    			append(div10, small);
    			append(small, t33);
    			append(small, br3);
    			append(small, t34);
    			append(small, br4);
    			append(div10, t35);
    			append(div10, u);
    			append(u, a);
    			append(a, t36);
    			append(u, t37);
    			append(u, br5);
    			append(u, t38);
    			append(u, br6);
    			append(u, t39);
    			append(u, div9);
    			append(div9, button5);
    			append(div9, t41);
    			append(div9, button6);
    			insert(target, t43, anchor);
    			insert(target, div11, anchor);
    			if (if_block3) if_block3.m(div11, null);
    			append(div11, t44);
    			if (if_block4) if_block4.m(div11, null);
    		},

    		p: function update(changed, ctx) {
    			if (ctx.enemy && ctx.enemy.battle && ctx.enemy.battler) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    				} else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (current_block_type === (current_block_type = select_block_type_4(ctx)) && if_block1) {
    				if_block1.p(changed, ctx);
    			} else {
    				if_block1.d(1);
    				if_block1 = current_block_type(ctx);
    				if (if_block1) {
    					if_block1.c();
    					if_block1.m(div5, t10);
    				}
    			}

    			if (ctx.page == 'board') {
    				if (if_block2) {
    					if_block2.p(changed, ctx);
    				} else {
    					if_block2 = create_if_block_3(ctx);
    					if_block2.c();
    					if_block2.m(div4, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if ((changed.page) && raw_value !== (raw_value = { board: lang.what, files: lang.what_files }[ctx.page])) {
    				detach_before(raw_after);
    				raw_after.insertAdjacentHTML("beforebegin", raw_value);
    			}

    			if ((changed.$what) && div7_class_value !== (div7_class_value = "bottom panel " + (ctx.$what ? '' : 'panel-hidden-ne'))) {
    				attr(div7, "class", div7_class_value);
    			}

    			if ((changed.$debrief) && t20_value !== (t20_value = ctx.$debrief.score)) {
    				set_data(t20, t20_value);
    			}

    			if ((changed.$debrief) && t24_value !== (t24_value = ctx.$debrief.dreamsResolved)) {
    				set_data(t24, t24_value);
    			}

    			if (changed.fg || changed.statsOrder || changed.bigNum || changed.$debrief) {
    				each_value_3 = ctx.statsOrder;

    				for (var i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3(ctx, each_value_3, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div8, t28);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value_3.length;
    			}

    			if ((changed.$debrief) && t29_value !== (t29_value = ctx.$debrief.turns)) {
    				set_data(t29, t29_value);
    			}

    			if ((changed.$debrief) && t36_value !== (t36_value = ctx.$debrief.challengeUrl)) {
    				set_data(t36, t36_value);
    			}

    			if ((changed.$debrief) && a_href_value !== (a_href_value = ctx.$debrief.challengeUrl)) {
    				attr(a, "href", a_href_value);
    			}

    			if ((changed.$state || changed.page) && div10_class_value !== (div10_class_value = "center panel " + (ctx.$state.complete && ctx.page == 'board' ? '' : 'panel-hidden-n'))) {
    				attr(div10, "class", div10_class_value);
    			}

    			if (ctx.page == 'board') {
    				if (if_block3) {
    					if_block3.p(changed, ctx);
    				} else {
    					if_block3 = create_if_block_2(ctx);
    					if_block3.c();
    					if_block3.m(div11, t44);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
    			}

    			if (ctx.page == 'files') {
    				if (if_block4) {
    					if_block4.p(changed, ctx);
    				} else {
    					if_block4 = create_if_block(ctx);
    					if_block4.c();
    					if_block4.m(div11, null);
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
    				detach(div5);
    			}

    			if_block1.d();
    			if (if_block2) if_block2.d();

    			if (detaching) {
    				detach(t12);
    				detach(div7);
    				detach(t16);
    				detach(div10);
    			}

    			destroy_each(each_blocks, detaching);

    			if (detaching) {
    				detach(t43);
    				detach(div11);
    			}

    			if (if_block3) if_block3.d();
    			if (if_block4) if_block4.d();
    			run_all(dispose);
    		}
    	};
    }

    function customize() {}

    function goTo(conf) {
      window.location.search = "?" + new URLSearchParams(conf).toString();
    }

    function addDeathAnimation(node) {
      node.animate(
        [
          { opacity: 1, transform: "translate(0) rotate3d(1, 0, 0, 0deg)" },
          { opacity: 0, transform: `translate(${Math.random()*60 - 30}px, -70px) rotate3d(${Math.random()*180 - 90}, ${Math.random()*180 - 90}, ${Math.random()*180 - 90}, ${Math.random()*180 - 90}deg)` }
        ],
        { duration: 200, easing: "ease-out", fill: "forwards" }
      );
    }

    function func(a, b) {
    	return Number(a[0].substr(5)) < Number(b[0].substr(5)) ? -1 : 1;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $game, $what, $abridgedAnalysis, $state, $debrief, $conf, $board, $saves;

    	validate_store(game, 'game');
    	subscribe($$self, game, $$value => { $game = $$value; $$invalidate('$game', $game); });
    	validate_store(what, 'what');
    	subscribe($$self, what, $$value => { $what = $$value; $$invalidate('$what', $what); });
    	validate_store(abridgedAnalysis, 'abridgedAnalysis');
    	subscribe($$self, abridgedAnalysis, $$value => { $abridgedAnalysis = $$value; $$invalidate('$abridgedAnalysis', $abridgedAnalysis); });
    	validate_store(state, 'state');
    	subscribe($$self, state, $$value => { $state = $$value; $$invalidate('$state', $state); });
    	validate_store(debrief, 'debrief');
    	subscribe($$self, debrief, $$value => { $debrief = $$value; $$invalidate('$debrief', $debrief); });
    	validate_store(conf, 'conf');
    	subscribe($$self, conf, $$value => { $conf = $$value; $$invalidate('$conf', $conf); });
    	validate_store(board, 'board');
    	subscribe($$self, board, $$value => { $board = $$value; $$invalidate('$board', $board); });
    	validate_store(saves, 'saves');
    	subscribe($$self, saves, $$value => { $saves = $$value; $$invalidate('$saves', $saves); });

    	

      let enemy;
      let page = "board";
      let hovered;
      let mousePosition = [0, 0];

      let colors = $game.colors;
      let fg = {};
      let bg = {};
      for (let c in colors) {
        fg[c] = "fg-" + colors[c]; $$invalidate('fg', fg);
        bg[c] = "bg-" + colors[c];  }

      let chrome = navigator.userAgent.search("Chrome") >= 0;
      let rainbow = "rainbow" + (chrome ? " rainbow-animation" : "");

      let custom = {};

      const statsOrder = "str vit def spd".split(" ");

      conf.subscribe(v => Object.assign(custom, v));

      let justResolved = [];

      function animateDeath(fig) {
        if(!fig)
          return;
        let color = fig.color;
        let added = [];
        for (let cell of fig.cells) {
          added.push(
            `left:${(cell % $game.width) * 20}px;top:${Math.floor(
          cell / $game.width
        ) * 20}px;background:${color}`
          );
        }
        $$invalidate('justResolved', justResolved = justResolved.length>20?added:justResolved.concat(added));
      }

      function clickCell(e) {
        if (e.button != 0) return;
        if (e.shiftKey) $game.logFigAt(e.target.id);
        else {
          animateDeath($game.attackFigAt(e.target.id));
        }
      }

      function hoverCell(e) {
        hovered = e.target.id;
      }

      function showInfo() {
        let fig = $game.figAt(hovered);
        hovered = null;
        if (!fig || fig.resolved) {
          $$invalidate('enemy', enemy = null);
        } else {
          fig.updateBattler();
          $$invalidate('enemy', enemy = fig);
        }
      }

      function unHoverCell(e) {
        hovered = enemy = null; $$invalidate('enemy', enemy);
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
        justResolved.length = 0; $$invalidate('justResolved', justResolved);
      }

      let bigNumLetters = " K M B t q Q s S o n d U D T Qt Qd Sd St O N v c".split(
        " "
      );

      function bigNum(n) {
        let i;
        for (i = 0; Math.abs(n) > 10000 && i < bigNumLetters.length; i++) n /= 1000;
        return Math.round(n) + bigNumLetters[i];
      }

      function open(p) {
        hovered = enemy = null; $$invalidate('enemy', enemy);
        $$invalidate('page', page = p);
        if (p == "files") updateSaves();
      }

      function playCustom() {
        for (let k in custom) { custom[k] = +custom[k]; $$invalidate('custom', custom); }
        $game.start(custom);
        goTo(custom);
      }

      function toggleWhat() {
        $what = !$what; what.set($what);
      }

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

      function cellClasses(fig) {
        let classes = [
          fig.dream && !fig.resolved ? "bg-none" : bg[fig.kind],
          fig.resolved && !fig.dream ? "resolved" : ""
        ];

        if (fig.frozen) {
          classes.push("frozen");
        } else {
          classes = classes.concat([
            fig.dream && fig.resolved && chrome ? "rainbow-animation" : "",
            fig.possible ? "attackable" : "",
            fig.dream || fig.possible || (fig.resolved && fig.reached)
              ? ""
              : "darken"
          ]);
        }
        classes = classes.filter(s => s != "").join(" ");
        return classes;
      }

      window.onkeydown = e => {
        switch (e.code) {
          case "KeyS":
            newSave();
            return;
          case "KeyF":
            if (page == "files") open("board");
            else open("files");
            return;
          case "KeyB":
            open("board");
            return;
          case "KeyH":
            toggleWhat();
            return;
          case "KeyU":
            undo();
            return;
        }
      };

    	function div_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			$$invalidate('analysis', analysis = $$value);
    		});
    	}

    	function click_handler(e) {
    		return open('board');
    	}

    	function click_handler_1(e) {
    		return open('files');
    	}

    	function click_handler_2(e) {
    		const $$result = ($what = false);
    		what.set($what);
    		return $$result;
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

    	function click_handler_3({ save }, e) {
    		return deleteSave(save[0]);
    	}

    	function click_handler_4({ save }, e) {
    		return (save[1] == '#NEW' ? newSave(save[0]) : loadSave(save[0]));
    	}

    	return {
    		enemy,
    		page,
    		fg,
    		rainbow,
    		custom,
    		statsOrder,
    		justResolved,
    		clickCell,
    		hoverCell,
    		unHoverCell,
    		analysis,
    		analysisPosition,
    		moveTimeout,
    		undo,
    		bigNum,
    		open,
    		playCustom,
    		toggleWhat,
    		deleteSave,
    		loadSave,
    		newSave,
    		cellClasses,
    		Math,
    		$what,
    		$abridgedAnalysis,
    		$state,
    		$debrief,
    		$conf,
    		$board,
    		$saves,
    		div_binding,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		input0_input_handler,
    		input1_input_handler,
    		input2_input_handler,
    		click_handler_3,
    		click_handler_4
    	};
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, []);
    	}
    }

    window.onload = function(){    

    app = new App({
        target: document.body,
        props:{game: Game.create()}
      });

    };

    return app;

}());
