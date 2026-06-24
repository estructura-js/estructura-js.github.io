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

  var
    _e_handlers = {},
    _e_handlers_shortcuts = {},
    _e_ids_re = /\s+/g,
    _e_trim_re = /^\s+|\s+$/g,
    _e_handlers_re = /[\s\,]+/,
    _e_handlers_ids_re = /[\|\.]+/,
    _e_handler_str_int = 'data-e-handler',
    _e_handlers_str = '[' + _e_handler_str_int + ']',
    _e_handler_id_required = '"' + _e_handler_str_int + '-id" required.',
    _e_handler_required = '"' + _e_handler_str_int + '" required.',
    _e_reserved = { 'liveElement': 1, 'initialElement': 1, 'connect': 1, 'ready': 1 },
    _handlers = _e.instance('handlers');

  function _error(message) {
    var e = new Error(message);
    e.name = '_handlers';
    throw e;
  }

  function _extend(source, target, mode) {
    for (var key in target) {
      if (target.hasOwnProperty(key)) {
        if (typeof key !== 'string') { continue; }
        if (!mode && typeof source[key] !== 'undefined') {
          console.warn('Key "' + key + '" from target already exists in source, not overwritten.');
          continue;
        }
        source[key] = target[key];
      }
    }
  }

  function _capitalizeAndCamelCase(str) {
    if (!str) return '';
    str = str.charAt(0).toUpperCase() + str.slice(1);
    return str.replace(/-([a-z])/g, function(match, letter) {
        return letter.toUpperCase();
    });
  }

  function _resolve_shortcut(name, visited) {
    visited = visited || {};
    name = (name || '').trim();

    // Circular control
    if (visited[name]) {
      _error('Circular shortcut reference detected: ' + name);
    }

    var target = _e_handlers_shortcuts[name];

    // Final if not alias
    if (typeof target === 'undefined') {
      return [name];
    }

    visited[name] = true;

    // Normalization
    var target_array = _e.type(target)['Array'] ? target : [target];
    var resolved = [];

    // Recursive
    for (var i = 0; i < target_array.length; i++) {
      var item = target_array[i];
      if (typeof item === 'string') {
        var nested = _resolve_shortcut(item, visited);
        for (var j = 0; j < nested.length; j++) {
          resolved.push(nested[j]);
        }
      }
    }

    // Backtracking
    delete visited[name];
    return resolved;
  }

  function _define(target, _var, _value, set_callback, get_callback) {
    if (typeof target[_var] === 'undefined') {
      Object.defineProperty(target, _var, {
        get: function () {
          try {
            if (typeof get_callback === 'function') { _value = get_callback.call(target, _value); }
            return _value;
          }
          catch (e) {
            _error('define: "' + _var + '" get error: ' + e.message);
          }
        },
        set: function (value) {
          try {
            if (typeof set_callback === 'function') { value = set_callback.call(target, value, _value); }
            _value = value;
          }
          catch (e) {
            _error('define: "' + _var + '" set error: ' + e.message);
          }
        },
        enumerable: true,
        configurable: false
      });
    }
  }

  function _e_handlers_execute(id, handler, event, middleware, _return) {
    handler = Array.prototype.slice.call(handler, 0);

    var
      _event_type = typeof event,
      _event_type_fn = _event_type === 'function',
      _middleware_type = typeof middleware,
      _direct_mode = _event_type === 'function';

    for (var i = 0; i < handler.length; i++) {
      handler[i] = handler[i].trim();
      handler[i] = _resolve_shortcut(handler[i]);

      for (var j = 0; j < handler[i].length; j++) {
        if (typeof handler[i][j] !== 'string') { continue; }

        var _handlers_ids = handler[i][j].split(_e_handlers_ids_re);
        var _handler = _handlers_ids[0];

        _handlers_ids = (_handlers_ids.length ? _handlers_ids.slice(1) : []);

        if (typeof _e_handlers[_handler] !== 'function') {
          _error('Unknown handler: ' + _handler);
        }

        if (_direct_mode) { // Direct mode
          try {
            event.call(_e_handlers[_handler], _handler, _handlers_ids);
          }
          catch (e) {
            _error('"' + _handler + '" sequential direct: ' + e.message);
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
              _id_present = id && _id && _e_handlers[_handler][_id],
              _ctx = (id ? (_e_handlers[_handler][_id_present ? _id : id]) : _e_handlers[_handler]);

            _e_handlers[_handler].call(_ctx, event);
          }
          catch (e) {
            _error('"' + _handler + '" sequential: ' + e.message);
          }
        }
        while (!id ? false : k < _handlers_ids.length);
      }
    }

    if (middleware) {
      _direct_mode = _middleware_type === 'function';

      var _middleware = function (data) {
        //console.info('Middleware for:', handler);
        return data;
      };

      for (var i = handler.length - 1; i >= 0; i--) {
        for (var j = handler[i].length - 1; j >= 0; j--) {
          if (typeof handler[i][j] !== 'string') { continue; }

          var _handlers_ids = handler[i][j].split(_e_handlers_ids_re);
          var _handler = _handlers_ids[0];

          _handlers_ids = (_handlers_ids.length ? _handlers_ids.slice(1) : []);

          if (typeof _e_handlers[_handler] !== 'function') {
            _error('Unknown handler: ' + _handler);
          }

          if (_direct_mode) { // Direct mode
            try {
              var _middleware_intent = middleware.call(_e_handlers[_handler], _handler, _handlers_ids, _middleware);
              if (typeof _middleware_intent !== 'function') { continue; }
              _middleware = _middleware_intent;
            }
            catch (e) {
              _error('"' + _handler + '" middleware direct: ' + e.message);
            }
            continue;
          }

          if (_event_type_fn) { continue; }

          var k = 0;
          do {
            // Middleware mode

            var
              _id = _handlers_ids[k++],
              _id_present = id && _id && _e_handlers[_handler][_id],
              _ctx = (id ? (_e_handlers[_handler][_id_present ? _id : id]) : _e_handlers[_handler]);

            _middleware = (function (ctx, _handler, _id, _event, _middleware) {
              return function (data) {
                try {
                  return _e_handlers[_handler].call(ctx, _event, data, _middleware);
                }
                catch (e) {
                  _error('"' + _handler + '" middleware: ' + e.message);
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

  function _e_execute_fn(state, handlers, id, middleware) {
    if (handlers && typeof handlers === 'object' && handlers.length) {
      if (!middleware) {
        return function (data) {
          console.info('_handlers:', state, id);
          return _e_handlers_execute(null, handlers, _e_handlers_ids(null, function (handler, _id) {
            try {
              handler.call(handler[_id], data);
            }
            catch (e) {
              _error('"' + _id + '" direct sequential execution: ' + e.message);
            }
          }), data);
        };
      }

      return function (data) {
        console.info('_handlers:', state, id);
        return _e_handlers_execute(null, handlers, null, function (_handler, _handler_ids, _middleware) {
          var _middlewares = _handler_ids.length ? _handler_ids : Object.keys(_e_handlers[_handler]);
          for (var i = _middlewares.length - 1; i >= 0; i--) {
            var _id = _middlewares[i];
            if (!_e_handlers[_handler][_id] || typeof _e_handlers[_handler][_id] !== 'object') { continue; }

            _middleware = (function (__id, __data, __middleware) {
              return function (data) {
                try {
                  return _e_handlers[_handler].call(_e_handlers[_handler][__id], __data, data, __middleware);
                }
                catch (e) {
                  _error('"' + _handler + '.' + _id + '" direct middleware execution: ' + e.message);
                }
              };
            })(_id, data, _middleware);
          }

          return _middleware;
        }, data);
      }
    }
  }

  function _e_handlers_ids(ids, callback) {
    ids = (typeof ids === 'string' ? [ids] : _e.type(ids)['Array'] ? ids : []);
    return function (_handler, _handler_ids) {
      var handler = _e_handlers[_handler];
      for (var __id in handler) {
        if (handler.hasOwnProperty(__id)) {
          if ((_handler_ids.length && _handler_ids.indexOf(__id) === -1) || (ids.length && ids.indexOf(__id) === -1)) { continue; }

          try {
            callback(handler, __id);
          }
          catch (e) {
            _error(__id + ': ' + e.message);
          }
        }
      }
    }
  }

  function _e_handlers_register(id, element, _element) {
    return function (_handler) {
      if (this[id]) {
        return console.info('_handlers: Handler "' + _handler + '.' + id + '" already used.');
      }

      this[id] = Object.create(null);
      this[id].liveElement = element;
      this[id].initialElement = _element;

      _define(this[id], 'ready', true);

      _handler = 'e' + _capitalizeAndCamelCase(_handler);

      var _middleware = typeof this[id].initialElement.dataset[_handler + 'Middleware'] !== 'undefined';

      var _data_connect = _handler + 'Connect';
      var data_connect = this[id].initialElement.dataset[_data_connect];

      if (data_connect) {
        _data_connect = data_connect.split(_e_handlers_re);
        _e_handlers_execute(id, _data_connect, _e_handlers_register(id, element, _element), _middleware);

        this[id].connect = function (state, data, ids) {
          var _state = typeof state === 'string';
          var _data = typeof data === 'undefined';
          if (_state && _e_reserved[state]) {
            return console.warn('_handlers:', _handler, id, 'Incorrect target:', state);
          }

          _e_handlers_execute(null, _data_connect, _e_handlers_ids(ids, function (handler, _id) {
            if (_state && !_data) {
              handler[_id][state] = data;
              return;
            }

            if (_data) {
              return handler.call(handler[_id], state);
            }

            console.warn('_handlers: Incorrect connect:', state, data, ids);
          }), _middleware);
        }
      }
      else {
        this[id].connect = function () {
          console.info('Nothing to be connected, add "' + _data_connect + '".');
        };
      }

      var data_success = this[id].initialElement.dataset[_handler + 'Success'];
      var _data_success = (data_success ? data_success.split(_e_handlers_re) : []);

      _e_handlers_execute(id, _data_success, _e_handlers_register(id, element, _element), _middleware);
      _define(this[id], 'success', false, _e_execute_fn(_handler + ' success', _data_success, id, _middleware));

      var data_error = this[id].initialElement.dataset[_handler + 'Error'];
      var _data_error = (data_error ? data_error.split(_e_handlers_re) : []);

      _e_handlers_execute(id, _data_error, _e_handlers_register(id, element, _element), _middleware);
      _define(this[id], 'error', false, _e_execute_fn(_handler + ' error', _data_error, id, _middleware));
    }
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

  _handlers.fn(function (handlers, handlers_shortcuts) {
    _check_object(handlers);

    if (handlers_shortcuts) {
      _check_object(handlers_shortcuts);
      _extend(_e_handlers_shortcuts, handlers_shortcuts);
    }

    _extend(_e_handlers, handlers);

    return {
      start: function (args, start_node) {
        try {
          if (start_node) {
            var _start_node_type = typeof start_node === 'string';
            if (!_start_node_type) {
              _check_object(start_node);
            }

            try {
              start_node = (!_start_node_type ? start_node : document.querySelector(start_node)).querySelectorAll(_e_handlers_str);
            }
            catch (e) {
              throw new Error('Start Node must not be: ' + _e.type(start_node).join(', '));
            }
          }

          var start_nodes = (start_node ? start_node : '>' + _e_handlers_str);
          var end_starts = Object.create(null);

          _dom(start_nodes).each(function (element) {
            var id = _clear_handler_id(element.dataset.eHandlerId);
            if (!id) {
              _error(_e_handler_id_required);
            }

            var handlers = _clear_handler_str(element.dataset.eHandler);
            if (!handlers[0]) {
              _error(_e_handler_required);
            }

            var _element = element.cloneNode();
            var _handler_middleware = typeof element.dataset.eHandlerMiddleware !== 'undefined';
            _e_handlers_execute(id, handlers, _e_handlers_register(id, element, _element), _handler_middleware);

            var _handler_event = typeof element.dataset.eHandlerEvent !== 'undefined';
            if (_handler_event) {
              _events(element).on(element.dataset.eHandlerEvent, function (event) {
                _e_handlers_execute(id, handlers, event, _handler_middleware);
              });
            }

            var _handler_start = typeof element.dataset.eHandlerStart !== 'undefined';
            var _handler_start_fn = function (_handlers, event) {
              try {
                _e_handlers_execute(id, _handlers, event || Object.create(null), _handler_middleware);
              }
              catch (e) {
                _error('"' + id + '"."' + _handlers.toString() + '" error: ' + e.message);
              }
            };

            if (_handler_start) {
              var start_handlers = _clear_handler_str(element.dataset.eHandlerStart);
              if (!start_handlers[0]) { start_handlers = handlers; }
              _e_handlers_execute(id, start_handlers, _e_handlers_register(id, element, _element), _handler_middleware)
              _handler_start_fn(start_handlers);
            }

            var _handler_end = typeof element.dataset.eHandlerEndStart !== 'undefined';
            if (_handler_end) {
              var end_handlers = _clear_handler_str(element.dataset.eHandlerEndStart);
              if (!end_handlers[0]) { end_handlers = handlers; }

              _e_handlers_execute(id, end_handlers, _e_handlers_register(id, element, _element), _handler_middleware)

              var _id = end_handlers.toString();
              if (!end_starts[_id]) { end_starts[_id] = []; }
              end_starts[_id].push({ handler: end_handlers, fn: _handler_start_fn });
            }
          });

          for (var key in end_starts) {
            if (end_starts[key].length < 1) { continue; }
            var callback = 0;
            while (callback < end_starts[key].length) {
              end_starts[key][callback].fn(end_starts[key][callback].handler);
              callback++;
            }
          }
        }
        catch (e) {
          _error(e.message);
        }
      }
    }
  });

  return _handlers;
}));
