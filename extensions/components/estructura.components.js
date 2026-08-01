(function (global, factory) {
  'use strict';
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  }
  else if (typeof define === 'function' && define.amd) {
    define(factory);
  }
  else {
    global._components = factory();
  }
}(this, function () {
  "use strict";

  var _http_check = typeof _http;
  if (_http_check === 'undefined' || _http_check !== 'function') {
    throw new Error('"_http" extension required before "_components".');
  }

  /** @type {number} Maximum limit of memory cache entries before eviction */
  var MAX_CACHE_ENTRIES = 100;

  /** @type {Object} Global system configuration */
  var globalConfig = {
      origin: './',
      timeout: 10000,
      autoScan: false
  };

  var
    _components = _e.instance('components'),
    registeredOrders = {},
    instances = {},
    resourceCache = {},
    componentStates = {},
    globalStateObservers = [],

    appliedCSS = {},
    appliedJS = {},

    parsedOrderCache = {},
    parsedOrderCacheKeys = [],
    resourceCacheKeys = [];

  // Control structures for collision resolution and event queueing
  var
    componentCounters = {},
    eventQueues = {},
    MAX_QUEUE_SIZE = 50;

  // Internal registry to capture execution errors from dynamic scripts
  var
    executionErrors = {};

  // Centralized MutationObserver system
  var
    globalObserver = null,
    observedInstances = [],
    randomErrorsId = '_e_components_' + (new Date()).getTime();

  // Register global execution error handler for injected components
  if (typeof window !== 'undefined') {
    window.addEventListener('error', function (event) {
      if (!event || typeof event !== 'object') { return; }
      var _err = event.error;
      if (!_err || typeof _err !== 'object') { return; }
      if (typeof _err[randomErrorsId] !== 'undefined' && _err[randomErrorsId] == _err.name) {
        executionErrors[_err.name] = _err.message;
      }
    });
  }

  var main = {}

  // --- PUBLIC INTERFACE METHODS (Early Definition) ---

  /**
    * Retrieves a registered instance by its ID.
    * @param {string} id - Instance identifier.
    * @returns {Object|undefined}
    */
  main.get = function(id) {
      return instances[id];
  };

  /**
    * Sends an event to a specific instance or queues it if the instance is not ready.
    * @param {string} targetId - Target instance ID.
    * @param {string} event - Event name.
    * @param {*} data - Data associated with the event.
    */
  main.emit = function(targetId, event, data) {
      var state = componentStates[targetId];

      if (state === 'failed') {
          console.warn('_components: Event delivery for "' + event + '" has been discarded because the target component "' + targetId + '" is in a failed state.');
          return;
      }

      var inst = instances[targetId];
      if (inst && state === 'ready') {
          inst.emitter.emit(event, data);
      } else {
          if (!eventQueues[targetId]) {
              eventQueues[targetId] = [];
          }
          if (eventQueues[targetId].length < MAX_QUEUE_SIZE) {
              eventQueues[targetId].push({ event: event, data: data });
          } else {
              console.warn('_components: Event queue limit (' + MAX_QUEUE_SIZE + ') exceeded for ID "' + targetId + '". Discarding event "' + event + '".');
          }
      }
  };

  /**
    * Registers or retrieves a component loading order.
    * @param {string} name - Identifying name of the order.
    * @param {string} [value] - Comma-delimited loading steps.
    * @returns {string|undefined}
    */
  main.order = function(name, value) {
      if (value) {
          registeredOrders[name] = value;
          if (parsedOrderCache[name]) {
              delete parsedOrderCache[name];
              var idx = parsedOrderCacheKeys.indexOf(name);
              if (idx > -1) parsedOrderCacheKeys.splice(idx, 1);
          }
      }
      return registeredOrders[name];
  };

  /**
    * Scans the indicated DOM subtree for elements configured with component directives.
    * @param {Element} [root] - Root node for the search.
    */
  main.scan = function(root) {
      var searchRoot = root || document.body;
      if (!searchRoot) return;

      var
        roots = searchRoot.querySelectorAll('[data-e-components]'),
        len = roots.length;
      for (var i = 0; i < len; i++) {
          main(roots[i]);
      }
  };

  /**
    * Automatically initializes DOM scanning after document load completes.
    */
  main.autoScan = function() {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
          main.scan();
      } else {
          document.addEventListener('DOMContentLoaded', function() {
              main.scan();
          });
      }
  };

  /**
    * Releases memory occupied by caches, safely destroying active instances.
    */
  main.resetCache = function() {
      globalStateObservers = [];

      var keys = [];
      for (var id in instances) {
          if (instances.hasOwnProperty(id)) {
              keys.push(id);
          }
      }
      var len = keys.length;
      for (var i = 0; i < len; i++) {
          var inst = instances[keys[i]];
          if (inst && typeof inst._destroy === 'function') {
              inst._destroy(true);
          }
      }

      instances = {};
      componentStates = {};
      appliedCSS = {};
      appliedJS = {};
      resourceCache = {};
      resourceCacheKeys = [];
      parsedOrderCache = {};
      parsedOrderCacheKeys = [];
      componentCounters = {};
      eventQueues = {};
      executionErrors = {};
      stopGlobalObserver();
  };

  main._unregisterInstance = function(id) {
      delete instances[id];
      delete componentStates[id];
      delete eventQueues[id];
      delete componentCounters[id];
      delete executionErrors[id];
  };

  main._registerStateObserver = function(fn) {
      globalStateObservers.push(fn);
  };

  main._unregisterStateObserver = function(fn) {
      var index = globalStateObservers.indexOf(fn);
      if (index > -1) {
          globalStateObservers.splice(index, 1);
      }
  };

  main._notifyStateChange = function (id, state) {
      // Snapshot to avoid index shifting on concurrent unregistration
      var
        observers = globalStateObservers.slice(0),
        len = observers.length;
      for (var i = 0; i < len; i++) {
          try {
              observers[i](id, state);
          } catch (e) {
              console.error('_components: Error within the global state observer:', e);
          }
      }
  };

  // --- INTERNAL FUNCTIONS AND UTILITIES ---

  /**
    * Determines if the provided value is a plain object.
    * @param {*} obj
    * @returns {boolean}
    */
  function isPlainObject(obj) {
      return !!obj &&
              typeof obj === 'object' &&
              !obj.nodeType &&
              !(obj instanceof RegExp) &&
              !(obj instanceof Date) &&
              !Array.isArray(obj);
  }

  /**
    * Updates the global framework configuration.
    * @param {Object} opts
    * @returns {Object}
    */
  function configure(opts) {
      for (var key in opts) {
          if (opts.hasOwnProperty(key)) {
              globalConfig[key] = opts[key];
          }
      }
      if (globalConfig.autoScan) {
          main.autoScan();
      }
      return globalConfig;
  }

  function getAttr(element, name) {
      return element ? element.getAttribute(name) : null;
  }

  /**
    * Resolves options, prioritizing call parameters over HTML attributes of the element.
    * @param {Object} config - Dynamic configuration object.
    * @param {string} key - Property key.
    * @param {Element} element - DOM node.
    * @param {string} attrName - Associated data attribute in the DOM.
    * @param {*} [defaultValue] - Default value.
    * @returns {*}
    */
  function getOption(config, key, element, attrName, defaultValue) {
      if (config && config[key] !== undefined) {
          return config[key];
      }
      var attrVal = getAttr(element, attrName);
      return attrVal !== null ? attrVal : defaultValue;
  }

  /**
    * Consolidates element configuration parameters from the DOM and external options.
    * @param {Element} element
    * @param {Object} [config]
    * @returns {Object}
    */
  function resolveConfig(element, config) {
      config = config || {};
      var options = {
          components: getOption(config, 'components', element, 'data-e-components'),
          origin: getOption(config, 'origin', element, 'data-e-components-origin'),
          order: getOption(config, 'order', element, 'data-e-components-order'),

          component: getOption(config, 'component', element, 'data-e-component'),
          src: getOption(config, 'src', element, 'data-e-component-src'),
          componentOrder: getOption(config, 'componentOrder', element, 'data-e-component-order', 'css,html,js'),
          id: getOption(config, 'id', element, 'data-e-component-id'),
          required: getOption(config, 'required', element, 'data-e-component-required'),
          fallback: getOption(config, 'fallback', element, 'data-e-component-fallback'),
          timeout: getOption(config, 'timeout', element, 'data-e-component-timeout'),

          fallbackSrc: getOption(config, 'fallbackSrc', element, 'data-e-component-fallback-src'),
          fallbackOrder: getOption(config, 'fallbackOrder', element, 'data-e-component-fallback-order')
      };

      if (options.component && !options.id) {
          options.id = options.component;
      }

      return options;
  }

  /**
    * Iteratively traverses up the DOM tree looking for the presence of an attribute.
    * @param {Element} element - Starting element.
    * @param {string} attrName - Name of the attribute.
    * @returns {string|null}
    */
  function findNearestAttr(element, attrName) {
      var current = element;
      while (current) {
          var val = current.getAttribute(attrName);
          if (val) {
              return val;
          }
          current = current.parentElement;
      }
      return null;
  }

  function findNearestOrigin(element) {
      var origin = findNearestAttr(element, 'data-e-components-origin');
      if (origin) {
          return normalizeOrigin(origin);
      }
      var globalOrigin = globalConfig.origin;
      if (globalOrigin) {
          return normalizeOrigin(globalOrigin);
      }
      return './';
  }

  function findNearestFallbackOrigin(element) {
      var origin = findNearestAttr(element, 'data-e-components-fallback-origin');
      return origin ? normalizeOrigin(origin) : null;
  }

  function findNearestFallbackOrder(element) {
      return findNearestAttr(element, 'data-e-components-fallback-order');
  }

  function normalizeOrigin(url) {
      if (!url) return '';
      if (url.charAt(url.length - 1) !== '/') {
          return url + '/';
      }
      return url;
  }

  /**
    * Adds an entry to the processed order strings cache under strict memory limits.
    * @param {string} key
    * @param {Array} value
    */
  function addToParsedOrderCache(key, value) {
      if (!parsedOrderCache[key]) {
          if (parsedOrderCacheKeys.length >= MAX_CACHE_ENTRIES) {
              var oldest = parsedOrderCacheKeys.shift();
              delete parsedOrderCache[oldest];
          }
          parsedOrderCacheKeys.push(key);
      }
      parsedOrderCache[key] = value;
  }

  /**
    * Processes a sequential or parallel loading format.
    * @param {string} orderVal
    * @returns {Array}
    */
  function parseOrderString(orderVal) {
      if (!orderVal) return [];
      if (parsedOrderCache[orderVal]) {
          return parsedOrderCache[orderVal];
      }

      var
        registered = registeredOrders[orderVal],
        resolved = registered ? registered : orderVal,

        steps = resolved.split(','),
        parsed = [],
        sLen = steps.length;

      for (var i = 0; i < sLen; i++) {
          var step = steps[i].trim();
          if (step) {
              var
                parallelGroup = step.split('+'),
                parsedGroup = [],
                pLen = parallelGroup.length;
              for (var j = 0; j < pLen; j++) {
                  var item = parallelGroup[j].trim();
                  if (item) {
                      parsedGroup.push(item);
                  }
              }
              if (parsedGroup.length > 0) {
                  parsed.push(parsedGroup);
              }
          }
      }
      addToParsedOrderCache(orderVal, parsed);
      return parsed;
  }

  /**
    * Performs remote request and applies resource associated with a component in a coordinated manner.
    * @param {string} type - Resource type ('css', 'html', 'js').
    * @param {string} url - Destination URL.
    * @param {number} timeout - Maximum timeout duration.
    * @param {Element} element - Component container node.
    * @param {string|null} componentId - Component ID to track execution failures.
    * @param {Function} callback - Callback function.
    */
  function fetchAndApplyResource(type, url, timeout, element, componentId, callback) {
      var
        cacheKey = type + ':' + url,
        validTypes = ['css', 'html', 'js'];

      if (validTypes.indexOf(type) === -1) {
          callback(new Error('_components: Unknown resource type: "' + type + '" for URL: ' + url));
          return;
      }

      if (type === 'css' && appliedCSS[cacheKey]) {
          return callback(null);
      }
      if (type === 'js' && appliedJS[cacheKey]) {
          return callback(null);
      }

      if (resourceCache[cacheKey]) {
          var entry = resourceCache[cacheKey];
          if (entry.status === 'loaded') {
              if (type === 'html') {
                  applyResourceToDOM(type, entry.data, element, componentId, callback);
              } else {
                  callback(null);
              }
          } else if (entry.status === 'failed') {
              callback(entry.error);
          } else {
              entry.callbacks.push(function(err, data) {
                  if (err) return callback(err);
                  if (type === 'html') {
                      applyResourceToDOM(type, data, element, componentId, callback);
                  } else {
                      callback(null);
                  }
              });
          }
          return;
      }

      // Defensive control of maximum cached resource size (prevents duplicate entries)
      if (resourceCacheKeys.indexOf(cacheKey) === -1) {
          if (resourceCacheKeys.length >= MAX_CACHE_ENTRIES) {
              var oldestKey = resourceCacheKeys.shift();
              delete resourceCache[oldestKey];
          }
          resourceCacheKeys.push(cacheKey);
      }

      var cacheEntry = {
          status: 'loading',
          data: null,
          error: null,
          callbacks: []
      };
      resourceCache[cacheKey] = cacheEntry;

      if (typeof _http !== 'function') {
          var missingDepErr = new Error('_components: Global dependency "_http" not found. Load the HTTP module before proceeding.');
          cacheEntry.status = 'failed';
          cacheEntry.error = missingDepErr;
          callback(missingDepErr);
          return;
      }

      _http({
          method: 'GET',
          url: url,
          timeout: timeout,
          onSuccess: function(responseText) {
              cacheEntry.data = responseText;

              if (type === 'html') {
                  applyResourceToDOM(type, responseText, element, componentId, function(err) {
                      if (!err) {
                          cacheEntry.status = 'loaded';
                      } else {
                          cacheEntry.status = 'failed';
                          cacheEntry.error = err;
                      }
                      callback(err);

                      var
                        list = cacheEntry.callbacks,
                        len = list.length;
                      cacheEntry.callbacks = [];
                      for (var i = 0; i < len; i++) {
                          try {
                              list[i](err, responseText);
                          } catch (ex) {
                              console.error('_components: Error processing queued resource callback:', ex);
                          }
                      }
                  });
              } else {
                  applyResourceToDOM(type, responseText, element, componentId, function(err) {
                      if (!err) {
                          cacheEntry.status = 'loaded';
                          if (type === 'css') appliedCSS[cacheKey] = true;
                          if (type === 'js') appliedJS[cacheKey] = true;
                      } else {
                          cacheEntry.status = 'failed';
                          cacheEntry.error = err;
                      }
                      callback(err);

                      var
                        list = cacheEntry.callbacks,
                        len = list.length;
                      cacheEntry.callbacks = [];
                      for (var i = 0; i < len; i++) {
                          try {
                              list[i](err, responseText);
                          } catch (ex) {
                              console.error('_components: Error processing queued resource callback:', ex);
                          }
                      }
                  });
              }
          },
          onError: function(err) {
              cacheEntry.status = 'failed';
              cacheEntry.error = err;

              callback(err);

              var
                list = cacheEntry.callbacks,
                len = list.length;
              cacheEntry.callbacks = [];
              for (var i = 0; i < len; i++) {
                  try {
                      list[i](err, null);
                  } catch (ex) {
                      console.error('_components: Error processing queued resource error callback:', ex);
                  }
              }
          }
      });
  }

  function applyResourceToDOM(type, data, element, componentId, callback) {
      try {
          if (type === 'css') {
              var style = document.createElement('style');
              style.textContent = data;
              document.head.appendChild(style);
              callback(null);
          } else if (type === 'html') {
              var template = document.createElement('template');
              if ('content' in template) {
                  template.innerHTML = data;
                  element.innerHTML = '';
                  element.appendChild(document.importNode(template.content, true));
              } else {
                  var div = document.createElement('div');
                  div.innerHTML = data;
                  element.innerHTML = '';
                  while (div.firstChild) {
                      element.appendChild(div.firstChild);
                  }
              }
              callback(null);
          } else if (type === 'js') {
              var
                script = document.createElement('script'),
                wrappedData = data;

              // Wrap JS code in a try-catch block while maintaining scope compatibility
              if (componentId) {
                  var safeComponentId = componentId
                      .replace(/\\/g, '\\\\')
                      .replace(/'/g, "\\'")
                      .replace(/\r/g, '\\r')
                      .replace(/\n/g, '\\n');
                      wrappedData = "try {\n" + data + "\n}\n" +
                                "catch(e) {\n" +
                                "  e." + randomErrorsId + " = '" + safeComponentId + "';\n" +
                                "  e.name = '" + safeComponentId + "';\n" +
                                "  throw e;\n" +
                                "}";
              }

              if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                  var
                    blob = new Blob([wrappedData], { type: 'application/javascript' }),
                    blobUrl = URL.createObjectURL(blob);

                  script.src = blobUrl;

                  script.onload = function() {
                      URL.revokeObjectURL(blobUrl);
                      if (script.parentNode) {
                          script.parentNode.removeChild(script);
                      }
                      var execErr = componentId ? executionErrors[componentId] : null;
                      if (execErr) {
                          delete executionErrors[componentId];
                          callback(execErr);
                      } else {
                          callback(null);
                      }
                  };

                  script.onerror = function() {
                      URL.revokeObjectURL(blobUrl);
                      if (script.parentNode) {
                          script.parentNode.removeChild(script);
                      }
                      // Fallback contingency in case of Content Security Policy (CSP) blockages
                      try {
                          var fallbackScript = document.createElement('script');
                          fallbackScript.textContent = wrappedData;
                          document.head.appendChild(fallbackScript);
                          if (fallbackScript.parentNode) {
                              fallbackScript.parentNode.removeChild(fallbackScript);
                          }
                          var execErr = componentId ? executionErrors[componentId] : null;
                          if (execErr) {
                              delete executionErrors[componentId];
                              callback(execErr);
                          } else {
                              callback(null);
                          }
                      } catch (fallbackErr) {
                          callback(new Error('_components: Failed to interpret JS resource asynchronously (even with fallback). Details: ' + fallbackErr.message));
                      }
                  };

                  document.head.appendChild(script);
              } else {
                  script.textContent = wrappedData;
                  document.head.appendChild(script);
                  if (script.parentNode) {
                      script.parentNode.removeChild(script);
                  }
                  var execErr = componentId ? executionErrors[componentId] : null;
                  if (execErr) {
                      delete executionErrors[componentId];
                      callback(execErr);
                  } else {
                      callback(null);
                  }
              }
          } else {
              callback(new Error('_components: Unknown resource type in applyResourceToDOM: "' + type + '"'));
          }
      } catch (e) {
          callback(e);
      }
  }

  function isIdInParsedOrder(parsedOrder, id) {
      var sLen = parsedOrder.length;
      for (var i = 0; i < sLen; i++) {
          var
            group = parsedOrder[i],
            gLen = group.length;
          for (var j = 0; j < gLen; j++) {
              if (group[j] === id) {
                  return true;
              }
          }
      }
      return false;
  }

  function evaluateDependencies(requiredStr, parentCoordinator, onReady, onFailure) {
      if (!requiredStr || requiredStr === 'true' || requiredStr === 'false') {
          onReady();
          return null;
      }

      var
        depIds = requiredStr.split(/[\s,]+/),
        pendingSet = {},
        hasActiveDeps = false,
        len = depIds.length;

      for (var i = 0; i < len; i++) {
          var cleanId = depIds[i].trim();
          if (cleanId) {
              var
                existsGlobally = instances[cleanId] || componentStates[cleanId],
                existsInCoordinator = false;

              if (parentCoordinator && parentCoordinator.options && parentCoordinator.options.order) {
                  var parsedOrder = parseOrderString(parentCoordinator.options.order);
                  if (isIdInParsedOrder(parsedOrder, cleanId)) {
                      existsInCoordinator = true;
                  }
              }

              if (!existsGlobally && !existsInCoordinator) {
                  onFailure(new Error('_components: Invalid configuration: Dependency "' + cleanId + '" has not been registered or declared in the orchestration.'));
                  return null;
              }

              pendingSet[cleanId] = true;
              hasActiveDeps = true;
          }
      }

      if (!hasActiveDeps) {
          onReady();
          return null;
      }

      function checkStates() {
          var allReady = true;
          for (var id in pendingSet) {
              if (pendingSet.hasOwnProperty(id)) {
                  var state = componentStates[id] || 'pending';
                  if (state === 'failed') {
                      onFailure(new Error('_components: Critical failure propagated from required dependency: ' + id));
                      cleanup();
                      return;
                  }
                  if (state !== 'ready') {
                      allReady = false;
                  }
              }
          }
          if (allReady) {
              onReady();
              cleanup();
          }
      }

      function onStateUpdate() {
          checkStates();
      }

      function cleanup() {
          main._unregisterStateObserver(onStateUpdate);
      }

      main._registerStateObserver(onStateUpdate);
      checkStates();

      return cleanup;
  }

  function EventEmitter() {
      this.listeners = {};
  }
  EventEmitter.prototype.on = function(event, callback) {
      if (!this.listeners[event]) {
          this.listeners[event] = [];
      }
      this.listeners[event].push(callback);
  };
  EventEmitter.prototype.off = function(event, callback) {
      var list = this.listeners[event];
      if (!list) return;
      for (var i = list.length - 1; i >= 0; i--) {
          var cb = list[i];
          if (cb === callback || cb._originalCallback === callback) {
              list.splice(i, 1);
          }
      }
  };
  EventEmitter.prototype.once = function(event, callback) {
      var
        self = this,
        wrapper = function (data) {
            self.off(event, wrapper);
            callback(data);
        };
      wrapper._isOnce = true;
      wrapper._originalCallback = callback;
      this.on(event, wrapper);
  };
  EventEmitter.prototype.emit = function(event, data) {
      var list = this.listeners[event];
      if (list) {
          var
            snapshot = list.slice(0),
            len = snapshot.length;
          for (var i = 0; i < len; i++) {
              snapshot[i](data);
          }
      }
  };

  function resolveUniqueId(id) {
      var resolvedId = id;
      if (instances[resolvedId]) {
          if (!componentCounters[id]) {
              componentCounters[id] = 0;
          }
          // Deterministic loop to guarantee uniqueness and full integrity of the instance tree
          while (instances[resolvedId]) {
              componentCounters[id]++;
              resolvedId = id + '_' + componentCounters[id];
          }
          console.warn('_components: Duplicate ID detected for "' + id + '". Automatically registered as "' + resolvedId + '". Events sent to the original ID "' + id + '" will not reach this instance.');
      }
      return resolvedId;
  }

  function registerInstance(resolvedId, instance) {
      for (var key in instances) {
          if (instances.hasOwnProperty(key) && key !== resolvedId) {
              var other = instances[key];
              if (other.element === instance.element) {
                  if (componentStates[key] === 'loading' || componentStates[key] === 'pending' || componentStates[key] === 'loading-fallback') {
                      componentStates[key] = 'failed';
                      main._notifyStateChange(key, 'failed');
                  }
                  other._destroy(true);
              }
          }
      }

      instances[resolvedId] = instance;
      componentStates[resolvedId] = 'pending';
  }

  function flushQueue(targetId, instance) {
      var queue = eventQueues[targetId];
      if (!queue || queue.length === 0) return;

      var tempQueue = queue.slice(0);
      eventQueues[targetId] = [];

      var len = tempQueue.length;
      for (var i = 0; i < len; i++) {
          if (!instances[targetId] || instances[targetId] !== instance) {
              console.warn('_components: flushQueue aborted for "' + targetId + '": the instance was destroyed during dispatch.');
              break;
          }
          var item = tempQueue[i];
          try {
              instance.emitter.emit(item.event, item.data);
          } catch (e) {
              console.error('_components: Error dispatching queued event "' + item.event + '" for ' + targetId + ':', e);
          }
      }
  }

  // --- CENTRALIZED DOM AND MUTATION OBSERVER HANDLING ---

  function ensureGlobalObserverStarted() {
      if (globalObserver) return;

      var target = document.body || document.documentElement;
      if (!target) return;

      globalObserver = new MutationObserver(function() {
          var
            snapshot = observedInstances.slice(0),
            len = snapshot.length;
          for (var i = 0; i < len; i++) {
              var item = snapshot[i];
              if (item && item.element) {
                  var connected = typeof item.element.isConnected !== 'undefined'
                      ? item.element.isConnected
                      : document.documentElement.contains(item.element);
                  if (!connected) {
                      item.instance._destroy();
                  }
              }
          }
      });

      globalObserver.observe(target, { childList: true, subtree: true });
  }

  function stopGlobalObserver() {
      if (globalObserver) {
          globalObserver.disconnect();
          globalObserver = null;
      }
      observedInstances = []; // Clear references to allow Garbage Collection (GC)
  }

  function setupObserver(element, instance) {
      if (typeof MutationObserver === 'undefined') return;

      observedInstances.push({
          element: element,
          instance: instance
      });

      ensureGlobalObserverStarted();
  }

  function removeObserver(instance) {
      var len = observedInstances.length;
      for (var i = 0; i < len; i++) {
          if (observedInstances[i].instance === instance) {
              observedInstances.splice(i, 1);
              break;
          }
      }
      if (observedInstances.length === 0) {
          stopGlobalObserver();
      }
  }

  // --- COMPONENT INSTANTIATION ---

  function createComponentInstance(element, config, parentCoordinator) {
      var
        options = resolveConfig(element, config),
        id = options.id,
        componentName = options.component,
        finalId = resolveUniqueId(id),
      instance = {
          id: finalId,
          element: element,
          options: options,
          emitter: new EventEmitter(),
          _cleanups: [],
          on: function(event, callback) {
              if (isDestroyed()) {
                  console.warn('_components: Attempt to call "on" on a destroyed or unmounted instance with ID: "' + finalId + '".');
                  return;
              }
              this.emitter.on(event, callback);
          },
          off: function(event, callback) {
              if (isDestroyed()) {
                  console.warn('_components: Attempt to call "off" on a destroyed or unmounted instance with ID: "' + finalId + '".');
                  return;
              }
              this.emitter.off(event, callback);
          },
          once: function(event, callback) {
              if (isDestroyed()) {
                  console.warn('_components: Attempt to call "once" on a destroyed or unmounted instance with ID: "' + finalId + '".');
                  return;
              }
              this.emitter.once(event, callback);
          },
          emit: function(event, data) {
              if (isDestroyed()) {
                  console.warn('_components: Attempt to call "emit" on a destroyed or unmounted instance with ID: "' + finalId + '".');
                  return;
              }
              this.emitter.emit(event, data);
          },
          status: function() {
              return componentStates[finalId] || 'pending';
          },
          _destroy: function(isReset) {
              if (instances[finalId] !== this) {
                  removeObserver(this);
                  return;
              }
              if (!isReset && document.documentElement.contains(element)) {
                  console.warn('_components: Internal unmount cycle (_destroy) invoked for ID "' + finalId + '" while the node remains attached to the DOM tree.');
              }
              removeObserver(this);

              if (this._cleanups) {
                  for (var i = 0; i < this._cleanups.length; i++) {
                      try {
                          this._cleanups[i]();
                      } catch (e) {
                          console.error('_components: Error processing component cleanup during destruction:', e);
                      }
                  }
                  this._cleanups = [];
              }

              main._unregisterInstance(finalId);
          }
      };

      registerInstance(finalId, instance);

      var isDestroyed = function() {
          return !instances[finalId] || instances[finalId] !== instance;
      };

      setupObserver(element, instance);

      instance.start = function(onReady, onFailure) {
          var state = componentStates[finalId];
          if (state === 'ready') {
              if (onReady) onReady();
              return;
          }
          if (state === 'loading' || state === 'loading-fallback') {
              if (onReady) {
                  instance.emitter.once('ready', function() { onReady(); });
              }
              if (onFailure) {
                  instance.emitter.once('error', onFailure);
              }
              return;
          }
          if (state === 'failed') {
              if (onFailure) {
                  onFailure(new Error('_components: The component with ID "' + finalId + '" is in a failed state.'));
              }
              return;
          }

          var originalPlaceholder = element.cloneNode(true);

          componentStates[finalId] = 'loading';
          main._notifyStateChange(finalId, 'loading');

          var resolvedSrc = options.src;
          if (!resolvedSrc) {
              var compPath = componentName || options.id || '';
              resolvedSrc = findNearestOrigin(element) + compPath + '/';
          }
          resolvedSrc = normalizeOrigin(resolvedSrc);

          var
            steps = parseOrderString(options.componentOrder),
            currentStep = 0;

          function runStep() {
              if (currentStep >= steps.length) {
                  componentStates[finalId] = 'ready';
                  main._notifyStateChange(finalId, 'ready');

                  flushQueue(finalId, instance);

                  instance.emit('ready');
                  if (onReady) onReady();
                  return;
              }

              var
                group = steps[currentStep],
                count = group.length,
                finished = 0,
                failed = false,
                stepError = null;

              function next(err, resourceType, resolvedUrl) {
                  finished++;
                  if (err) {
                      if (resourceType === 'js') {
                          failed = true;
                          stepError = err;
                      } else {
                          console.warn('_components: Non-critical resource "' + resourceType + '" failed at ' + resolvedUrl + '. Initiating UI degradation: ' + err.message);
                      }
                  }
                  if (finished === count) {
                      if (failed) {
                          handleFailure(stepError);
                      } else {
                          currentStep++;
                          runStep();
                      }
                  }
              }

              for (var i = 0; i < count; i++) {
                  var
                    type = group[i].toLowerCase(),
                    url = resolvedSrc + type,
                    timeoutValue = options.timeout ? parseInt(options.timeout, 10) : globalConfig.timeout;

                  (function(t, u) {
                      fetchAndApplyResource(t, u, timeoutValue, element, finalId, function(err) {
                          next(err, t, u);
                      });
                  })(type, url);
              }
          }

          function handleFailure(err) {
              if (options.fallback) {
                  componentStates[finalId] = 'loading-fallback';
                  main._notifyStateChange(finalId, 'loading-fallback');

                  var
                    inheritedListeners = instance.emitter ? instance.emitter.listeners : null,
                    savedEventQueue = eventQueues[finalId] ? eventQueues[finalId].slice(0) : null;

                  removeObserver(instance);
                  main._unregisterInstance(finalId);

                  var
                    resolvedFallbackSrc = options.fallbackSrc || findNearestFallbackOrigin(element),
                    resolvedFallbackOrder = options.fallbackOrder || findNearestFallbackOrder(element) || 'css,html,js',
                    fallbackConfig = {
                      component: options.fallback,
                      id: finalId,
                      componentOrder: resolvedFallbackOrder,
                      src: resolvedFallbackSrc || null
                    },
                    fallbackInst = createComponentInstance(element, fallbackConfig, parentCoordinator);

                  if (savedEventQueue && savedEventQueue.length > 0) {
                      eventQueues[finalId] = savedEventQueue;
                  }

                  var LIFECYCLE_EVENTS = { 'ready': true, 'error': true };
                  if (inheritedListeners) {
                      for (var ev in inheritedListeners) {
                          if (inheritedListeners.hasOwnProperty(ev) && !LIFECYCLE_EVENTS[ev]) {
                              var fns = inheritedListeners[ev];
                              for (var k = 0; k < fns.length; k++) {
                                  var fn = fns[k];
                                  if (fn && fn._isOnce) {
                                      fallbackInst.emitter.once(ev, fn._originalCallback);
                                  } else {
                                      fallbackInst.emitter.on(ev, fn);
                                  }
                              }
                          }
                      }
                  }

                  fallbackInst.start(function() {
                      instance.emitter.emit('ready', { replacedBy: fallbackInst });
                      if (onReady) onReady();
                  }, function(fallbackErr) {
                      terminateWithError(fallbackErr);
                  });
              } else {
                  terminateWithError(err);
              }
          }

          function terminateWithError(err) {
              componentStates[finalId] = 'failed';
              main._notifyStateChange(finalId, 'failed');

              if (eventQueues[finalId]) {
                  delete eventQueues[finalId];
              }

              if (originalPlaceholder) {
                  element.innerHTML = '';

                  var
                    attrsToRemove = [],
                    currentAttrs = element.attributes;
                  for (var idx = 0; idx < currentAttrs.length; idx++) {
                      attrsToRemove.push(currentAttrs[idx].name);
                  }
                  for (var idx = 0; idx < attrsToRemove.length; idx++) {
                      element.removeAttribute(attrsToRemove[idx]);
                  }

                  var origAttrs = originalPlaceholder.attributes;
                  for (var a = 0; a < origAttrs.length; a++) {
                      element.setAttribute(origAttrs[a].name, origAttrs[a].value);
                  }

                  var restored = originalPlaceholder.cloneNode(true);
                  while (restored.firstChild) {
                      element.appendChild(restored.firstChild);
                  }
              }

              // Dual error notification (ensures both fallback and original listeners receive it)
              var activeInst = instances[finalId];
              if (activeInst && activeInst !== instance) {
                  activeInst.emitter.emit('error', err);
              }
              instance.emitter.emit('error', err);

              if (onFailure) onFailure(err);
          }

          var cancelDeps = evaluateDependencies(options.required, parentCoordinator, function() {
              runStep();
          }, function(err) {
              terminateWithError(err);
          });

          if (cancelDeps) {
              instance._cleanups.push(cancelDeps);
          }
      };

      return instance;
  }

  // --- COORDINATOR INSTANTIATION ---

  function scanDirectSubcoordinators(root) {
      var
        allSubCoords = root.querySelectorAll('[data-e-components]'),
        direct = [],
        len = allSubCoords.length;
      for (var i = 0; i < len; i++) {
          var
            el = allSubCoords[i],
            current = el.parentElement;
          while (current && current !== root) {
              if (current.hasAttribute('data-e-components')) {
                  break;
              }
              current = current.parentElement;
          }
          if (current === root) {
              direct.push(el);
          }
      }
      return direct;
  }

  function createCoordinatorInstance(element, config) {
      var
        options = resolveConfig(element, config),
        coordinatorId = options.components || null,
        finalId = coordinatorId ? resolveUniqueId(coordinatorId) : null,

        isStarting = false,
        startCallbacks = [],

      instance = {
          id: finalId,
          element: element,
          options: options,
          _destroy: function(isReset) {
              if (finalId && instances[finalId] !== this) {
                  removeObserver(this);
                  return;
              }
              removeObserver(this);
              if (finalId) {
                  main._unregisterInstance(finalId);
              }
          },
          start: function(onFinished) {
              if (finalId && componentStates[finalId] === 'ready') {
                  if (onFinished) onFinished();
                  return;
              }
              if (isStarting) {
                  if (onFinished) startCallbacks.push(onFinished);
                  return;
              }
              isStarting = true;
              if (onFinished) startCallbacks.push(onFinished);

              if (finalId) {
                  componentStates[finalId] = 'loading';
                  main._notifyStateChange(finalId, 'loading');
              }

              function finishCoordinator(err) {
                  isStarting = false;
                  if (finalId) {
                      componentStates[finalId] = err ? 'failed' : 'ready';
                      main._notifyStateChange(finalId, componentStates[finalId]);
                  }
                  var list = startCallbacks;
                  startCallbacks = [];
                  var len = list.length;
                  for (var i = 0; i < len; i++) {
                      try {
                          list[i](err);
                      } catch (e) {
                          console.error('_components: Error in finalized coordinator callback:', e);
                      }
                  }
              }

              function scanAndInitSubcoordinators(root, done) {
                  var
                    subCoords = scanDirectSubcoordinators(root),
                    total = subCoords.length;
                  if (total === 0) return done();

                  var
                    initialized = 0,
                    criticalFailed = null;

                  for (var i = 0; i < total; i++) {
                      var coordinatorInst = createCoordinatorInstance(subCoords[i], null);

                      (function(coord) {
                          coord.start(function(err) {
                              initialized++;
                              if (err && !criticalFailed) {
                                  criticalFailed = err;
                              }
                              if (initialized === total) {
                                  done(criticalFailed);
                              }
                          });
                      })(coordinatorInst);
                  }
              }

              function scanDirectChildren() {
                  var
                    allDescendants = element.querySelectorAll('[data-e-component]'),
                    direct = [],
                    len = allDescendants.length;
                  for (var i = 0; i < len; i++) {
                      var
                        el = allDescendants[i],
                        current = el.parentElement;
                      while (current && current !== element) {
                          if (current.hasAttribute('data-e-components')) {
                              break;
                          }
                          current = current.parentElement;
                      }
                      if (current === element) {
                          direct.push(el);
                      }
                  }
                  return direct;
              }

              var
                directChildrenNodes = scanDirectChildren(),
                orderSteps = parseOrderString(options.order),
                currentStep = 0;

              function runCoordinatorStep() {
                  if (currentStep >= orderSteps.length) {
                      finishCoordinator();
                      return;
                  }

                  var
                    group = orderSteps[currentStep],
                    count = group.length,
                    finished = 0,
                    criticalFailed = false;

                  function checkProgress(childId, success, isCritical) {
                      finished++;
                      if (!success) {
                          var
                            childInst = instances[childId],
                            isRequired = false;
                          if (isCritical) {
                              isRequired = true;
                          } else if (childInst && childInst.options.required !== null && childInst.options.required !== undefined) {
                              var reqVal = childInst.options.required;
                              if (reqVal !== 'false' && reqVal !== false) {
                                  isRequired = true;
                              }
                          }

                          if (isRequired) {
                              criticalFailed = true;
                          }
                      }

                      if (finished === count) {
                          if (criticalFailed) {
                              finishCoordinator(new Error('_components: Orchestration halted due to a failure in a required component.'));
                          } else {
                              currentStep++;
                              runCoordinatorStep();
                          }
                      }
                  }

                  for (var i = 0; i < count; i++) {
                      var
                        childName = group[i],
                        matchedNode = null,
                        nodesLen = directChildrenNodes.length;

                      for (var j = 0; j < nodesLen; j++) {
                          if (directChildrenNodes[j].getAttribute('data-e-component') === childName) {
                              matchedNode = directChildrenNodes[j];
                              break;
                          }
                      }

                      if (!matchedNode) {
                          checkProgress(childName, true);
                          continue;
                      }

                      var
                        childId = matchedNode.getAttribute('data-e-component-id') || childName,
                        childInst = instances[childId] || createComponentInstance(matchedNode, null, instance);

                      (function(cId, cInst) {
                          cInst.start(function() {
                              scanAndInitSubcoordinators(cInst.element, function(err) {
                                  if (err) {
                                      checkProgress(cId, false, true); // Added isCritical flag for correct propagation
                                  } else {
                                      checkProgress(cId, true);
                                  }
                              });
                          }, function() {
                              checkProgress(cId, false);
                          });
                      })(childInst.id, childInst);
                  }
              }

              runCoordinatorStep();
          }
      };

      if (finalId) {
          registerInstance(finalId, instance);
      }
      setupObserver(element, instance);

      return instance;
  }

  function initialize(element, config) {
      if (!element) return;
      var
        options = resolveConfig(element, config),
        isCoordinator = !!options.components,
        isComponent = !!options.component;

      if (isComponent) {
          var compInstance = createComponentInstance(element, config);
          compInstance.start(function() {
              if (isCoordinator) {
                  var coordInstance = createCoordinatorInstance(element, config);
                  coordInstance.start();
              }
          });
          return compInstance;
      } else if (isCoordinator) {
          var coordInstance = createCoordinatorInstance(element, config);
          coordInstance.start();
          return coordInstance;
      }
  }

  /**
    * Main entry point for module initialization or configuration.
    * @param {Element|Object} elementOrConfig - DOM element to initialize or global configuration.
    * @param {Object} [config] - Instance-specific configuration.
    * @returns {Object|undefined} Global configuration or created instance.
    */
  _components.fn(function (elementOrConfig, config) {
    if (isPlainObject(elementOrConfig)) {
      var _config = configure(elementOrConfig);
      return { config: function () { return _config; } };
    }

    var _ref = initialize(elementOrConfig, config);
    return { ref: function () { return _ref; } };
  });

  _components.get = main.get;
  _components.emit = main.emit;
  _components.order = main.order;
  _components.scan = main.scan;
  _components.autoScan = main.autoScan;
  _components.resetCache = main.resetCache;
  _components._registerStateObserver = main._registerStateObserver;
  _components._unregisterStateObserver = main._unregisterStateObserver;

  return _components;
}));
