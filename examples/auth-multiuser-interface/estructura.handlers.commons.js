_events(document).ready(function () {
  console.log('Estructura Handlers Commons ready.');

  var
    _generic_token = '********',
    _sessStore = window[atob('c2Vzc2lvblN0b3JhZ2U=')],
    _grlConnState = false,
    _required_sess_fields = {
      token: true,
      route: true,
      success: true,
      user: true
    };

  function ticketMockData(data) {
    return {
      n: Math.round(Math.random() * (((new Date).getTime() / 1000) / 60)),
      id: data,
      cost: Math.max(Math.round(Math.random() * 10), 0.5),
      start: new Date(new Date((new Date).setMinutes(Math.round(Math.random() * 20))).setSeconds(Math.round(Math.random() * 59))).toLocaleString(),
      end: new Date(new Date((new Date).setMinutes(Math.max(Math.round(Math.random() * 59), 21))).setSeconds(Math.round(Math.random() * 59))).toLocaleString(),
      note: 'Nota ' + Math.round(Math.random() * 99)
    };
  }

  function ticketMock(_ticket) {
    _ticket = ticketMockData(_ticket ? _ticket : 'ID' + ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'][Math.round(Math.random() * 10)] + Math.round(Math.random() * 9999999));
    return '<li class="ticket"><span class="n">' + _ticket.n + '</span><span class="id">' + _ticket.id + '</span><span class="attached"><span class="cost">' + _ticket.cost + '</span><span class="start">' + _ticket.start + '</span><span class="end">' + _ticket.end + '</span><span class="note">' + _ticket.note + '</span></span></li>';
  }

  function ticketMocks(n, callback) {
    var _mock = n;
    while (_mock--) {
      callback(ticketMock());
    }
  }

	function delay(id, callback, time){
      clearTimeout(delay[id]);
   	  delay[id] = setTimeout(callback, time || 5000);
  }

  function delayInt(id, callback, time){
       clearInterval(delayInt[id]);
    	  delayInt[id] = setInterval(callback, time || 5000);
	}

	function concatUri(str, str2){
          var _lastSlash = str2.charAt(0) === '/';
          var _firstSlash = str.charAt(str.length - 1) === '/';

          if(!_lastSlash && !_firstSlash){
            str2 = '/' + str2;
          }

          if(_lastSlash && _firstSlash){
            str2 = str2.slice(1);
          }

          return str + str2;
	}

	function hashCode(str, seed) {
        var hash = typeof seed === 'number' ? seed : 5381;
        for (var i = 0; i < str.length; i++) {
          hash = (hash << 5) + hash + str.charCodeAt(i);
        }
        return hash >>> 0;
      }

	function roundSessName(){
        var hourMs = 60 * 60 * 1000;
        var interval = hourMs;
        return Math.floor((new Date).getTime() / hourMs) * hourMs;
	}

	function b64json(data){
	  return btoa(JSON.stringify(data));
	}

	function saveSess(data){
		try {
		  if(!data || typeof data !== 'object'){
		    throw new Error('Unsupported session data.');
		      }

		  data.timestamp = new Date().getTime();

		      var sessName = roundSessName();
		  var sessContent = b64json(data);

		  data.checksum = hashCode(sessContent, sessName);
		  sessContent = b64json(data);

		  _sessStore.setItem(btoa(sessName), sessContent);
          }
          catch(e){
            e.name = 'saveSess';
            throw e;
          }
	}

	function lastSess(data, required){
      try {
		var sessName = roundSessName();
          var _sessName = btoa(sessName);
		    data = _sessStore.getItem(_sessName);
		if (!data){
            throw new Error('Session not found or expired.');
          }

		data = atob(data);
	    data = JSON.parse(data);
	    if(!data.checksum || !data.timestamp){
			throw new Error('Unssupported session data.');
		}

		if(required){
		  var i = required.length;
		  while(i--){
				if(typeof data[required[i]] === 'undefined'){
				  throw new Error('"' + required[i] + '" required.');
				}
		  }
		}

		var checksum = Number(data.checksum);
		delete data.checksum;

		if(hashCode(b64json(data), sessName) == checksum){
		  console.log('lastSess checksum checked:', checksum);
		  data.name = _sessName;
		  data.del = function(){
				_sessStore.removeItem(_sessName);
		  };
		  return data;
		}
	  }
      catch(e){
		    e.name = 'lastSess';
			throw e;
	  }
	  return false;
	}

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

      if (!/\s*(http\:\/\/|https\:\/\/)/.test(formDataTarget)) {
        var _pathname = window.location.pathname;
        formDataTarget = concatUri(_pathname, formDataTarget);
      }

      try {
        var _form = Object.fromEntries(form.entries());
        _form.password = _generic_token;

        console.info('forms:', this.initialElement.dataset.eHandlerData, _form);
      }
      catch (e) {
        console.warn('forms:', e.message);
      }

      _http({
        url: formDataTarget,
        onSuccess: function (r) {
          try {
            r = JSON.parse(r);

            if (!r || typeof r !== 'object') {
              throw new Error('Response format not supported, Object required.');
            }

            if (typeof r.error !== 'undefined'){
              throw new Error(r.error);
            }

            if (typeof r[formId] === 'undefined') {
              throw new Error('Response requires Object."' + formId + '".');
            }

            if (typeof r[formId] === 'string') {
              throw new Error(r[formId]);
            }

            if (!r[formId] || typeof r[formId] !== 'object'){
              throw new Error('Response Object."' + formId + '" value required as Object.');
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

    formsResponse: function (event) {
      event.preventDefault();

      var formsResponseId = this.initialElement.dataset.eHandlerId;
      console.log('formsResponse:', formsResponseId);
    },

    notification: function (event) {
      if (!this.initialElement || !this.liveElement) {
        throw new Error(_e_handler_id_required);
      }

      var _element = _dom(this.initialElement);
      var element = _dom(this.liveElement);

      var _type = _e.type(event);
      var _content;

      if (_type['Error']) {
        element.data('data-error', '');
        _content = event.message || 'Error.';
        this.error = _content;
        element.set('textContent', _content);
      }
      else if (_type['String']) {
        element.data('data-error', '');
        _content = event;
        this.error = _content;
        element.set('textContent', _content);
      }
      else if (_type['Object']) {
        delete this.liveElement.dataset.loading;
        delete this.liveElement.dataset.error;
        delete this.liveElement.dataset.success;

        if (event.loading) {
          element.data('data-loading', '');
          _content = event.loading || event.message || 'Loading...'
          this.success = _content;
        }
        else if(event.error){
          element.data('data-error', '');
          _content = event.error || event.message || 'Error.';
          this.error = _content;
        }
        else {
          element.data('data-success', '');
          _content = event.success || event.message || 'Success.';
          this.success = _content;
        }

        element.set('textContent', _content);
      }

      // Fallback, to restore to original state and content.

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
        throw new Error('"' + this.initialElement.nodeName + '" Node is disconnected from DOM.');
      }

      this.liveElement.parentNode.removeChild(this.liveElement);
    },

    formsResponseRoute: function (event) {
      if (typeof _sessStore === 'undefined') {
        throw new Error('Session store not found.');
      }

      if (!event || typeof event !== 'object') {
        throw new Error('Entry event/data required as Object.');
      }

      for (var key in _required_sess_fields) {
        if (typeof event[key] === 'undefined' || !event[key]) {
          throw new Error('Entry data require: ' + key);
        }
      }

      saveSess(event);

      event.token = _generic_token;
      console.log('formsResponseRoute:', event);

      _routing.show(event.route);
    },

    routesStart: function  () {
      var _id = this.initialElement.dataset.eHandlerId;
      if(!this.liveElement.isConnected){
          throw new Error('routesStart: "' + _id + '" Node is disconnected from DOM.');
      }

      if(!this.config){
        this.config = {
          ref: _routing.start({
        		  click: false,
        		  dispatch: false
          }),
          base: window.location.pathname
        }

        console.log('routesStart base:', this.config.base);
        _routing.base(this.config.base);

        var _currentRouteStr = 'data-e-current-route';
        var _currentRoute = this.liveElement.querySelector('[' + _currentRouteStr + ']');
        if(!_currentRoute || !_currentRoute.dataset.eHandlerRoute){
          throw new Error('routesStart: "' + _currentRouteStr + '" not found.');
        }

        console.log('routesStart current route:', _currentRoute.dataset.eHandlerRoute);

        this.config.scope = _currentRoute.parentNode;
        var _scopeChildren = this.config.scope.children;

        this.config.hideRoutes = function () {
          _dom(_scopeChildren).each(function(scopeChild){
            _dom(scopeChild).data('data-e-hidden-route', '');
          });
        };

        this.config.showRoute = function(route){
          _dom(route.liveElement).data('data-e-hidden-route', 'no');
        };

        this.config.hideRoutes();
        this.config.showRoute({ liveElement: _currentRoute });
        return;
      }

      if(!this.config.scope.isConnected){
          throw new Error('routesStart: "' + _currentRouteStr + '" Node is disconnected from DOM.');
      }
    },

    routes: function _e_routes_container (event) {
      var type = _e.type(event);
      if(type.length > 1){
        throw new Error('routes: Unsupported types "' + type.join(', ') + '"');
      }

      var _base = _routing.base();
      var _routesStartId = this.initialElement.dataset.eHandlerId;
      var _routesStart = _e_handlers.routesStart[_routesStartId];

      if(!_routesStart){
        throw new Error('routes: Required "routesStart" handler for route views container.');
      }

      var _routesStartMode = typeof _routesStart.initialElement.dataset.eHandlerStart !== 'undefined';
      var _routesEndStart = typeof _routesStart.initialElement.dataset.eHandlerEndStart !== 'undefined';

      if(!_routesStartMode){
        throw new Error('routes: "data-e-handler-start" required for "' + _routesStartId + '" with "routesStart" handler.');
      }

      if(!_routesEndStart){
        throw new Error('routes: "data-e-handler-end-start" required for "' + _routesStartId + '".');
      }

      var _currentRoute;
      for (var route in _e_routes_container) {
        if (_e_routes_container.hasOwnProperty(route)) {
          var _route = _e_routes_container[route].initialElement.dataset.eHandlerRoute;
          if(_route){
            console.log('routes route:', concatUri(_base, _route));

            _routing(_route, (function(_route, route){
                return function () {
                  if(_e_routes_container[route].liveElement.parentNode !== _routesStart.config.scope){
                    throw new Error('routes: "' + _route + '" route of "' + route + '" cannot be found on "' + _routesStartId + '" scope.');
                  }

                  console.log('routes selected route:', _route);
                  _routesStart.config.hideRoutes();
                  _routesStart.config.showRoute(_e_routes_container[route]);
              }
            })(_route, route));

            var _current = _e_routes_container[route].initialElement.dataset.eCurrentRoute;
            if(typeof _current !== 'undefined' && !_currentRoute){
              _currentRoute = _route;
            }
          }
        }
      }

      _routing.show(_currentRoute);
    },

    signedInCheck: function () {
      try {
        console.log('signedInCheck checking...');
        var session = lastSess('3 hours session', _required_sess_fields);
        session.token = _generic_token;
        console.log('signedInCheck session found:', session, this.liveElement.dataset.eHandlerId);
        _routing.redirect(session.route);
        this.connect(session);
      }
      catch(e){
        console.warn('signedInCheck:', e.message);
      }
    },

    temporalShow: function(data){
      console.log('temporalShow:', data);

      var
        _ref = _dom(this.liveElement),
        _original_text = this.initialElement.textContent;

      delay('temporalShow', function(){
        _ref.data('data-hidden', '');
        _ref.set('textContent', _original_text);
      });
    },

    signout: function(event){
      event.preventDefault();
      try {
        console.log('signout...');
        var session = lastSess();
        session.del();
      }
      catch(e){
        console.warn('signout:', e.message);
      }
      _routing.redirect('/');
    },

    ticket: function (data) {
      console.log('ticket:', this.initialElement.dataset.eHandlerId);

      this.liveElement.value = (typeof data === 'string' ? data : '');
      this.liveElement.focus();
    },

    createTicket: function () {
      var _value = _e_handlers.ticket['ticketValue'].liveElement.value;
      if (_value) {
        console.log('createTicket:', _value);
        this.connect(_value);
      }
    },

    updateTicket: function () {
      var _value = _e_handlers.ticket['ticketValue'].liveElement.value;
      if (_value) {
        console.log('updateTicket:', _value);
        this.connect(_value);
      }
    },

    checkConnection: function () {
      var _this = this, _prevConnState;

      function connCheckFn() {
        _prevConnState = _grlConnState;
        _grlConnState = navigator.onLine;

        if (_grlConnState !== _prevConnState) {
          if (_grlConnState) {
            console.info('checkConnection:', true);
            _this.connect({ success: 'Online.' });
            return;
          }
          console.info('checkConnection:', false);
          _this.connect({ error: 'Offline.' });
        }
      }

      delayInt('checkConnection', connCheckFn, 2500);
      _events(window).on('online', connCheckFn);
      _events(window).on('offline', connCheckFn);
    },

    generateTicket: function (data) {
      if (typeof data !== 'string') {
        throw new Error('generateTicket: Entry data required as String.');
      }

      if (!_grlConnState) {
        this.error = 'Offline, cannot generate ticket.';
        return;
      }

      data = data.replace(/\s+/g, '');
      var _ticket_re = /[^a-zA-Z0-9_\.\-]+/;
      if (_ticket_re.test(data)) {
        this.error = 'Wrong ticket id characters: ' + data.match(_ticket_re)[0];
        return;
      }

      console.log('generateTicket:', data);
      this.success = '';

      // Ticket mocks...
      this.liveElement.insertAdjacentHTML('afterbegin', ticketMock(data));
    },

    updateExistentTicket: function (data) {
      if (typeof data !== 'string') {
        throw new Error('updateExistentTicket: Entry data required as String.');
      }

      if (!_grlConnState) {
        this.error = 'Offline, cannot update ticket.';
        return;
      }

      var _data = data;
      console.log('updateExistentTicket:', _data);
      this.success = '';

      // Update ticket...
    },

    userData: function (data) {
      console.log('userData:', data);
      var _ref = _dom(this.liveElement);
      _ref.set('textContent', data.user + ':');
    },

    getTickets: function (event) {
      var _this = this;
      console.log('getTickets:', event);
      ticketMocks(20, function (mock) {
        _this.liveElement.insertAdjacentHTML('afterbegin', mock);
      });
    }
  };

  var _e_handlers_shortcuts = {
    'selectiveAccordion': ['hideAccordions', 'accordion'],
    'route': 'routes'
  };

	_handlers(_e_handlers, _e_handlers_shortcuts).start();
});
