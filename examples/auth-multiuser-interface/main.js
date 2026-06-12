_events(document).ready(function () {
  console.log('Gestor de Tickets Horarios.');

  try {
    var _e_handlers_str = '[data-e-handler]';
    var _e_handlers = {
      hideAccordions: function (event) {
        var id = this.elementClone.dataset.eHandlerId;
        for (var _id in _e_handlers.accordion) {
          if (_e_handlers.accordion.hasOwnProperty(_id)) {
            _e_handlers.accordion.call(_e_handlers.accordion[_id], {}, false);
          }
        }

        _e_handlers.accordion.call(_e_handlers.accordion[id], {}, true);
      },

      accordion: function (event, action) {
        var
          element = _dom(this.element),
          target = _dom('>' + this.elementClone.dataset.eHandlerData),
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
          form = new FormData(this.element),
          formId = this.elementClone.dataset.eHandlerId,
          formTarget = this.elementClone.dataset.eHandlerData;

        function formNotification(r) {
            _e_handlers.notification.call(_e_handlers.notification[formId], {}, r.message, r.status);
        };

        console.info(this.elementClone.dataset.eHandlerData, Object.fromEntries(form.entries()));

        _http({
          url: window.location.pathname + formTarget,
          onSuccess: function (r) {
            try {
              r = JSON.parse(r);
              if (typeof r[formId] === 'undefined') {
                throw new Error('Unrecognized response.');
              }

              formNotification({ message: r[formId], status: true });


            }
            catch (e) {
              if (typeof r.error !== 'undefined') {
                e.message = r.error;
              }

              return formNotification({ message: e.message });
            }
          },
          onError: formNotification,
        });
      },

      notification: function (event, message, status) {
        var element = _dom(this.element);
        if (typeof message === 'string') {
          element.set('textContent', message);
          element.data('data-' + (status ? 'success' : 'error'), '');
          element.data('data-hidden', 'no');
          return;
        }

        element.data('data-hidden', '');
        element.set('textContent', '');
      }
    };

    function _e_handlers_loop(handler, callback) {
      for (var i = 0; i < handler.length; i++) {
        if (typeof _e_handlers[handler[i]] !== 'function') {
          throw new Error('Unknown e-handler: ' + handler[i]);
        }
        if (callback) { callback(handler[i]); }
      }
    };

    _dom('>' + _e_handlers_str).each(function (element) {
      var _element = element.cloneNode();
      var handlers = element.dataset.eHandler.split(/[\s\,]+/);
      var id = element.dataset.eHandlerId;

      if (id) {
        _e_handlers_loop(handlers, function (_handler) {
          _e_handlers[_handler][id] = { element: element, elementClone: _element };
        });
      }

      if (!element.dataset.eHandlerEvent || typeof element.dataset.eHandlerEvent !== 'string') { return; }

      _events(element).on(element.dataset.eHandlerEvent, function (event) {
        _e_handlers_loop(handlers, function (_handler) {
          _e_handlers[_handler].call(_e_handlers[_handler][id], event);
        });
      });
    });
  }
  catch (e) {
    console.error('_e_handlers:', e.message);
  }
});
