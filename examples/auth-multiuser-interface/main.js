_events(document).ready(function () {
  console.log('Gestor de Tickets Horarios.');

  function _error(message) {
    var e = new Error(message);
    e.name = '';
    throw e;
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function define(target, _var, _value, set_callback, get_callback) {
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
        configurable: true
      });
    }
  }

  try {
    var _e_ids_re = /\s+/g;
    var _e_handlers_re = /[\s\,]+/;
    var _e_handlers_ids_re = /[\|\.]+/;
    var _e_handlers_str = '[data-e-handler]';
    var _e_handler_id_required = '"data-e-handler-id" required.';

    var _e_handlers = {
      hideAccordions: function (event) {
        var id = this.initialElement.dataset.eHandlerId;
        for (var _id in _e_handlers.accordion) {
          if (_e_handlers.accordion.hasOwnProperty(_id)) {
            _e_handlers.accordion.call(_e_handlers.accordion[_id], {}, false);
          }
        }
      },

      accordion: function (event, customAction) {
        var
          element = _dom(this.liveElement),
          target = _dom('>' + this.initialElement.dataset.eHandlerData),
          elementAttr = 'data-selected',
          targetAttr = 'data-hidden',
          targetAttrVal = target.data(targetAttr),
          targetAction = typeof customAction === 'undefined' ? !targetAttrVal[0] : customAction;

        if (targetAction) {
          element.data(elementAttr, '');
          target.data(targetAttr, 'no');
          return;
        }

        element.data(elementAttr, 'no');
        target.data(targetAttr, '');
      },

      forms: function (event) {
        event.preventDefault();

        var
          form = new FormData(this.liveElement),
          formId = this.initialElement.dataset.eHandlerId,
          formDataTarget = this.initialElement.dataset.eHandlerData,
          formConnect = this.connect;

        if (!/\s*(http\:\/\/|https\:\/\/)/.test(formDataTarget)) { formDataTarget = window.location.pathname + formDataTarget; }

        try {
          var _form = Object.fromEntries(form.entries());
          _form.password = '*******';

          console.info(this.initialElement.dataset.eHandlerData, _form);
        }
        catch (e) {
          console.warn('_e_handlers:', e.message);
        }

        _http({
          url: formDataTarget,
          onSuccess: function (r) {
            try {
              r = JSON.parse(r);
              if (typeof r[formId] === 'undefined' || typeof r.error !== 'undefined') {
                _error('Unrecognized response.');
              }

              formConnect('success', r[formId]);
            }
            catch (e) {
              if (typeof r.error !== 'undefined') {
                e.message = r.error;
              }

              formConnect('error', e);
            }
          },
          onError: function (r) {
            formConnect('error', r);
          }
        });
      },

      formRouting: function (event) {
        event.preventDefault();

        var formRoutingId = this.initialElement.dataset.eHandlerId;
        console.log('formRouting:', formRoutingId);
      },

      notification: function (event) {
        if (!this.initialElement || !this.liveElement) {
          _error(_e_handler_id_required);
        }

        var _element = _dom(this.initialElement);
        var element = _dom(this.liveElement);

        var _type = _e.type(event);
        if (_type['Error']) {
          element.data('data-error', '');
          element.set('textContent', event.error || event.message || 'Error.');
        }
        else if (_type['String']) {
          element.data('data-error', '');
          element.set('textContent', event);
        }
        else if (_type['Object']) {
          if (event.loading) {
            element.data('data-loading', '');
            element.set('textContent', event.loading || event.message || 'Loading.');
          }
          else {
            element.data('data-success', '');
            element.set('textContent', event.success || event.message || 'Success.');
          }
        }

        var _success = typeof this.liveElement.dataset.success !== 'undefined';
        var _error = typeof this.liveElement.dataset.error !== 'undefined';
        var _loading = typeof this.liveElement.dataset.loading !== 'undefined';

        if (_success || _error || _loading) {
          element.data('data-hidden', 'no');
          return;
        }

        element.data('data-hidden', '');
        element.set('textContent', _element.get('textContent')[0]);
      },

      remove: function (event) {
        if (!this.liveElement.isConnected) {
          _error('"' + this.initialElement.nodeName + '" Node is disconnected from DOM.');
        }

        this.liveElement.parentNode.removeChild(this.liveElement);
      },

      middleware: function (event, data, next) {
        console.log('Middleware context:', this);
        console.log('Middleware data:', data);
        data[(new Date).getTime()] = true;
        return next(data);
      }
    };

    var _e_handlers_shortcuts = {
      'middlewares-test': ['middleware', 'middleware', 'middleware'],
      'selectiveAccordion': ['hideAccordions', 'accordion']
    };

    function _e_handlers_execute(id, handler, event, middleware) {
      handler = Array.prototype.slice.call(handler, 0);

      var _event_fn_mode = typeof event === 'function';

      for (var i = 0; i < handler.length; i++) {
        handler[i] = handler[i].trim();
        handler[i] = Array.isArray(_e_handlers_shortcuts[handler[i]]) ? _e_handlers_shortcuts[handler[i]] : [handler[i]];

        for (var j = 0; j < handler[i].length; j++) {
          var _handlers_ids = handler[i][j].split(_e_handlers_ids_re)
          var _handler = _handlers_ids[0];

          if (typeof _e_handlers[_handler] !== 'function') {
            _error('Unknown e-handler: ' + _handler);
          }

          if (_event_fn_mode) { // Direct mode
            try {
              event.call(_e_handlers[_handler], _handler, (_handlers_ids.length ? _handlers_ids.slice(1) : []));
            }
            catch (e) {
              _error('"' + _handler + '" direct: ' + e.message);
            }
          }
          else if (!middleware) { // Sequential mode
            try {
              _e_handlers[_handler].call((id ? _e_handlers[_handler][id] : _e_handlers[_handler]), event);
            }
            catch (e) {
              _error('"' + _handler + '" sequential: ' + e.message);
            }
          }
        }
      }

      var _middleware = function (data) { return data; };

      if (!_event_fn_mode && middleware) {
        for (var i = handler.length - 1; i >= 0; i--) {
          for (var j = handler[i].length - 1; j >= 0; j--) {
            var _handler = handler[i][j];

            // Middleware mode
            _middleware = (function (_handler, _id, _event, _middleware) {
              return function (data) {
                try {
                  return _e_handlers[_handler].call((_id ? _e_handlers[_handler][_id] : _e_handlers[_handler]), _event, data, _middleware);
                }
                catch (e) {
                  _error('"' + _handler + '" middleware: ' + e.message);
                }
              };
            })(_handler, id, event, _middleware);
          }
        }

        _middleware(Object.create(null));
      }

      return handler;
    };

    function execute_fn(state, handlers, id, middleware) {
      return function (data) {
        console.info(state, id);
        if (handlers && typeof handlers === 'object' && handlers.length) {
          //_e_handlers_execute(id, handlers, data, middleware);
          _e_handlers_execute(null, handlers, _e_handlers_ids(null, function (handler, _id) {
            handler.call(handler[_id], data);
          }), middleware);
        }
      }
    }

    function _e_handlers_ids(ids, callback) {
      return function (_handler, _handler_ids) {
        var handler = _e_handlers[_handler];
        for (var __id in handler) {
          if (handler.hasOwnProperty(__id)) {
            if ((_handler_ids.length && _handler_ids.indexOf(__id) === -1) || (ids && ids !== __id)) { continue; }

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

    function _e_handlers_register(id, element, _element, middleware) {
      return function (_handler) {
        if (this[id]) {
          return console.info('Handler "' + _handler + '.' + id + '" already used.');
        }

        this[id] = Object.create(null);
        this[id].liveElement = element;
        this[id].initialElement = _element;

        if (typeof this[id].ready !== 'undefined' && !this[id].ready) {
          this[id].ready = true;
          this[id].success = false;
          this[id].error = false;
        }

        define(this[id], 'ready', true);

        _handler = 'e' + capitalize(_handler);

        var _middleware = this[id].initialElement.dataset[_handler + 'Middleware'];

        var _data_connect = _handler + 'Connect';
        var data_connect = this[id].initialElement.dataset[_data_connect];
        if (data_connect) {
          _data_connect = data_connect.split(_e_handlers_re);
          _e_handlers_execute(id, _data_connect, _e_handlers_register(id, element, _element, middleware), middleware);

          this[id].connect = function (state, data, ids) {
            _e_handlers_execute(null, _data_connect, _e_handlers_ids(ids, function (handler, _id) { handler[_id][state] = data; }), _middleware);
          }
        }
        else {
          this[id].connect = function () {};
        }

        var data_success = this[id].initialElement.dataset[_handler + 'Success'];
        var _data_success = (data_success ? data_success.split(_e_handlers_re) : []);

        _e_handlers_execute(id, _data_success, _e_handlers_register(id, element, _element, middleware), middleware);
        define(this[id], 'success', false, execute_fn(_handler + ' success', _data_success, id, middleware));

        var data_error = this[id].initialElement.dataset[_handler + 'Error'];
        var _data_error = (data_error ? data_error.split(_e_handlers_re) : []);

        _e_handlers_execute(id, _data_error, _e_handlers_register(id, element, _element, middleware), middleware);
        define(this[id], 'error', false, execute_fn(_handler + ' error', _data_error, id, middleware));
      }
    }

    _dom('>' + _e_handlers_str).each(function (element) {
      var id = (element.dataset.eHandlerId || '').replace(_e_ids_re, '');
      if (!id) {
        _error(_e_handler_id_required);
      }

      var handlers = element.dataset.eHandler.split(_e_handlers_re);
      var _handler_middleware = typeof element.dataset.eHandlerMiddleware !== 'undefined';
      _e_handlers_execute(id, handlers, _e_handlers_register(id, element, element.cloneNode(), _handler_middleware), _handler_middleware);

      if (!element.dataset.eHandlerEvent || typeof element.dataset.eHandlerEvent !== 'string') { return; }

      _events(element).on(element.dataset.eHandlerEvent, function (event) {
        _e_handlers_execute(id, handlers, event, _handler_middleware, true);
      });
    });
  }
  catch (e) {
    console.error('_e_handlers:', e.message);
  }
});
