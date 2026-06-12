_events(document).ready(function () {
  console.log('Gestor de Tickets Horarios.');

  try {
    var _e_handlers_str = '[data-e-handler]';
    var _e_handlers = {
      hideOtherAccordions: function (event) {
        var id = this.dataset.eHandlerId;
        for (var _id in _e_handlers.accordion) {
          if (_e_handlers.accordion.hasOwnProperty(_id)) {
            _e_handlers.accordion.call(_e_handlers.accordion[_id], {}, false);
          }
        }

        _e_handlers.accordion.call(_e_handlers.accordion[id], {}, true);
      },

      accordion: function (event, action) {
        var
          element = _dom(this),
          target = _dom('>' + this.dataset.eHandlerData),
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

        var form = new FormData(this);
        console.log(this.dataset.eHandlerData, Object.fromEntries(form.entries()));
      }
    };

    function _e_handlers_loop(handler, callback) {
      for (var i = 0; i < handler.length; i++) {
        if (typeof _e_handlers[handler[i]] !== 'function') {
          throw new Error('Unknown eHandler: ' + handler[i]);
        }
        if (callback) { callback(handler[i]); }
      }
    };

    _dom('>' + _e_handlers_str).each(function (element) {
      var handlers = element.dataset.eHandler.split(/[\s\,]+/);
      _e_handlers_loop(handlers, function (_handler) {
        _e_handlers[_handler][element.dataset.eHandlerId] = element;
      });

      _events(element).on(element.dataset.eHandlerEvent, function (event) {
        _e_handlers_loop(handlers, function (_handler) {
          _e_handlers[_handler].call(element, event);
        });
      });
    });
  }
  catch (e) {
    console.error('_e_handlers:', e.message);
  }
});
