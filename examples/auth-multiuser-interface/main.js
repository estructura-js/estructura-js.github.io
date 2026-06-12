_events(document).ready(function () {
  console.log('Gestor de Tickets Horarios.');

  function define(target, _var, _value, set_callback, get_callback) {
    if (typeof target[_var] === 'undefined') {
      Object.defineProperty(target, _var, {
        get: function () {
          try {
            if (typeof get_callback === 'function') { _value = get_callback.call(target, _value); }
            return _value;
          }
          catch (e) {
            var error = new Error('define: "' + _var + '" get error: ' + e.message);
            error.name = '';
            throw error;
          }
        },
        set: function (value) {
          try {
            if (typeof set_callback === 'function') { value = set_callback.call(target, value, _value); }
            _value = value;
          }
          catch (e) {
            var error = new Error('define: "' + _var + '" set error: ' + e.message);
            error.name = '';
            throw error;
          }
        },
        enumerable: true,
        configurable: true
      });
    }
  }

  try {
    var _e_handlers_str = '[data-e-handler]';

    var _e_handlers = {
      hideAccordions: function (event) {
        var id = this.initialElement.dataset.eHandlerId;
        for (var _id in _e_handlers.accordion) {
          if (_e_handlers.accordion.hasOwnProperty(_id)) {
            _e_handlers.accordion.call(_e_handlers.accordion[_id], {}, false);
          }
        }
      },

      accordion: function (event, action) {
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

        var
          form = new FormData(this.liveElement),
          formId = this.initialElement.dataset.eHandlerId,
          formDataTarget = this.initialElement.dataset.eHandlerData;

        if (!/\s*(http\:\/\/|https\:\/\/)/.test(formDataTarget)) { formDataTarget = window.location.pathname + formDataTarget;  }

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
                throw new Error('Unrecognized response.');
              }

              var _route = _e_handlers.formRouting;
              if (_route && _route[formId]) {
                if (_route[formId].ready) {
                  _route[formId].success = r[formId];
                }
                else {
                  throw new Error('Success, loading routing, try again...');
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
                throw new Error('Error, loading routing, try again...');
              }
            }

            formNotification(r);
          }
        });
      },

      formRouting: function (event) {
        try {
          if (typeof this.ready !== 'undefined' && !this.ready) {
            this.ready = true;
            this.success = false;
            this.error = false;
          }

          define(this, 'ready', true);

          define(this, 'success', false, function (data) {
            console.info('Success:', data);
          });

          define(this, 'error', false, function (data) {
            console.info('Error:', data);
          });
        }
        catch (e) {
          var error = new Error('formRouting error: ' + e.message);
          error.name = '';
          throw error;
        }
      },

      notification: function (event, message, status) {
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
      }
    };

    var _e_handlers_shortcuts = {
      'selectiveAccordion': ['hideAccordions', 'accordion']
    };

    function _e_handlers_collect(handler, callback) {
      handler = Array.prototype.slice.call(handler, 0);

      for (var i = 0; i < handler.length; i++) {
        handler[i] = handler[i].trim();
        handler[i] = Array.isArray(_e_handlers_shortcuts[handler[i]]) ? _e_handlers_shortcuts[handler[i]] : [handler[i]];

        for (var j = 0; j < handler[i].length; j++) {
          if (typeof _e_handlers[handler[i][j]] !== 'function') {
            throw new Error('Unknown e-handler: ' + handler[i][j]);
          }
          if (callback) { callback(handler[i][j]); }
        }
      }
      return handler;
    };

    _dom('>' + _e_handlers_str).each(function (element) {
      var _element = element.cloneNode();
      var handlers = element.dataset.eHandler.split(/[\s\,]+/);
      var id = element.dataset.eHandlerId;

      if (id) {
        _e_handlers_collect(handlers, function (_handler) {
          _e_handlers[_handler][id] = Object.create(null);
          _e_handlers[_handler][id].liveElement = element;
          _e_handlers[_handler][id].initialElement = _element;
        });
      }

      if (!element.dataset.eHandlerEvent || typeof element.dataset.eHandlerEvent !== 'string') { return; }

      _events(element).on(element.dataset.eHandlerEvent, function (event) {
        _e_handlers_collect(handlers, function (_handler) {
          _e_handlers[_handler].call(_e_handlers[_handler][id], event);
        });
      });
    });
  }
  catch (e) {
    console.error('_e_handlers:', e.message);
  }
});
