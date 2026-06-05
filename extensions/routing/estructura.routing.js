function _routing() {
    var routes = new Map();
    var basepath = '';
    var running = false;
    var errorListeners = [];

    var hasWindow = typeof window !== 'undefined';
    var hasHistory = hasWindow && !!window.history;

    // Strict ES5-compatible router signature
    function router(path) {
        var callbacks;
        if (typeof path === 'function') {
            callbacks = Array.prototype.slice.call(arguments);
            register('*', callbacks);
        } else if (arguments.length > 1) {
            if (typeof path !== 'string') {
                throw new TypeError('Route path must be a string');
            }
            callbacks = Array.prototype.slice.call(arguments, 1);
            register(path, callbacks);
        } else if (typeof path === 'string') {
            router.show(path);
        } else if (path === undefined || (path && typeof path === 'object' && !Array.isArray(path))) {
            router.start(path);
        } else {
            console.warn('Invalid argument passed to router():', path);
        }
        return router;
    }

    // Returns a shallow copy to prevent direct modifications of the internal reference
    router.onError = function (callback) {
        if (arguments.length === 0) {
            return errorListeners.slice();
        }
        if (typeof callback === 'function') {
            errorListeners.push(callback);
        }
        return router;
    };

    router.offError = function (callback) {
        if (callback === undefined) {
            errorListeners = [];
        } else {
            errorListeners = errorListeners.filter(function (cb) {
                return cb !== callback;
            });
        }
        return router;
    };

    // Direct property copy. Note: Prototype properties of 'source'
    // are deliberately ignored for security due to the hasOwnProperty guard.
    function extend(target, source) {
        for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                target[key] = source[key];
            }
        }
        return target;
    }

    // Recursive deep clone compatible with ES5 and modern collections
    function deepClone(obj, cache) {
        if (obj === null || typeof obj === 'function' || typeof obj !== 'object') {
            return obj;
        }
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        if (obj instanceof RegExp) {
            var flags = '';
            if (obj.global) flags += 'g';
            if (obj.ignoreCase) flags += 'i';
            if (obj.multiline) flags += 'm';
            if (obj.unicode) flags += 'u';
            if (obj.sticky) flags += 'y';
            // 'dotAll' (s) and 'hasIndices' (d) are omitted to guarantee strict compatibility
            return new RegExp(obj.source, flags);
        }

        cache = cache || new Map();
        if (cache.has(obj)) {
            return cache.get(obj);
        }

        // Deep clone for Map
        if (obj instanceof Map) {
            var cloneMap = new Map();
            cache.set(obj, cloneMap);
            obj.forEach(function (value, key) {
                cloneMap.set(deepClone(key, cache), deepClone(value, cache));
            });
            return cloneMap;
        }

        // Deep clone for Set
        if (obj instanceof Set) {
            var cloneSet = new Set();
            cache.set(obj, cloneSet);
            obj.forEach(function (value) {
                cloneSet.add(deepClone(value, cache));
            });
            return cloneSet;
        }

        // Secure support for ArrayBuffer
        if (typeof ArrayBuffer !== 'undefined' && obj instanceof ArrayBuffer) {
            return obj.slice(0);
        }

        // Support for TypedArrays / ArrayBuffer views correcting the byteOffset offset
        if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(obj)) {
            return new obj.constructor(
                obj.buffer.slice(obj.byteOffset, obj.byteOffset + obj.byteLength)
            );
        }

        var clone = Array.isArray(obj) ? [] : {};
        cache.set(obj, clone);

        for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                clone[key] = deepClone(obj[key], cache);
            }
        }
        return clone;
    }

    // Context Constructor
    function Context(path, state) {
        var origin = (hasWindow && window.location.origin) || 'http://localhost';
        var resolvedPath = path;

        /*
        Previous (without double slash guards):
        if (resolvedPath.indexOf('/') === 0 && basepath) {
            var hasBasepath = resolvedPath === basepath || resolvedPath.indexOf(basepath + '/') === 0;
            if (!hasBasepath) {
                resolvedPath = basepath + resolvedPath;
            }
        }
        */

        // The following IF was added in order to avoid double slash
        if (resolvedPath.indexOf('/') === 0 && basepath) {
            var basepathWithSlash = basepath.charAt(basepath.length - 1) === '/' ? basepath : basepath + '/';
            var hasBasepath = resolvedPath === basepath || resolvedPath.indexOf(basepathWithSlash) === 0;

            if (!hasBasepath) {
                var cleanBase = basepath.charAt(basepath.length - 1) === '/' ? basepath.slice(0, -1) : basepath;
                resolvedPath = cleanBase + resolvedPath;
            }
        }

        var url = new URL(resolvedPath, origin);
        this.canonicalPath = url.pathname + url.search + url.hash;

        var cleanPath = url.pathname;
        if (basepath && cleanPath.indexOf(basepath) === 0) {
            cleanPath = cleanPath.slice(basepath.length);
        }
        if (cleanPath.charAt(0) !== '/') {
            cleanPath = '/' + cleanPath;
        }

        // Consistently remove the trailing slash for strict '$' matching
        if (cleanPath !== '/' && cleanPath.charAt(cleanPath.length - 1) === '/') {
            cleanPath = cleanPath.slice(0, -1);
        }

        this.path = cleanPath + url.search + url.hash;
        this.pathname = cleanPath || '/';
        this.querystring = url.search.slice(1);

        var rawState = deepClone(state) || {};

        if (rawState.path && rawState.path !== this.canonicalPath) {
            console.warn('Router is overwriting state.path from "' + rawState.path + '" to "' + this.canonicalPath + '"');
        }
        if (rawState.cleanPath && rawState.cleanPath !== this.path) {
            console.warn('Router is overwriting state.cleanPath from "' + rawState.cleanPath + '" to "' + this.path + '"');
        }

        this.state = extend(rawState, {
            path: this.canonicalPath,
            cleanPath: this.path
        });

        this.params = {};
        this.hash = url.hash.slice(1);

        // Manual query string processing.
        // Note on types: Repeated keys accumulate an array of strings.
        // Single occurrences return a plain string.
        this.query = {};
        if (url.search) {
            var search = url.search.substring(1);
            var pairs = search.split('&');
            for (var i = 0; i < pairs.length; i++) {
                var pair = pairs[i].split('=');
                var key = decodeURIComponent(pair[0].replace(/\+/g, ' '));
                var value = pair[1] !== undefined ? decodeURIComponent(pair[1].replace(/\+/g, ' ')) : '';
                if (key) {
                    if (this.query[key] !== undefined) {
                        this.query[key] = [].concat(this.query[key], value);
                    } else {
                        this.query[key] = value;
                    }
                }
            }
        }
    }

    Context.prototype.pushState = function () {
        if (hasHistory) {
            window.history.pushState(this.state, document.title, this.canonicalPath);
        }
    };

    Context.prototype.save = function () {
        if (hasHistory) {
            window.history.replaceState(this.state, document.title, this.canonicalPath);
        }
    };

    // Routing regular expression generation
    function parseRoute(path) {
        var keys = [];
        var sanitizedPath = path;

        if (sanitizedPath !== '/' && sanitizedPath.charAt(sanitizedPath.length - 1) === '/') {
            sanitizedPath = sanitizedPath.slice(0, -1);
        }

        // The path is analyzed using a prioritized order of alternatives:
        // 1. Parameters (required or optional with a single leading slash '?')
        // 2. Strict escaping of special characters (including '/' for proper anchoring)
        // 3. Wildcards '*'
        var regexString = sanitizedPath.replace(
            /(\/)?:(\w+)(\?)?|([.+\/\\^${}()[\]|])|(\*)/g,
            function (_, slash, name, optional, special, wildcard) {
                if (wildcard) {
                    keys.push('wildcard');
                    return '(.*)';
                }
                if (name) {
                    keys.push(name);
                    if (optional) {
                        // The (?=\/|$) lookahead ensures that the preceding literal segment is delimited before the optional parameter
                        return '(?=\\/|$)(?:\\/([^/]+))?';
                    }
                    // Preserves the preceding slash of the required parameter if present
                    return (slash || '') + '([^/]+)';
                }
                return '\\' + special;
            }
        );

        return {
            regexp: new RegExp('^' + regexString + '$'),
            keys: keys
        };
    }

    function getSpecificityScore(pattern) {
        if (pattern === '*') return [1];
        var parts = pattern.split('/');
        var score = [];
        for (var j = 0; j < parts.length; j++) {
            var part = parts[j];
            if (part === '') continue;
            if (part.indexOf(':') === 0) {
                score.push(10);
            } else if (part === '*') {
                score.push(1);
            } else {
                score.push(100);
            }
        }
        return score;
    }

    function register(path, callbacks) {
        var parsed = parseRoute(path);
        routes.set(path, {
            regexp: parsed.regexp,
            keys: parsed.keys,
            callbacks: callbacks,
            score: getSpecificityScore(path)
        });
    }

    // Synchronous sequential middleware dispatch. Execution is synchronous
    // unless the consumer manually defers calling 'next()'.
    function dispatch(ctx, callback) {
        var matches = [];

        var iterator = routes.entries();
        var entry;
        while (!(entry = iterator.next()).done) {
            var pattern = entry.value[0];
            var route = entry.value[1];
            var m = route.regexp.exec(ctx.pathname);

            if (m) {
                var params = {};
                for (var i = 0; i < route.keys.length; i++) {
                    var val = m[i + 1];
                    params[route.keys[i]] = val ? decodeURIComponent(val) : val;
                }
                matches.push({
                    callbacks: route.callbacks,
                    params: params,
                    pattern: pattern,
                    score: route.score
                });
            }
        }

        matches.sort(function (a, b) {
            var len = Math.max(a.score.length, b.score.length);
            for (var i = 0; i < len; i++) {
                var scoreA = a.score[i] !== undefined ? a.score[i] : -1;
                var scoreB = b.score[i] !== undefined ? b.score[i] : -1;
                if (scoreA !== scoreB) {
                    return scoreB - scoreA;
                }
            }
            return 0;
        });

        var currentMatchIndex = 0;
        var currentCallbackIndex = 0;

        function next() {
            if (currentMatchIndex >= matches.length) {
                if (callback) callback();
                return;
            }

            var match = matches[currentMatchIndex];
            var callbacks = match.callbacks;

            if (currentCallbackIndex >= callbacks.length) {
                currentMatchIndex++;
                currentCallbackIndex = 0;
                next();
                return;
            }

            var fn = callbacks[currentCallbackIndex++];
            ctx.params = match.params;
            ctx.routePath = match.pattern;

            try {
                fn(ctx, next);
            } catch (err) {
                if (errorListeners.length > 0) {
                    for (var k = 0; k < errorListeners.length; k++) {
                        errorListeners[k](err, ctx);
                    }
                } else {
                    throw err;
                }
            }
        }

        next();
    }

    function clickHandler(e) {
        var button = e.which !== undefined ? e.which : e.button;
        if (button !== 1) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (e.defaultPrevented) return;

        var el = e.target;
        while (el && el.nodeName.toUpperCase() !== 'A') {
            el = el.parentNode;
        }
        if (!el || el.nodeName.toUpperCase() !== 'A') return;

        if (el.hasAttribute('download') || el.getAttribute('rel') === 'external' || el.hasAttribute('data-e-routing-excluded')) return;

        var href = el.getAttribute('href');
        if (!href) return;
        if (/^(mailto|tel|sms|javascript|data):/i.test(href)) return;

        var origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
        var targetUrl;
        try {
            targetUrl = new URL(href, origin);
        } catch (err) {
            return;
        }

        if (targetUrl.origin !== window.location.origin) return;

        e.preventDefault();
        router.show(targetUrl.pathname + targetUrl.search + targetUrl.hash);
    }

    function onPopState(e) {
        if (e.state) {
            var path = (e.state.cleanPath !== undefined && e.state.cleanPath !== null)
                ? e.state.cleanPath
                : e.state.path;
            router.replace(path, e.state, true, false);
        } else {
            var currentPath = window.location.pathname + window.location.search + window.location.hash;
            router.show(currentPath, null, true, false);
        }
    }

    router.base = function (path) {
        if (arguments.length === 0) return basepath;
        basepath = path;
        // The following IF was added in order to avoid double slash
        if (basepath && basepath !== '/' && basepath.charAt(basepath.length - 1) === '/') {
            basepath = basepath.slice(0, -1);
        }
        return router;
    };

    router.start = function (options) {
        if (running) return router;
        running = true;

        var opts = options || {};

        if (hasWindow && opts.click !== false) {
            window.addEventListener('click', clickHandler, false);
        }
        if (hasWindow && opts.popstate !== false) {
            window.addEventListener('popstate', onPopState, false);
        }

        if (opts.dispatch !== false && hasWindow) {
            var initialPath = window.location.pathname + window.location.search + window.location.hash;
            router.replace(initialPath, null, true, false);
        }
        return router;
    };

    router.stop = function () {
        if (!running) return router;
        running = false;
        if (hasWindow) {
            window.removeEventListener('click', clickHandler, false);
            window.removeEventListener('popstate', onPopState, false);
        }
        return router;
    };

    router.show = function (path, state, dispatchRoute, push) {
        var ctx = new Context(path, state);
        if (push !== false) {
            ctx.pushState();
        }
        if (dispatchRoute !== false) {
            dispatch(ctx);
        }
        return ctx;
    };

    router.replace = function (path, state, dispatchRoute, replace) {
        var ctx = new Context(path, state);
        if (replace !== false) {
            ctx.save();
        }
        if (dispatchRoute !== false) {
            dispatch(ctx);
        }
        return ctx;
    };

    // ES5-compatible microtask implementation (preventing memory leaks)
    var defer = typeof queueMicrotask === 'function' ? queueMicrotask : (function () {
        if (typeof MutationObserver === 'function') {
            return function (fn) {
                var observer = new MutationObserver(function () {
                    observer.disconnect();
                    fn();
                });
                var element = document.createTextNode('');
                observer.observe(element, { characterData: true });
                element.data = '1';
            };
        }
        return function (fn) { setTimeout(fn, 0); };
    })();

    router.redirect = function (from, to) {
        if (typeof from === 'string' && typeof to === 'string') {
            router(from, function () {
                defer(function () {
                    router.replace(to);
                });
            });
        } else if (typeof from === 'string' && to === undefined) {
            defer(function () {
                router.replace(from);
            });
        }
        return router;
    };

    // Removes associated callbacks. Returns a boolean corresponding to the success of the unbinding operation
    router.off = function (path, callback) {
        if (path === undefined) {
            routes.clear();
            return true;
        } else if (callback === undefined) {
            return routes.delete(path);
        } else {
            var route = routes.get(path);
            if (route) {
                var index = route.callbacks.indexOf(callback);
                if (index === -1) {
                    console.warn('Callback not found for path: ' + path);
                    return false;
                } else {
                    route.callbacks.splice(index, 1);
                    if (route.callbacks.length === 0) {
                        routes.delete(path);
                    }
                    return true;
                }
            } else {
                console.warn('Path not registered: ' + path);
                return false;
            }
        }
    };

    return router;
}
