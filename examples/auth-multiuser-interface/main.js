_events(document).ready(function () {
  console.log('Gestor de Tickets Horarios.');

  var eHandlers = {
    accordion: function (event, data) {
      var
        target = _dom('>' + data),
        targetAttr = 'data-hidden',
        targetAttrVal = target.data(targetAttr);

      if (!targetAttrVal[0]) {
        return target.data(targetAttr, 'no');
      }

      target.data(targetAttr, '');
    },

    forms: function (event, data, index) {
      event.preventDefault();

      var form = new FormData(this);
      console.log(index, data, Object.fromEntries(form.entries()));
    }
  };

  try {
    _dom('> [data-e-handler]').each(function (element, index) {
      _events(element).on(element.dataset.eHandlerEvent, function (event) {
        eHandlers[element.dataset.eHandler].call(element, event, this.dataset.eHandlerData, index);
      });
    });
  }
  catch (e) {
    console.error('eHandlers error:', e.message);
  }
});
