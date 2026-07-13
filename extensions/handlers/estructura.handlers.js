(function (global, factory) {
  'use strict';
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  }
  else if (typeof define === 'function' && define.amd) {
    define(factory);
  }
  else {
    global._handlers = factory();
  }
}(this, function () {
  'use strict';

  function _error(message, original_error) {
    original_error = original_error || new Error();
    original_error.name = '_handlers';
    original_error.message = message;
    throw original_error;
  }

  var _events_check = typeof _events;
  if (_events_check === 'undefined' || _events_check !== 'function') {
    _error('"_events" extension required before "_handlers".');
  }

  var
    _e_cache,
    _e_ids_re = /\s+/g,
    _e_trim_re = /^\s+|\s+$/g,
    _e_handlers_re = /[\s\,]+/,
    _e_handlers_ids_re = /[\|\.]+/,
    _e_handler_str_int = 'data-e-handler',
    _e_handlers_str = '[' + _e_handler_str_int + ']',
    _e_handler_event_required = '"' + _e_handler_str_int + '-event" required.',
    _e_handler_id_required = '"' + _e_handler_str_int + '-id" required.',
    _e_handler_required = '"' + _e_handler_str_int + '" required.',
    _e_reserved = {
      'liveElement': 1,
      'initialElement': 1,
      'connect': 1,
      'ready': 1,
      'mount': 1,
      'unmount': 1,
      'mounted': 1
    },
    _e_non_bubbling = {
      'load': 1,
      'unload': 1,
      'error': 1,
      'scroll': 1,
      'resize': 1,
      'abort': 1,
      'focus': 1,
      'blur': 1,
      'mouseenter': 1,
      'mouseleave': 1
    },
    _e_public_handlers = Object.create(null),
    _handlers = _e.instance('handlers');

  var
    _e_cache_create = function () {
      var _cache = [];
      _cache.values = [];
      return _cache;
    },
    _e_cache_has = function (cache, key) {
      return cache.indexOf(key);
    },
    _e_cache_get = function (cache, key) {
      var cached = _e_cache_has(cache, key);
      return cached !== -1 ? cache.values[cached] : undefined;
    },
    _e_cache_register = function (cache, key, value) {
      cache.push(key);
      cache.values.push(value);
    },
    _e_cache_delete = function (cache, key) {
      var cached = _e_cache_has(cache, key);
      if (cached === -1) { return; }
      cache.splice(cached, 1);
      cache.values.splice(cached, 1);
    };

  if (typeof WeakMap !== 'undefined') {
    _e_cache_create = function () {
      var _cache = Object.create(null);
      _cache.object = new WeakMap();
      _cache.string = new Map();
      _cache._ = new Map();
      return _cache;
    };
    _e_cache_has = function (cache, key) {
      return (cache[key ? typeof key : '_'] || cache._).has(key);
    };
    _e_cache_get = function (cache, key) {
      var cached = _e_cache_has(cache, key);
      return cached ? (cache[key ? typeof key : '_'] || cache._).get(key) : undefined;
    };
    _e_cache_register = function (cache, key, value) {
      (cache[key ? typeof key : '_'] || cache._).set(key, value);
    };
    _e_cache_delete = function (cache, key) {
      (cache[key ? typeof key : '_'] || cache._).delete(key);
    };
  }

  _e_cache = _e_cache_create();

  /*
  function _kebab_case(str) {
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
  }
  */

  function _kebab_case(str) {
    var result = '';
    var len = str.length;

    for (var i = 0; i < len; i++) {
      var code = str.charCodeAt(i);

      if (code >= 65 && code <= 90) { // A-Z
        var prevCode = i > 0 ? str.charCodeAt(i - 1) : 0;
        var nextCode = i + 1 < len ? str.charCodeAt(i + 1) : 0;

        var prevIsLowerOrDigit = (prevCode >= 97 && prevCode <= 122) || (prevCode >= 48 && prevCode <= 57);
        var prevIsUpper = prevCode >= 65 && prevCode <= 90;
        var nextIsLower = nextCode >= 97 && nextCode <= 122;

        if (i > 0 && (prevIsLowerOrDigit || (prevIsUpper && nextIsLower))) {
          result += '-';
        }
        result += String.fromCharCode(code + 32); // = .toLowerCase()
      } else {
        result += str.charAt(i);
      }
    }

    return result;
  }

  function _check_object(object) {
    if (!object || typeof object !== 'object') {
      _error('"' + _e.type(object).join(', ') + '" must be an Object.');
    }
  }

  function _clear_handler_str(str) {
    return (str || '').replace(_e_ids_re, ' ').replace(_e_trim_re, '').split(_e_handlers_re);
  }

  function _clear_handler_id(str) {
    return (str || '').replace(_e_ids_re, '');
  }

  function _spli_event_types(id, events, events_bubbling, events_bubbling_private, events_nonBubbling, events_nonBubbling_private, element, data) {
    var
      bubbling = false,
      nonBubbling = false;

    events_nonBubbling_private.events = events_nonBubbling_private.events || Object.create(null);
    events_nonBubbling_private.ids = events_nonBubbling_private.ids || Object.create(null);

    events_bubbling_private.events = events_bubbling_private.events || Object.create(null);
    events_bubbling_private.ids = events_bubbling_private.ids || Object.create(null);

    for (var i = 0; i < events.length; i++) {
      var
        _event = events[i],
        name = _event.split('.')[0],
        _name = name + '._e_handler_id_' + id;

      if (_e_non_bubbling[name]) {
        events_nonBubbling[name] = true;
        events_nonBubbling_private.events[_name] = true;

        events_nonBubbling_private.ids[id] = events_nonBubbling_private.ids[id] || Object.create(null);
        events_nonBubbling_private.ids[id][_name] = true;
        nonBubbling = true;
        continue;
      }

      if (!events_bubbling[name]) {
        events_bubbling[name] = { elements: _e_cache_create() };
      }

      events_bubbling_private.events[_name] = true;

      events_bubbling_private.ids[id] = events_bubbling_private.ids[id] || Object.create(null);
      events_bubbling_private.ids[id][_name] = true;

      _e_cache_register(events_bubbling[name].elements, element, data);
      bubbling = true;

    }

    return { bubbling: bubbling, nonBubbling: nonBubbling };
  }

  function _extend(source, target, mode) {
    for (var key in target) {
      if (typeof key !== 'string') { continue; }
      if (!mode && typeof source[key] !== 'undefined') {
        console.warn('Key "' + key + '" from target already exists in source, not overwritten.');
        continue;
      }
      source[key] = target[key];
    }

    return source;
  }

  function _resolve_shortcut(_source, name, visited) {
    visited = visited || Object.create(null);
    name = (name || '').trim();

    if (visited[name]) {
      _error('Circular shortcut reference detected: ' + name);
    }

    var
      target = _source[name],
      type = typeof target;

    if (type === 'function' || type === 'undefined') {
      return [name];
    }

    visited[name] = true;

    var target_array = _e.type(target)['Array'] ? target : [target];
    var resolved = [];

    for (var i = 0; i < target_array.length; i++) {
      var item = target_array[i];
      if (typeof item === 'string') {
        var nested = _resolve_shortcut(_source, item, visited);
        for (var j = 0; j < nested.length; j++) {
          resolved.push(nested[j]);
        }
      }
    }

    delete visited[name];
    return resolved;
  }

  function _get_set(target, _var, _value, set_callback, get_callback) {
    if (typeof target[_var] === 'undefined') {
      Object.defineProperty(target, _var, {
        get: function () {
          try {
            if (typeof get_callback === 'function') { _value = get_callback.call(target, _value); }
            return _value;
          }
          catch (e) {
            _error('"' + _var + '" get error: ' + e.message, e);
          }
        },
        set: function (value) {
          try {
            if (typeof set_callback === 'function') { value = set_callback.call(target, value, _value); }
            _value = value;
          }
          catch (e) {
            _error('"' + _var + '" set error: ' + e.message, e);
          }
        },
        enumerable: true,
        configurable: false
      });
    }
  }

  function _const(target, _var, _value) {
    if (typeof target[_var] === 'undefined') {
      Object.defineProperty(target, _var, {
        value: _value,
        writable: false,
        enumerable: true,
        configurable: false
      });
    }
  }

  function _e_handlers_execute(_source, id, handler, event, middleware, _return) {
    handler = Array.prototype.slice.call(handler, 0);

    var
      _event_type = typeof event,
      _event_type_fn = _event_type === 'function',
      _middleware_type = typeof middleware,
      _direct_mode = _event_type === 'function';

    for (var i = 0; i < handler.length; i++) {
      handler[i] = handler[i].trim();
      handler[i] = _resolve_shortcut(_source, handler[i]);

      for (var j = 0; j < handler[i].length; j++) {
        if (typeof handler[i][j] !== 'string') { continue; }

        var _handlers_ids = handler[i][j].split(_e_handlers_ids_re);
        var _handler = _handlers_ids[0];

        _handlers_ids = (_handlers_ids.length ? _handlers_ids.slice(1) : []);

        if (typeof _source[_handler] !== 'function') {
          _error('Unknown handler: ' + _handler);
        }

        if (_direct_mode) { // Direct mode
          try {
            event.call(_source[_handler], _handler, _handlers_ids);
          }
          catch (e) {
            _error('"' + _handler + '" sequential direct: ' + e.message, e);
          }
          continue;
        }

        if (middleware) { // If only _event_type_fn is used causes sequential mode executes first
          continue;
        }

        var k = 0;
        do {
          // Sequential mode

          try {
            var
              _id = _handlers_ids[k++],
              _id_present = id && _id && _source[_handler][_id],
              _ctx = (id ? (_source[_handler][_id_present ? _id : id]) : _source[_handler]);

            _source[_handler].call(_ctx, event);
          }
          catch (e) {
            _error('"' + _handler + '" sequential: ' + e.message, e);
          }
        }
        while (!id ? false : k < _handlers_ids.length);
      }
    }

    if (middleware) {
      _direct_mode = _middleware_type === 'function';

      var _middleware = function (data) {
        //console.info('_handlers: Middleware for:', handler);
        return data;
      };

      for (var i = handler.length - 1; i >= 0; i--) {
        for (var j = handler[i].length - 1; j >= 0; j--) {
          if (typeof handler[i][j] !== 'string') { continue; }

          var _handlers_ids = handler[i][j].split(_e_handlers_ids_re);
          var _handler = _handlers_ids[0];

          _handlers_ids = (_handlers_ids.length ? _handlers_ids.slice(1) : []);

          if (typeof _source[_handler] !== 'function') {
            _error('Unknown handler: ' + _handler);
          }

          if (_direct_mode) { // Direct mode
            try {
              var _middleware_intent = middleware.call(_source[_handler], _handler, _handlers_ids, _middleware);
              if (typeof _middleware_intent !== 'function') { continue; }
              _middleware = _middleware_intent;
            }
            catch (e) {
              _error('"' + _handler + '" middleware direct: ' + e.message, e);
            }
            continue;
          }

          if (_event_type_fn) { continue; }

          var k = 0;
          do {
            // Middleware mode

            var
              _id = _handlers_ids[k++],
              _id_present = id && _id && _source[_handler][_id],
              _ctx = (id ? (_source[_handler][_id_present ? _id : id]) : _source[_handler]);

            _middleware = (function (ctx, _handler, _id, _event, _middleware) {
              return function (data) {
                try {
                  return _source[_handler].call(ctx, _event, data, _middleware);
                }
                catch (e) {
                  _error('"' + _handler + '" middleware: ' + e.message, e);
                }
              };
            })(_ctx, _handler, id, event, _middleware);
          }
          while (!id ? false : k < _handlers_ids.length);
        }
      }

      _middleware(Object.create(null));
    }

    return _return || handler;
  };

  function _e_execute_fn(_source, state, handlers, id, middleware) {
    if (handlers && typeof handlers === 'object' && handlers.length) {
      if (!middleware) {
        return function (data) {
          console.info('_handlers:', state, id);
          return _e_handlers_execute(_source, null, handlers, _e_handlers_ids(_source, null, function (handler, _id) {
            try {
              handler.call(handler[_id], data);
            }
            catch (e) {
              _error('"' + _id + '" direct sequential execution: ' + e.message, e);
            }
          }), data);
        };
      }

      return function (data) {
        console.info('_handlers:', state, id);
        return _e_handlers_execute(_source, null, handlers, null, function (_handler, _handler_ids, _middleware) {
          var _middlewares = _handler_ids.length ? _handler_ids : Object.keys(_source[_handler]);
          for (var i = _middlewares.length - 1; i >= 0; i--) {
            var _id = _middlewares[i];
            if (!_source[_handler][_id] || typeof _source[_handler][_id] !== 'object') { continue; }

            _middleware = (function (__id, __data, __middleware) {
              return function (data) {
                try {
                  return _source[_handler].call(_source[_handler][__id], __data, data, __middleware);
                }
                catch (e) {
                  _error('"' + _handler + '.' + _id + '" direct middleware execution: ' + e.message, e);
                }
              };
            })(_id, data, _middleware);
          }

          return _middleware;
        }, data);
      }
    }
  }

  function _e_handlers_ids(_source, ids, callback) {
    ids = (typeof ids === 'string' ? [ids] : _e.type(ids)['Array'] ? ids : []);
    return function (_handler, _handler_ids) {
      var handler = _source[_handler];
      for (var __id in handler) {
        if ((_handler_ids.length && _handler_ids.indexOf(__id) === -1) || (ids.length && ids.indexOf(__id) === -1)) { continue; }

        try {
          callback(handler, __id);
        }
        catch (e) {
          _error(e.message, e);
        }
      }
    }
  }

  function _e_handlers_register(_source, id, element, elementClone, component) {
    return function (_handler) {
      if (this[id]) {
        return console.info('_handlers: Handler "' + _handler + '.' + id + '" already used.');
      }

      var _component = _extend(Object.create(null), component);
      this[id] = Object.create(null);

      _const(this[id], 'mount', function () { return _component.mountFn.call(_component); });
      _get_set(this[id], 'mounted', !_component.ignored, null, function(){ return !_component.ignored; });
      _const(this[id], 'unmount', function () { return _component.unmountFn.call(_component); });

      if (_component.ignored) {
        return;
      }

      _const(this[id], 'liveElement', element);
      _const(this[id], 'initialElement', elementClone);

      _get_set(this[id], 'ready', true);

      _handler = 'data-e-' + _kebab_case(_handler);

      var _middleware = this[id].initialElement.hasAttribute(_handler + '-middleware');

      var _data_connect = _handler + '-connect';
      var data_connect = this[id].initialElement.getAttribute(_data_connect);

      if (data_connect) {
        _data_connect = data_connect.split(_e_handlers_re);
        _e_handlers_execute(_source, id, _data_connect, _e_handlers_register(_source, id, element, elementClone, _component), _middleware);

        _const(this[id], 'connect', function (state, data, ids) {
          var _state = typeof state === 'string';
          var _data = typeof data === 'undefined';
          if (_state && _e_reserved[state]) {
            return console.warn('_handlers:', _handler, id, 'Wrong target:', state);
          }

          _e_handlers_execute(_source, null, _data_connect, _e_handlers_ids(_source, ids, function (handler, _id) {
            if (_state && !_data) {
              handler[_id][state] = data;
              return;
            }

            if (_data) {
              return handler.call(handler[_id], state);
            }

            console.warn('_handlers: Wrong connect:', state, data, ids);
          }), _middleware);
        });
      }
      else {
        _const(this[id], 'connect', function () {
          console.info('_handlers: Nothing to be connected, add "' + _data_connect + '".');
        });
      }

      var data_success = this[id].initialElement.getAttribute(_handler + '-success');
      var _data_success = (data_success ? data_success.split(_e_handlers_re) : []);

      _e_handlers_execute(_source, id, _data_success, _e_handlers_register(_source, id, element, elementClone, _component), _middleware);
      _get_set(this[id], 'success', false, _e_execute_fn(_source, _handler + ' success', _data_success, id, _middleware));

      var data_error = this[id].initialElement.getAttribute(_handler + '-error');
      var _data_error = (data_error ? data_error.split(_e_handlers_re) : []);

      _e_handlers_execute(_source, id, _data_error, _e_handlers_register(_source, id, element, elementClone, _component), _middleware);
      _get_set(this[id], 'error', false, _e_execute_fn(_source, _handler + ' error', _data_error, id, _middleware));
    }
  }

  function _e_end(handlers) {
    return _e_nodes(function (start_nodes, _start_node, _start_node_type) {
      var
        ids = [],
        handlers_list = [],
        event_bubbling = Object.create(null),
        event_bubbling_private = Object.create(null),
        event_nonBubbling = [],
        event_nonBubbling_private = Object.create(null);

      if (_start_node && !_start_node_type) {
        _e_nodes_iteration([_start_node], _e_collect_metadata(ids, handlers_list, event_bubbling, event_bubbling_private, event_nonBubbling, event_nonBubbling_private));
      }

      _e_nodes_iteration(start_nodes, _e_collect_metadata(ids, handlers_list, event_bubbling, event_bubbling_private, event_nonBubbling, event_nonBubbling_private));

      for (var i = 0; i < handlers_list.length; i++) {
        var _handler = _resolve_shortcut(handlers, handlers_list[i]);

        for (var j = 0; j < _handler.length; j++) {
          var _handler_fn = handlers[_handler[j]];
          if (typeof _handler_fn !== 'function') { continue; }

          for (var k = 0; k < ids.length; k++) {
            if (_handler_fn[ids[k]]) {
              //console.log(_handler[j], ids[k], _handler_fn[ids[k]]);

              if (_handler_fn[ids[k]].liveElement) {
                var _event;
                if (event_bubbling_private.ids[ids[k]]) {
                  _event = _events(document.documentElement);
                  _event.off(Object.keys(event_bubbling_private.ids[ids[k]]).join(','));
                }

                if (event_nonBubbling_private.ids[ids[k]]) {
                  _event = _events(_handler_fn[ids[k]].liveElement);
                  _event.off(Object.keys(event_nonBubbling_private.ids[ids[k]]).join(','));
                }
              }

              delete _handler_fn[ids[k]];
            }
          }
        }
      }

      _e_cache_delete(_e_cache, _start_node);
    });
  }

  function _e_collect_metadata(_ids, _handlers, event_bubbling, event_bubbling_private, event_nonBubbling, event_nonBubbling_private) {
    return function (element) {
      var id = _clear_handler_id(element.getAttribute('data-e-handler-id'));
      if (!id) { return; }

      var handler_list = _clear_handler_str(element.getAttribute('data-e-handler'));
      if (!handler_list[0]) { return; }

      _ids.push(id);
      for (var i = 0; i < handler_list.length; i++) { _handlers.push(handler_list[i]); }

      var _handler_event = element.hasAttribute('data-e-handler-event');
      if (_handler_event) {
        var _handler_events = _clear_handler_str(element.getAttribute('data-e-handler-event'));
        if (!_handler_events[0]) { return; }

        _spli_event_types(id, _handler_events, event_bubbling, event_bubbling_private, event_nonBubbling, event_nonBubbling_private);
      }
    }
  }

  function _e_nodes(callback) {
    return function (args, start_node) {
      var cached = _e_cache_get(_e_cache, start_node);
      if (typeof cached !== 'undefined') {
        return callback.apply(null, cached);
      }

      try {
        var
          _start_node = start_node,
          _start_node_type = typeof start_node === 'string';

        if (start_node) {
          if (!_start_node_type) {
            _check_object(start_node);
          }

          try {
            start_node = (!_start_node_type ? start_node : document.querySelector(start_node)).querySelectorAll(_e_handlers_str);
          }
          catch (e) {
            _error('Start Node must not be: ' + _e.type(start_node).join(', ') + ', or: ' + e.message, e);
          }
        }

        var start_nodes = (start_node ? start_node : document.querySelectorAll(_e_handlers_str));
        var start_values = [start_nodes, _start_node, _start_node_type, Object.create(null)];

        // If start_node is a String, subsequent calls to .start(StringNodeStr) with the same CSS selector will use the cached elements. It is required to apply .end(StringNodeStr) and call .start() again to update the selected nodes.
        _e_cache_register(_e_cache, _start_node, start_values);

        callback.apply(null, start_values);
      }
      catch (e) {
        _error('DOM iteration: ' + e.message, e);
      }
    }
  }

  function _e_start(handlers) {
    return _e_nodes(function (start_nodes, _start_node, _start_node_type, _events_ref) {
      var
        end_starts = Object.create(null),
        event_bubbling = Object.create(null),
        event_bubbling_private = Object.create(null),
        event_nonBubbling = [],
        event_nonBubbling_private = Object.create(null);

      if (_start_node && !_start_node_type) {
        _e_iteration(handlers, [_start_node], end_starts, event_bubbling, event_bubbling_private, event_nonBubbling, event_nonBubbling_private);
      }

      _e_iteration(handlers, start_nodes, end_starts, event_bubbling, event_bubbling_private, event_nonBubbling, event_nonBubbling_private);

      // Set bubbling event listeners before 'end_starts'
      var _events_bubbling_ref = Object.keys(event_bubbling_private.events).join(',');
      if (_events_bubbling_ref && !_events_ref[_events_bubbling_ref]) {
        _events_ref[_events_bubbling_ref] = true;

        _events(document.documentElement).on(_events_bubbling_ref, function (event) {
          var _event = event_bubbling[event.type];
          if (_event) {
            var _current = event.target;
            while (_current) {
              var _match = _e_cache_get(_event.elements, _current);
              if (typeof _match !== 'undefined') {
                  var _data = _match;
                  _data[2] = event;
                  _e_handlers_execute.apply(null, [handlers].concat(_data));
                  return;
              }
              _current = _current.parentNode;
            }
          }
        }, { capture: true });

        // Set non bubbling event listeners before 'end_starts'
        for (var i = 0; i < event_nonBubbling.length; i++) { event_nonBubbling[i](); }

        // Execute 'end_starts' handler_list
        for (var key in end_starts) {
          if (end_starts[key].length < 1) { continue; }
          var callback = 0;
          while (callback < end_starts[key].length) {
            end_starts[key][callback].fn(end_starts[key][callback].handler);
            callback++;
          }
        }
      }
    });
  }

  function _e_nodes_iteration(nodes, callback){
    for (var i = 0, parentIgnoredElement, previousElement; i < nodes.length; i++) {
      if (parentIgnoredElement) {
        if (parentIgnoredElement.contains(nodes[i])) { continue; }
        parentIgnoredElement = null;
      }

      parentIgnoredElement = callback(nodes[i], previousElement, nodes[i + 1]);
      previousElement = nodes[i];
    }
  }

  function _e_iteration(_handlers_source, start_nodes, end_starts, event_bubbling, event_bubbling_private, event_nonBubbling, event_nonBubbling_private){
    _e_nodes_iteration(start_nodes, function (element, previous, next) {
      var id = _clear_handler_id(element.getAttribute('data-e-handler-id'));
      if (!id) {
        _error(_e_handler_id_required);
      }

      var handler_list = _clear_handler_str(element.getAttribute('data-e-handler'));
      if (!handler_list[0]) {
        _error(_e_handler_required);
      }

      var
        _element = element.cloneNode(true),
        _handler_middleware = element.hasAttribute('data-e-handler-middleware');

      var
        component = {
        fragment: null,
        fragmentPlaceholder: null,

        ignored: element.hasAttribute('data-e-handler-ignore'),

        unmountFn: function () {
          try {
            if (element.isConnected && element.parentNode && element.parentNode.isConnected) {
              console.log('_handlers unmount:', id);
              this.fragment = document.createDocumentFragment();
              this.fragmentPlaceholder = document.createComment(id);

              element.parentNode.replaceChild(this.fragmentPlaceholder, element);
              this.fragment.appendChild(element);

              this.ignored = true;
              return this.fragment;
            }
          }
          catch(e){
            _error('unmount: ' + e.message, e);
          }
          console.warn('_handlers unmount: "' + id + '" Node or parent disconnected from DOM.');
        },

        mountFn: function () {
          try {
            if (this.fragment && this.fragmentPlaceholder && this.fragmentPlaceholder.isConnected && this.fragmentPlaceholder.parentNode && this.fragmentPlaceholder.parentNode.isConnected) {
              console.log('_handlers mount:', id);

              this.fragmentPlaceholder.parentNode.replaceChild(this.fragment, this.fragmentPlaceholder);

              this.fragment = null;
              this.fragmentPlaceholder = null;
              this.ignored = false;
              return element;
            }
          }
          catch(e){
            _error('mount: ' + e.message, e);
          }

          console.warn('_handlers mount: "' + id + '" Node or parent disconnected from DOM.');
        }
      };

      if (component.ignored) {
        console.info('_handlers ignored:', id, handler_list);
        component.unmountFn();
        element.removeAttribute('data-e-handler-ignore');
      }

      _e_handlers_execute(
        _handlers_source, id, handler_list,
        _e_handlers_register(_handlers_source, id, element, _element, component),
        _handler_middleware
      );

      if (component.ignored) {
        return element;
      }

      var _handler_event = element.hasAttribute('data-e-handler-event');
      if (_handler_event) {
        var _handler_events = _clear_handler_str(element.getAttribute('data-e-handler-event'));
        if (!_handler_events[0]) {
          _error(_e_handler_event_required);
        }

        var
          _event_nonBubbling = Object.create(null),
          _event_nonBubbling_private = Object.create(null),
          _handler_event_types = _spli_event_types(id, _handler_events, event_bubbling, event_bubbling_private, _event_nonBubbling, _event_nonBubbling_private, element, [id, handler_list, null, _handler_middleware]);

        if (_handler_event_types.nonBubbling) {
          _extend(event_nonBubbling_private, _event_nonBubbling_private.events);

          event_nonBubbling.push(function () {
            _events(element).on(Object.keys(_event_nonBubbling_private.events).join(','), function (event) {
              _e_handlers_execute(_handlers_source, id, handler_list, event, _handler_middleware);
            });
          });
        }
      }

      var _handler_start = element.hasAttribute('data-e-handler-start');
      var _handler_start_fn = function (_handlers, event) {
        try {
          _e_handlers_execute(_handlers_source, id, _handlers, event || Object.create(null), _handler_middleware);
        }
        catch (e) {
          _error('"' + id + '"."' + _handlers.toString() + '" error: ' + e.message, e);
        }
      };

      if (_handler_start) {
        var start_handlers = _clear_handler_str(element.getAttribute('data-e-handler-start'));
        if (!start_handlers[0]) { start_handlers = handler_list; }

        _e_handlers_execute(_handlers_source, id, start_handlers, _e_handlers_register(_handlers_source, id, element, _element, component), _handler_middleware)

        _handler_start_fn(start_handlers);
      }

      var _handler_end =  element.hasAttribute('data-e-handler-end-start');
      if (_handler_end) {
        var end_handlers = _clear_handler_str(element.getAttribute('data-e-handler-end-start'));
        if (!end_handlers[0]) { end_handlers = handler_list; }

        _e_handlers_execute(_handlers_source, id, end_handlers, _e_handlers_register(_handlers_source, id, element, _element, component), _handler_middleware)

        var _id = end_handlers.toString();
        if (!end_starts[_id]) { end_starts[_id] = []; }
        end_starts[_id].push({ handler: end_handlers, fn: _handler_start_fn });
      }
    });
  }

  _handlers.fn(function () {
    var handlers = Object.create(null);

    for (var handler = 0; handler < arguments.length; handler++) {
      var _handlers_arg = arguments[handler];

      if(typeof _handlers_arg === 'string' && _e_public_handlers[_handlers_arg]){
        _handlers_arg = _e_public_handlers[_handlers_arg];
      }

      _check_object(_handlers_arg);
      _extend(handlers, _handlers_arg);
    }

    return {
      public: function (args, name) {
        if (typeof name !== 'string') {
          _error('Handlers public name must be a String, not: ' + _e.type(name).join(', '));
        }

        if (name.length < 1 || name.length > 128) {
          _error('Handlers public name must be between 1 and 128 characters long.');
        }

        if (_e_public_handlers[name]) {
          _error('Handlers public name already used: ' + name);
        }

        _e_public_handlers[name] = handlers;

        console.info('_handlers: Public "' + name + '" handlers registered.');
      },

      start: _e_start(handlers),
      end: _e_end(handlers)
    }
  });

  return _handlers;
}));
