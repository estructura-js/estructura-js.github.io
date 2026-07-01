_events(document).ready(function(){
  console.log('Estructura App Bundle Handlers ready.');

  function mockData(data) {
    return {
      n: Math.round(Math.random() * (((new Date).getTime() / 1000) / 60)),
      id: data,
      cost: Math.max(Math.round(Math.random() * 10), 0.5),
      start: new Date(new Date((new Date).setMinutes(Math.round(Math.random() * 20))).setSeconds(Math.round(Math.random() * 59))).toLocaleString(),
      end: new Date(new Date((new Date).setMinutes(Math.max(Math.round(Math.random() * 59), 21))).setSeconds(Math.round(Math.random() * 59))).toLocaleString(),
      note: 'Nota ' + Math.round(Math.random() * 99)
    };
  }

  function mockDataId() { return mockData('ID' + ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'][Math.round(Math.random() * 10)] + Math.round(Math.random() * 9999999));  }

  function mockHTML(data) {
    return '<div class="ticket"><span class="n">' + data.n + '</span><span class="id">' + data.id + '</span><span class="attached"><span class="cost">' + data.cost + '</span><span class="start">' + data.start + '</span><span class="end">' + data.end + '</span><span class="note">' + data.note + '</span></span></div>';
  }

  function mocksArray(n) {
    var _mock = n, _mocks = [];
    while (_mock--) {
      _mocks.push(mockDataId())
    }
    return _mocks;
  }

  var _e_app_bundle_handlers = {
    ticket: function (data) {
      console.log('ticket:', this.initialElement.dataset.eHandlerId);

      this.liveElement.value = (typeof data === 'string' ? data : '');
      this.liveElement.focus();
    },

    createNewTicket: function () {
      var _value = _e_app_bundle_handlers.ticket['ticketValue'].liveElement.value;
      if (_value) {
        console.log('createNewTicket:', _value);
        this.connect(_value);
      }
    },

    updateNewTicket: function () {
      var _value = _e_app_bundle_handlers.ticket['ticketValue'].liveElement.value;
      if (_value) {
        console.log('updateNewTicket:', _value);
        this.connect(_value);
      }
    },

    generateNewTicket: function (data) {
      if (typeof data !== 'string') {
        throw new Error('generateNewTicket: Entry data required as String.');
      }

      if (!navigator.onLine) {
        this.error = 'Offline, cannot generate ticket.';
        return;
      }

      data = data.replace(/\s+/g, '');
      var _ticket_re = /[^a-zA-Z0-9_\.\-]+/;
      if (_ticket_re.test(data)) {
        this.error = 'Wrong ticket ID characters: ' + data.match(_ticket_re)[0];
        return;
      }

      if (data.length < 2) {
        this.error = 'Ticket ID must have at least 2 characters.';
        return;
      }

      if (data.length > 128) {
        this.error = 'Ticket ID must not exceed 128 characters.';
        return;
      }

      console.log('generateNewTicket:', data);
      var _data = mockData(data);
      _data.id = data;
      this.success = _data;
    },

    updateExistentTicket: function (data) {
      if (typeof data !== 'string') {
        throw new Error('updateExistentTicket: Entry data required as String.');
      }

      if (!navigator.onLine) {
        this.error = 'Offline, cannot update ticket.';
        return;
      }

      var _data = data;
      console.log('updateExistentTicket:', _data);
      this.success = '';

      // Update ticket...
    },

    getTickets: function (event) {
      var _this = this;
      console.log('getTickets:', event);

      var _tickets = mocksArray(20);
      this.success = _tickets;
    },

    generateExistentTicket: function (event) {
      if (!event || typeof event !== 'object') {
        throw new Error('generateExistentTicket: Entry data/event must be an object.');
      }

      //console.log('generateExistentTicket:', event);

      this.liveElement.insertAdjacentHTML('afterbegin', mockHTML(event));
    }
  };

  _handlers(_e_app_bundle_handlers).public('signedIn');
  _handlers('commons').start();
});
