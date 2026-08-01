(function (global, factory) {
  'use strict';
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  }
  else if (typeof define === 'function' && define.amd) {
    define(factory);
  }
  else {
    global._routing = factory();
  }
}(this, function () {
  "use strict";

  var
    _routing = _e.instance('routing'),
    has_window = typeof window !== 'undefined',
    has_history = has_window && !!window.history,
    has_own_prop = Object.prototype.hasOwnProperty;

  // Direct property copy. Note: Prototype properties of 'source'
  // are deliberately ignored for security due to the hasOwnProperty guard.
  function extend(target, source) {
    for (var key in source) {
      if (has_own_prop.call(source, key)) {
        target[key] = source[key];
      }
    }
    return target;
  }

  // Recursive deep clone compatible with ES5 and modern collections
  function deepClone(obj, cache) {
    if (typeof structuredClone === 'function') {
      return structuredClone(obj);
    }

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
      var clone_map = new Map();
      cache.set(obj, clone_map);
      obj.forEach(function (value, key) {
        clone_map.set(deepClone(key, cache), deepClone(value, cache));
      });
      return clone_map;
    }

    // Deep clone for Set
    if (obj instanceof Set) {
      var clone_set = new Set();
      cache.set(obj, clone_set);
      obj.forEach(function (value) {
        clone_set.add(deepClone(value, cache));
      });
      return clone_set;
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
      if (has_own_prop.call(obj, key)) {
        clone[key] = deepClone(obj[key], cache);
      }
    }
    return clone;
  }

  // Routing regular expression generation
  function parseRoute(path) {
    var
      keys = [],
      sanitized_path = path;

    if (sanitized_path !== '/' && sanitized_path.charAt(sanitized_path.length - 1) === '/') {
      sanitized_path = sanitized_path.slice(0, -1);
    }

    // The path is analyzed using a prioritized order of alternatives:
    // 1. Parameters (required or optional with a single leading slash '?')
    // 2. Strict escaping of special characters (including '/' for proper anchoring)
    // 3. Wildcards '*'
    var regex_str = sanitized_path.replace(
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
      regexp: new RegExp('^' + regex_str + '$'),
      keys: keys
    };
  }

  // Routes punctuation
  function getSpecificityScore(pattern) {
    if (pattern === '*') return [1];
    var
      parts = pattern.split('/'),
      score = [];
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

  // Context Constructor
  function Context(path, state, basepath) {
    var
      origin = (has_window && window.location.origin) || 'http://localhost',
      resolved_path = path;

    /*
    Previous (without double slash guards):
    if (resolved_path.indexOf('/') === 0 && basepath) {
        var has_base_path = resolved_path === basepath || resolved_path.indexOf(basepath + '/') === 0;
        if (!has_base_path) {
            resolved_path = basepath + resolved_path;
        }
    }
    */

    // The following IF was added in order to avoid double slash
    if (resolved_path.indexOf('/') === 0 && basepath) {
      var
        basepath_with_slash = basepath.charAt(basepath.length - 1) === '/' ? basepath : basepath + '/',
        has_base_path = resolved_path === basepath || resolved_path.indexOf(basepath_with_slash) === 0;

      if (!has_base_path) {
        var clean_base = basepath.charAt(basepath.length - 1) === '/' ? basepath.slice(0, -1) : basepath;
        resolved_path = clean_base + resolved_path;
      }
    }

    var url = new URL(resolved_path, origin);
    this.canonicalPath = url.pathname + url.search + url.hash;

    var clean_path = url.pathname;
    if (basepath && clean_path.indexOf(basepath) === 0) {
      clean_path = clean_path.slice(basepath.length);
    }
    if (clean_path.charAt(0) !== '/') {
      clean_path = '/' + clean_path;
    }

    // Consistently remove the trailing slash for strict '$' matching
    if (clean_path !== '/' && clean_path.charAt(clean_path.length - 1) === '/') {
      clean_path = clean_path.slice(0, -1);
    }

    this.path = clean_path + url.search + url.hash;
    this.pathname = clean_path || '/';
    this.querystring = url.search.slice(1);

    var raw_state = deepClone(state) || {};

    if (raw_state.path && raw_state.path !== this.canonicalPath) {
      console.warn('_routing: Router is overwriting state.path from "' + raw_state.path + '" to "' + this.canonicalPath + '"');
    }
    if (raw_state.cleanPath && raw_state.cleanPath !== this.path) {
      console.warn('_routing: Router is overwriting state.cleanPath from "' + raw_state.cleanPath + '" to "' + this.path + '"');
    }

    this.state = extend(raw_state, {
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
      var
        search = url.search.substring(1),
        pairs = search.split('&');
      for (var i = 0; i < pairs.length; i++) {
        var
          pair = pairs[i].split('='),
          key = decodeURIComponent(pair[0].replace(/\+/g, ' ')),
          value = pair[1] !== undefined ? decodeURIComponent(pair[1].replace(/\+/g, ' ')) : '';
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
    if (has_history) {
      window.history.pushState(this.state, document.title, this.canonicalPath);
    }
  };

  Context.prototype.save = function () {
    if (has_history) {
      window.history.replaceState(this.state, document.title, this.canonicalPath);
    }
  };

  // IMPORTANT: Functions that depends each other STARTS HERE
  var
    routes = new Map(),
    basepath = '',
    running = false,
    error_listeners = [];

  // Strict ES5-compatible router signature
  var router = {};

  // Returns a shallow copy to prevent direct modifications of the internal reference
  router.onError = function (callback) {
    if (arguments.length === 0) {
      return error_listeners.slice();
    }
    if (typeof callback === 'function') {
      error_listeners.push(callback);
    }
  };

  router.offError = function (callback) {
    if (callback === undefined) {
      error_listeners = [];
    } else {
      error_listeners = error_listeners.filter(function (cb) {
        return cb !== callback;
      });
    }
  };

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
    var
      matches = [],
      iterator = routes.entries(),
      entry;
    while (!(entry = iterator.next()).done) {
      var
        pattern = entry.value[0],
        route = entry.value[1],
        m = route.regexp.exec(ctx.pathname);

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
        var
          score_a = a.score[i] !== undefined ? a.score[i] : -1,
          score_b = b.score[i] !== undefined ? b.score[i] : -1;
        if (score_a !== score_b) {
          return score_b - score_a;
        }
      }
      return 0;
    });

    var
      current_match_index = 0,
      current_callback_index = 0;

    function next() {
      if (current_match_index >= matches.length) {
        if (callback) callback();
        return;
      }

      var
        match = matches[current_match_index],
        callbacks = match.callbacks;

      if (current_callback_index >= callbacks.length) {
        current_match_index++;
        current_callback_index = 0;
        next();
        return;
      }

      var fn = callbacks[current_callback_index++];
      ctx.params = match.params;
      ctx.routePath = match.pattern;

      try {
        fn(ctx, next);
      } catch (err) {
        if (error_listeners.length > 0) {
          for (var k = 0; k < error_listeners.length; k++) {
            error_listeners[k](err, ctx);
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
    var target_url;
    try {
      target_url = new URL(href, origin);
    } catch (err) {
      return;
    }

    if (target_url.origin !== window.location.origin) return;

    e.preventDefault();
    router.show(target_url.pathname + target_url.search + target_url.hash);
  }

  function onPopState(e) {
    if (e.state) {
      var path = (e.state.cleanPath !== undefined && e.state.cleanPath !== null)
        ? e.state.cleanPath
        : e.state.path;
      router.replace(path, e.state, true, false);
    } else {
      var current_path = window.location.pathname + window.location.search + window.location.hash;
      router.show(current_path, null, true, false);
    }
  }

  router.base = function (path) {
    if (path && typeof path !== 'string') {
      console.error('_routing: "base" path is "' + _e.type(path).join(', ') + '" not a String:', path);
      return basepath;
    }

    if (arguments.length === 0) return basepath;

    basepath = path;
    // The following IF was added in order to avoid double slash
    if (basepath && basepath !== '/' && basepath.charAt(basepath.length - 1) === '/') {
      basepath = basepath.slice(0, -1);
    }
  };

  router.start = function (options) {
    if (running) return true;
    running = true;

    var opts = options || {};

    if (has_window && opts.click !== false) {
      window.addEventListener('click', clickHandler, false);
    }
    if (has_window && opts.popstate !== false) {
      window.addEventListener('popstate', onPopState, false);
    }

    if (opts.dispatch !== false && has_window) {
      var initial_path = window.location.pathname + window.location.search + window.location.hash;
      router.replace(initial_path, null, true, false);
    }

    return false;
  };

  router.stop = function () {
    if (!running) return false;
    running = false;
    if (has_window) {
      window.removeEventListener('click', clickHandler, false);
      window.removeEventListener('popstate', onPopState, false);
    }

    return true;
  };

  router.show = function (path, state, dispatchRoute, push) {
    var ctx = new Context(path, state, basepath);
    if (push !== false) {
      ctx.pushState();
    }
    if (dispatchRoute !== false) {
      dispatch(ctx);
    }
    return ctx;
  };

  router.replace = function (path, state, dispatchRoute, replace) {
    var ctx = new Context(path, state, basepath);
    if (replace !== false) {
      ctx.save();
    }
    if (dispatchRoute !== false) {
      dispatch(ctx);
    }
    return ctx;
  };

  router.redirect = function (from, to) {
    if (typeof from === 'string' && typeof to === 'string') {
      _routing(from, function () {
        defer(function () {
          router.replace(to);
        });
      });
    } else if (typeof from === 'string' && to === undefined) {
      defer(function () {
        router.replace(from);
      });
    }
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
          console.warn('_routing: Callback not found for path: ' + path);
          return false;
        } else {
          route.callbacks.splice(index, 1);
          if (route.callbacks.length === 0) {
            routes.delete(path);
          }
          return true;
        }
      } else {
        console.warn('_routing: Path not registered: ' + path);
        return false;
      }
    }
  };

  // Main routing exposed functions
  _routing.fn(function (path) {
    var callbacks;
    if(typeof path === 'function') {
      callbacks = Array.prototype.slice.call(arguments);
      register('*', callbacks);
    }
    else if (arguments.length > 1) {
      if (typeof path !== 'string') {
        var e = new Error('Route path must be a String.');
        e.name = '';
        throw e;
      }
      callbacks = Array.prototype.slice.call(arguments, 1);
      register(path, callbacks);
    }
    else if (typeof path === 'string') {
      router.show(path);
    }
    else if (path === undefined || (path && typeof path === 'object' && !Array.isArray(path))) {
      router.start(path);
    }
    else {
      console.warn('_routing: Invalid argument passed:', path);
    }
  });

  _routing.base = router.base;
  _routing.start = router.start;
  _routing.stop = router.stop;
  _routing.show = router.show;
  _routing.replace = router.replace;
  _routing.redirect = router.redirect;
  _routing.off = router.off;
  _routing.onError = router.onError;
  _routing.offError = router.offError;

  return _routing;
}));
