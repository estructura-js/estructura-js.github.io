_events(document).ready(function () {
  console.log('Gestor de Tickets Horarios.');

  function _error(message) {
    var e = new Error(message);
    e.name = '';
    throw e;
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
    var _e_handlers_re = /[\s\,]+/;
    var _e_handlers_str = '[data-e-handler]';
    var _e_handler_id_required = '"data-e-handler-id" required.';

    var _e_handlers = {
      hideAccordions: function (event) {
        if (!this.initialElement || !this.liveElement) {
          _error(_e_handler_id_required);
        }

        var id = this.initialElement.dataset.eHandlerId;
        for (var _id in _e_handlers.accordion) {
          if (_e_handlers.accordion.hasOwnProperty(_id)) {
            _e_handlers.accordion.call(_e_handlers.accordion[_id], {}, false);
          }
        }
      },

      accordion: function (event, action) {
        if (!this.initialElement || !this.liveElement) {
          _error(_e_handler_id_required);
        }

        var
          element = _dom(this.liveElement),
          target = _dom('>' + this.initialElement.dataset.eHandlerData),
          elementAttr = 'data-selected',
          targetAttr = 'data-hidden',
          targetAttrVal = target.data(targetAttr),
          targetAction = typeof action === 'undefined' ? !targetAttrVal[0] : action;

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

        if (!this.initialElement || !this.liveElement) {
          _error(_e_handler_id_required);
        }

        var
          form = new FormData(this.liveElement),
          formId = this.initialElement.dataset.eHandlerId,
          formDataTarget = this.initialElement.dataset.eHandlerData;

        if (!/\s*(http\:\/\/|https\:\/\/)/.test(formDataTarget)) { formDataTarget = window.location.pathname + formDataTarget; }

        function formNotification(r) {
          if (_e_handlers.notification[formId]) {
            return _e_handlers.notification.call(_e_handlers.notification[formId], {}, r.message, r.status);
          }

          alert((r.status ? 'Ok' : 'Error') + ': ' + r.message);
        };

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
              if (typeof r[formId] === 'undefined') {
                _error('Unrecognized response.');
              }

              var _route = _e_handlers.formRouting;
              if (_route && _route[formId]) {
                if (_route[formId].ready) {
                  _route[formId].success = r[formId];
                }
                else {
                  _error('Success, loading routing, try again...');
                }
              }

              formNotification({ message: r[formId], status: true });
            }
            catch (e) {
              if (typeof r.error !== 'undefined') {
                e.message = r.error;
              }

              formNotification({ message: e.message });
            }
          },
          onError: function (r) {
            var _route = _e_handlers.formRouting;
            if (_route && _route[formId]) {
              if (_route[formId].ready) {
                _route[formId].error = r;
              }
              else {
                _error('Error, loading routing, try again...');
              }
            }

            formNotification(r);
          }
        });
      },

      formRouting: function (event) {
        event.preventDefault();

        if (!this.initialElement || !this.liveElement) {
          _error(_e_handler_id_required);
        }

        var formId = this.initialElement.dataset.eHandlerId;
        var formRoutingSuccess = this.initialElement.dataset.eFormRoutingSuccess;
        var _formRoutingSuccess = (formRoutingSuccess ? this.initialElement.dataset.eFormRoutingSuccess.split(_e_handlers_re) : []);
        var formRoutingMiddleware = typeof this.initialElement.dataset.eFormRoutingMiddleware !== 'undefined';

        if (typeof this.ready !== 'undefined' && !this.ready) {
          this.ready = true;
          this.success = false;
          this.error = false;
        }

        define(this, 'ready', true);

        define(this, 'success', false, function (data) {
          console.info('Success:', formId);
          if (formRoutingSuccess) {
            _e_handlers_execute(formId, _formRoutingSuccess, _e_handlers_register(formId, this.liveElement, this.initialElement), formRoutingMiddleware);
            _e_handlers_execute(formId, _formRoutingSuccess, event, formRoutingMiddleware);
          }
        });

        define(this, 'error', false, function (data) {
          console.info('Error:', formId);
        });
      },

      notification: function (event, message, status) {
        if (!this.initialElement || !this.liveElement) {
          _error(_e_handler_id_required);
        }

        var _element = _dom(this.initialElement);
        var element = _dom(this.liveElement);

        if (typeof message === 'string') {
          element.set('textContent', message);
          element.data('data-' + (status ? 'success' : 'error'), '');
          element.data('data-hidden', 'no');
          return;
        }

        element.data('data-hidden', '');
        element.set('textContent', _element.get('textContent')[0]);
      },

      remove: function (event) {
        if (!this.initialElement || !this.liveElement) {
          _error(_e_handler_id_required);
        }

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
      },
    };

    var _e_handlers_shortcuts = {
      'middlewares-test': ['middleware', 'middleware', 'middleware'],
      'selectiveAccordion': ['hideAccordions', 'accordion']
    };

    function _e_handlers_execute(id, handler, event, middleware) {
      handler = Array.prototype.slice.call(handler, 0);

      var _middleware = function (data) { return data; };
      var _event_fn_mode = typeof event === 'function';

      for (var i = 0; i < handler.length; i++) {
        handler[i] = handler[i].trim();
        handler[i] = Array.isArray(_e_handlers_shortcuts[handler[i]]) ? _e_handlers_shortcuts[handler[i]] : [handler[i]];

        for (var j = 0; j < handler[i].length; j++) {
          if (typeof _e_handlers[handler[i][j]] !== 'function') {
            _error('Unknown e-handler: ' + handler[i][j]);
          }

          var _handler = handler[i][j];

          if (_event_fn_mode) { // Direct mode
            try {
              event.call(_e_handlers[_handler], _handler);
            }
            catch (e) {
              _error('"' + _handler + '" direct: ' + e.message);
            }
          }
          else if (!middleware) { // Sequential mode
            try {
              _e_handlers[_handler].call((_e_handlers[_handler][id] || null), event);
            }
            catch (e) {
              _error('"' + _handler + '" sequential: ' + e.message);
            }
          }
        }
      }

      if (!_event_fn_mode && middleware) {
        for (var i = handler.length - 1; i >= 0; i--) {
          for (var j = handler[i].length - 1; j >= 0; j--) {
            var _handler = handler[i][j];

            // Middleware mode
            _middleware = (function (_handler, _id, _event, _middleware) {
              return function (data) {
                try {
                  return _e_handlers[_handler].call((_e_handlers[_handler][_id] || null), _event, data, _middleware);
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

    function _e_handlers_register(id, element, _element) {
      return function (_handler) {
        this[id] = Object.create(null);
        this[id].liveElement = element;
        this[id].initialElement = _element;
      }
    }

    _dom('>' + _e_handlers_str).each(function (element) {
      var handlers = element.dataset.eHandler.split(_e_handlers_re);
      var id = element.dataset.eHandlerId;
      var _handler_middleware = typeof element.dataset.eHandlerMiddleware !== 'undefined';

      if (id) {
        _e_handlers_execute(id, handlers, _e_handlers_register(id, element, element.cloneNode()), _handler_middleware);
      }

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
