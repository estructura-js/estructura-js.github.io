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
  var global_config = {
      origin: './',
      timeout: 10000,
      autoScan: false,
      files: { css: '.css', html: '.html', js: '.js' }
  };

  var
    _components = _e.instance('components'),
    registered_orders = {},
    instances = {},
    resource_cache = {},
    component_states = {},
    global_state_observers = [],

    applied_css = {},
    applied_js = {},

    parsed_order_cache = {},
    parsed_order_cache_keys = [],
    resource_cache_keys = [];

  // Control structures for collision resolution and event queueing
  var
    component_counters = {},
    event_queues = {},
    MAX_QUEUE_SIZE = 50;

  // Internal registry to capture execution errors from dynamic scripts
  var
    execution_errors = {};

  // Centralized MutationObserver system
  var
    global_observer = null,
    observed_instances = [],
    random_errors_id = '_e_components_' + (new Date()).getTime();

  // Register global execution error handler for injected components
  if (typeof window !== 'undefined') {
    window.addEventListener('error', function (event) {
      if (!event || typeof event !== 'object') { return; }
      var _err = event.error;
      if (!_err || typeof _err !== 'object') { return; }
      if (typeof _err[random_errors_id] !== 'undefined' && _err[random_errors_id] == _err.name) {
        execution_errors[_err.name] = _err.message;
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
    * @param {string} target_id - Target instance ID.
    * @param {string} event - Event name.
    * @param {*} data - Data associated with the event.
    */
  main.emit = function(target_id, event, data) {
      var state = component_states[target_id];

      if (state === 'failed') {
          console.warn('_components: Event delivery for "' + event + '" has been discarded because the target component "' + target_id + '" is in a failed state.');
          return;
      }

      var inst = instances[target_id];
      if (inst && state === 'ready') {
          inst.emitter.emit(event, data);
      } else {
          if (!event_queues[target_id]) {
              event_queues[target_id] = [];
          }
          if (event_queues[target_id].length < MAX_QUEUE_SIZE) {
              event_queues[target_id].push({ event: event, data: data });
          } else {
              console.warn('_components: Event queue limit (' + MAX_QUEUE_SIZE + ') exceeded for ID "' + target_id + '". Discarding event "' + event + '".');
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
          registered_orders[name] = value;
          if (parsed_order_cache[name]) {
              delete parsed_order_cache[name];
              var idx = parsed_order_cache_keys.indexOf(name);
              if (idx > -1) parsed_order_cache_keys.splice(idx, 1);
          }
      }
      return registered_orders[name];
  };

  /**
    * Scans the indicated DOM subtree for elements configured with component directives.
    * @param {Element} [root] - Root node for the search.
    */
  main.scan = function(root) {
      var search_root = root || document.body;
      if (!search_root) return;

      var
        roots = search_root.querySelectorAll('[data-e-components]'),
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
      global_state_observers = [];

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
      component_states = {};
      applied_css = {};
      applied_js = {};
      resource_cache = {};
      resource_cache_keys = [];
      parsed_order_cache = {};
      parsed_order_cache_keys = [];
      component_counters = {};
      event_queues = {};
      execution_errors = {};
      stop_global_observer();
  };

  main._unregisterInstance = function(id) {
      delete instances[id];
      delete component_states[id];
      delete event_queues[id];
      delete component_counters[id];
      delete execution_errors[id];
  };

  main._registerStateObserver = function(fn) {
      global_state_observers.push(fn);
  };

  main._unregisterStateObserver = function(fn) {
      var index = global_state_observers.indexOf(fn);
      if (index > -1) {
          global_state_observers.splice(index, 1);
      }
  };

  main._notifyStateChange = function (id, state) {
      // Snapshot to avoid index shifting on concurrent unregistration
      var
        observers = global_state_observers.slice(0),
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
  function is_plain_object(obj) {
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
              global_config[key] = opts[key];
          }
      }
      if (global_config.autoScan) {
          main.autoScan();
      }
      return global_config;
  }

  function get_attr(element, name) {
      return element ? element.getAttribute(name) : null;
  }

  /**
    * Resolves options, prioritizing call parameters over HTML attributes of the element.
    * @param {Object} config - Dynamic configuration object.
    * @param {string} key - Property key.
    * @param {Element} element - DOM node.
    * @param {string} attr_name - Associated data attribute in the DOM.
    * @param {*} [default_value] - Default value.
    * @returns {*}
    */
  function get_option(config, key, element, attr_name, default_value) {
      if (config && config[key] !== undefined) {
          return config[key];
      }
      var attr_val = get_attr(element, attr_name);
      return attr_val !== null ? attr_val : default_value;
  }

  /**
    * Consolidates element configuration parameters from the DOM and external options.
    * @param {Element} element
    * @param {Object} [config]
    * @returns {Object}
    */
  function resolve_config(element, config) {
      config = config || {};
      var options = {
          components: get_option(config, 'components', element, 'data-e-components'),
          origin: get_option(config, 'origin', element, 'data-e-components-origin'),
          order: get_option(config, 'order', element, 'data-e-components-order'),

          component: get_option(config, 'component', element, 'data-e-component'),
          src: get_option(config, 'src', element, 'data-e-component-src'),
          componentOrder: get_option(config, 'componentOrder', element, 'data-e-component-order', 'css,html,js'),
          id: get_option(config, 'id', element, 'data-e-component-id'),
          required: get_option(config, 'required', element, 'data-e-component-required'),
          fallback: get_option(config, 'fallback', element, 'data-e-component-fallback'),
         timeout: get_option(config, 'timeout', element, 'data-e-component-timeout'),

          files: (config && config.files && typeof config.files === 'object' ? config.files : global_config.files),

          fallbackSrc: get_option(config, 'fallbackSrc', element, 'data-e-component-fallback-src'),
          fallbackOrder: get_option(config, 'fallbackOrder', element, 'data-e-component-fallback-order')
      };

      if (options.component && !options.id) {
          options.id = options.component;
      }

      return options;
  }

  /**
    * Iteratively traverses up the DOM tree looking for the presence of an attribute.
    * @param {Element} element - Starting element.
    * @param {string} attr_name - Name of the attribute.
    * @returns {string|null}
    */
  function find_nearest_attr(element, attr_name) {
      var current = element;
      while (current) {
          var val = current.getAttribute(attr_name);
          if (val) {
              return val;
          }
          current = current.parentElement;
      }
      return null;
  }

  function find_nearest_origin(element) {
      var origin = find_nearest_attr(element, 'data-e-components-origin');
      if (origin) {
          return normalize_origin(origin);
      }
      var global_origin = global_config.origin;
      if (global_origin) {
          return normalize_origin(global_origin);
      }
      return './';
  }

  function find_nearest_fallback_origin(element) {
      var origin = find_nearest_attr(element, 'data-e-components-fallback-origin');
      return origin ? normalize_origin(origin) : null;
  }

  function find_nearest_fallback_order(element) {
      return find_nearest_attr(element, 'data-e-components-fallback-order');
  }

  function normalize_origin(url) {
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
  function add_to_parsed_order_cache(key, value) {
      if (!parsed_order_cache[key]) {
          if (parsed_order_cache_keys.length >= MAX_CACHE_ENTRIES) {
              var oldest = parsed_order_cache_keys.shift();
              delete parsed_order_cache[oldest];
          }
          parsed_order_cache_keys.push(key);
      }
      parsed_order_cache[key] = value;
  }

  /**
    * Processes a sequential or parallel loading format.
    * @param {string} order_val
    * @returns {Array}
    */
  function parse_order_string(order_val) {
      if (!order_val) return [];
      if (parsed_order_cache[order_val]) {
          return parsed_order_cache[order_val];
      }

      var
        registered = registered_orders[order_val],
        resolved = registered ? registered : order_val,

        steps = resolved.split(','),
        parsed = [],
        s_len = steps.length;

      for (var i = 0; i < s_len; i++) {
          var step = steps[i].trim();
          if (step) {
              var
                parallel_group = step.split('+'),
                parsed_group = [],
                p_len = parallel_group.length;
              for (var j = 0; j < p_len; j++) {
                  var item = parallel_group[j].trim();
                  if (item) {
                      parsed_group.push(item);
                  }
              }
              if (parsed_group.length > 0) {
                  parsed.push(parsed_group);
              }
          }
      }
      add_to_parsed_order_cache(order_val, parsed);
      return parsed;
  }

  /**
    * Performs remote request and applies resource associated with a component in a coordinated manner.
    * @param {string} type - Resource type ('css', 'html', 'js').
    * @param {string} url - Destination URL.
    * @param {number} timeout - Maximum timeout duration.
    * @param {Element} element - Component container node.
    * @param {string|null} component_id - Component ID to track execution failures.
    * @param {Function} callback - Callback function.
    */
  function fetch_and_apply_resource(type, url, timeout, element, component_id, callback) {
      var
        cache_key = type + ':' + url,
        valid_types = ['css', 'html', 'js'];

      if (valid_types.indexOf(type) === -1) {
          callback(new Error('_components: Unknown resource type: "' + type + '" for URL: ' + url));
          return;
      }

      if (type === 'css' && applied_css[cache_key]) {
          return callback(null);
      }
      if (type === 'js' && applied_js[cache_key]) {
          return callback(null);
      }

      if (resource_cache[cache_key]) {
          var entry = resource_cache[cache_key];
          if (entry.status === 'loaded') {
              if (type === 'html') {
                  apply_resource_to_dom(type, entry.data, element, component_id, callback);
              } else {
                  callback(null);
              }
          } else if (entry.status === 'failed') {
              callback(entry.error);
          } else {
              entry.callbacks.push(function(err, data) {
                  if (err) return callback(err);
                  if (type === 'html') {
                      apply_resource_to_dom(type, data, element, component_id, callback);
                  } else {
                      callback(null);
                  }
              });
          }
          return;
      }

      // Defensive control of maximum cached resource size (prevents duplicate entries)
      if (resource_cache_keys.indexOf(cache_key) === -1) {
          if (resource_cache_keys.length >= MAX_CACHE_ENTRIES) {
              var oldest_key = resource_cache_keys.shift();
              delete resource_cache[oldest_key];
          }
          resource_cache_keys.push(cache_key);
      }

      var cache_entry = {
          status: 'loading',
          data: null,
          error: null,
          callbacks: []
      };
      resource_cache[cache_key] = cache_entry;

      if (typeof _http !== 'function') {
          var missing_dep_err = new Error('_components: Global dependency "_http" not found. Load the HTTP module before proceeding.');
          cache_entry.status = 'failed';
          cache_entry.error = missing_dep_err;
          callback(missing_dep_err);
          return;
      }

      _http({
          method: 'GET',
          url: url,
          timeout: timeout,
          onSuccess: function(response_text) {
              cache_entry.data = response_text;

              if (type === 'html') {
                  apply_resource_to_dom(type, response_text, element, component_id, function(err) {
                      if (!err) {
                          cache_entry.status = 'loaded';
                      } else {
                          cache_entry.status = 'failed';
                          cache_entry.error = err;
                      }
                      callback(err);

                      var
                        list = cache_entry.callbacks,
                        len = list.length;
                      cache_entry.callbacks = [];
                      for (var i = 0; i < len; i++) {
                          try {
                              list[i](err, response_text);
                          } catch (ex) {
                              console.error('_components: Error processing queued resource callback:', ex);
                          }
                      }
                  });
              } else {
                  apply_resource_to_dom(type, response_text, element, component_id, function(err) {
                      if (!err) {
                          cache_entry.status = 'loaded';
                          if (type === 'css') applied_css[cache_key] = true;
                          if (type === 'js') applied_js[cache_key] = true;
                      } else {
                          cache_entry.status = 'failed';
                          cache_entry.error = err;
                      }
                      callback(err);

                      var
                        list = cache_entry.callbacks,
                        len = list.length;
                      cache_entry.callbacks = [];
                      for (var i = 0; i < len; i++) {
                          try {
                              list[i](err, response_text);
                          } catch (ex) {
                              console.error('_components: Error processing queued resource callback:', ex);
                          }
                      }
                  });
              }
          },
          onError: function(err) {
              cache_entry.status = 'failed';
              cache_entry.error = err;

              callback(err);

              var
                list = cache_entry.callbacks,
                len = list.length;
              cache_entry.callbacks = [];
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

  function apply_resource_to_dom(type, data, element, component_id, callback) {
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
                wrapped_data = data;

              // Wrap JS code in a try-catch block while maintaining scope compatibility
              if (component_id) {
                  var safe_component_id = component_id
                      .replace(/\\/g, '\\\\')
                      .replace(/'/g, "\\'")
                      .replace(/\r/g, '\\r')
                      .replace(/\n/g, '\\n');
                      wrapped_data = "try {\n" + data + "\n}\n" +
                                "catch(e) {\n" +
                                "  e." + random_errors_id + " = '" + safe_component_id + "';\n" +
                                "  e.name = '" + safe_component_id + "';\n" +
                                "  throw e;\n" +
                                "}";
              }

              if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                  var
                    blob = new Blob([wrapped_data], { type: 'application/javascript' }),
                    blob_url = URL.createObjectURL(blob);

                  script.src = blob_url;

                  script.onload = function() {
                      URL.revokeObjectURL(blob_url);
                      if (script.parentNode) {
                          script.parentNode.removeChild(script);
                      }
                      var exec_err = component_id ? execution_errors[component_id] : null;
                      if (exec_err) {
                          delete execution_errors[component_id];
                          callback(exec_err);
                      } else {
                          callback(null);
                      }
                  };

                  script.onerror = function() {
                      URL.revokeObjectURL(blob_url);
                      if (script.parentNode) {
                          script.parentNode.removeChild(script);
                      }
                      // Fallback contingency in case of Content Security Policy (CSP) blockages
                      try {
                          var fallback_script = document.createElement('script');
                          fallback_script.textContent = wrapped_data;
                          document.head.appendChild(fallback_script);
                          if (fallback_script.parentNode) {
                              fallback_script.parentNode.removeChild(fallback_script);
                          }
                          var exec_err = component_id ? execution_errors[component_id] : null;
                          if (exec_err) {
                              delete execution_errors[component_id];
                              callback(exec_err);
                          } else {
                              callback(null);
                          }
                      } catch (fallback_err) {
                          callback(new Error('_components: Failed to interpret JS resource asynchronously (even with fallback). Details: ' + fallback_err.message));
                      }
                  };

                  document.head.appendChild(script);
              } else {
                  script.textContent = wrapped_data;
                  document.head.appendChild(script);
                  if (script.parentNode) {
                      script.parentNode.removeChild(script);
                  }
                  var exec_err = component_id ? execution_errors[component_id] : null;
                  if (exec_err) {
                      delete execution_errors[component_id];
                      callback(exec_err);
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

  function is_id_in_parsed_order(parsed_order, id) {
      var s_len = parsed_order.length;
      for (var i = 0; i < s_len; i++) {
          var
            group = parsed_order[i],
            g_len = group.length;
          for (var j = 0; j < g_len; j++) {
              if (group[j] === id) {
                  return true;
              }
          }
      }
      return false;
  }

  function evaluate_dependencies(required_str, parent_coordinator, on_ready, on_failure) {
      if (!required_str || required_str === 'true' || required_str === 'false') {
          on_ready();
          return null;
      }

      var
        dep_ids = required_str.split(/[\s,]+/),
        pending_set = {},
        has_active_deps = false,
        len = dep_ids.length;

      for (var i = 0; i < len; i++) {
          var clean_id = dep_ids[i].trim();
          if (clean_id) {
              var
                exists_globally = instances[clean_id] || component_states[clean_id],
                exists_in_coordinator = false;

              if (parent_coordinator && parent_coordinator.options && parent_coordinator.options.order) {
                  var parsed_order = parse_order_string(parent_coordinator.options.order);
                  if (is_id_in_parsed_order(parsed_order, clean_id)) {
                      exists_in_coordinator = true;
                  }
              }

              if (!exists_globally && !exists_in_coordinator) {
                  on_failure(new Error('_components: Invalid configuration: Dependency "' + clean_id + '" has not been registered or declared in the orchestration.'));
                  return null;
              }

              pending_set[clean_id] = true;
              has_active_deps = true;
          }
      }

      if (!has_active_deps) {
          on_ready();
          return null;
      }

      function check_states() {
          var all_ready = true;
          for (var id in pending_set) {
              if (pending_set.hasOwnProperty(id)) {
                  var state = component_states[id] || 'pending';
                  if (state === 'failed') {
                      on_failure(new Error('_components: Critical failure propagated from required dependency: ' + id));
                      cleanup();
                      return;
                  }
                  if (state !== 'ready') {
                      all_ready = false;
                  }
              }
          }
          if (all_ready) {
              on_ready();
              cleanup();
          }
      }

      function on_state_update() {
          check_states();
      }

      function cleanup() {
          main._unregisterStateObserver(on_state_update);
      }

      main._registerStateObserver(on_state_update);
      check_states();

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
          if (cb === callback || cb._original_callback === callback) {
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
      wrapper._is_once = true;
      wrapper._original_callback = callback;
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

  function resolve_unique_id(id) {
      var resolved_id = id;
      if (instances[resolved_id]) {
          if (!component_counters[id]) {
              component_counters[id] = 0;
          }
          // Deterministic loop to guarantee uniqueness and full integrity of the instance tree
          while (instances[resolved_id]) {
              component_counters[id]++;
              resolved_id = id + '_' + component_counters[id];
          }
          console.warn('_components: Duplicate ID detected for "' + id + '". Automatically registered as "' + resolved_id + '". Events sent to the original ID "' + id + '" will not reach this instance.');
      }
      return resolved_id;
  }

  function register_instance(resolved_id, instance) {
      for (var key in instances) {
          if (instances.hasOwnProperty(key) && key !== resolved_id) {
              var other = instances[key];
              if (other.element === instance.element) {
                  if (component_states[key] === 'loading' || component_states[key] === 'pending' || component_states[key] === 'loading-fallback') {
                      component_states[key] = 'failed';
                      main._notifyStateChange(key, 'failed');
                  }
                  other._destroy(true);
              }
          }
      }

      instances[resolved_id] = instance;
      component_states[resolved_id] = 'pending';
  }

  function flush_queue(target_id, instance) {
      var queue = event_queues[target_id];
      if (!queue || queue.length === 0) return;

      var temp_queue = queue.slice(0);
      event_queues[target_id] = [];

      var len = temp_queue.length;
      for (var i = 0; i < len; i++) {
          if (!instances[target_id] || instances[target_id] !== instance) {
              console.warn('_components: flushQueue aborted for "' + target_id + '": the instance was destroyed during dispatch.');
              break;
          }
          var item = temp_queue[i];
          try {
              instance.emitter.emit(item.event, item.data);
          } catch (e) {
              console.error('_components: Error dispatching queued event "' + item.event + '" for ' + target_id + ':', e);
          }
      }
  }

  // --- CENTRALIZED DOM AND MUTATION OBSERVER HANDLING ---

  function ensure_global_observer_started() {
      if (global_observer) return;

      var target = document.body || document.documentElement;
      if (!target) return;

      global_observer = new MutationObserver(function() {
          var
            snapshot = observed_instances.slice(0),
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

      global_observer.observe(target, { childList: true, subtree: true });
  }

  function stop_global_observer() {
      if (global_observer) {
          global_observer.disconnect();
          global_observer = null;
      }
      observed_instances = []; // Clear references to allow Garbage Collection (GC)
  }

  function setup_observer(element, instance) {
      if (typeof MutationObserver === 'undefined') return;

      observed_instances.push({
          element: element,
          instance: instance
      });

      ensure_global_observer_started();
  }

  function remove_observer(instance) {
      var len = observed_instances.length;
      for (var i = 0; i < len; i++) {
          if (observed_instances[i].instance === instance) {
              observed_instances.splice(i, 1);
              break;
          }
      }
      if (observed_instances.length === 0) {
          stop_global_observer();
      }
  }

  // --- COMPONENT INSTANTIATION ---

  function create_component_instance(element, config, parent_coordinator) {
      var
        options = resolve_config(element, config),
        id = options.id,
        component_name = options.component,
        final_id = resolve_unique_id(id),
      instance = {
          id: final_id,
          element: element,
          options: options,
          emitter: new EventEmitter(),
          _cleanups: [],
          on: function(event, callback) {
              if (is_destroyed()) {
                  console.warn('_components: Attempt to call "on" on a destroyed or unmounted instance with ID: "' + final_id + '".');
                  return;
              }
              this.emitter.on(event, callback);
          },
          off: function(event, callback) {
              if (is_destroyed()) {
                  console.warn('_components: Attempt to call "off" on a destroyed or unmounted instance with ID: "' + final_id + '".');
                  return;
              }
              this.emitter.off(event, callback);
          },
          once: function(event, callback) {
              if (is_destroyed()) {
                  console.warn('_components: Attempt to call "once" on a destroyed or unmounted instance with ID: "' + final_id + '".');
                  return;
              }
              this.emitter.once(event, callback);
          },
          emit: function(event, data) {
              if (is_destroyed()) {
                  console.warn('_components: Attempt to call "emit" on a destroyed or unmounted instance with ID: "' + final_id + '".');
                  return;
              }
              this.emitter.emit(event, data);
          },
          status: function() {
              return component_states[final_id] || 'pending';
          },
          _destroy: function(is_reset) {
              if (instances[final_id] !== this) {
                  remove_observer(this);
                  return;
              }
              if (!is_reset && document.documentElement.contains(element)) {
                  console.warn('_components: Internal unmount cycle (_destroy) invoked for ID "' + final_id + '" while the node remains attached to the DOM tree.');
              }
              remove_observer(this);

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

              main._unregisterInstance(final_id);
          }
      };

      register_instance(final_id, instance);

      var is_destroyed = function() {
          return !instances[final_id] || instances[final_id] !== instance;
      };

      setup_observer(element, instance);

      instance.start = function(on_ready, on_failure) {
          var state = component_states[final_id];
          if (state === 'ready') {
              if (on_ready) on_ready();
              return;
          }
          if (state === 'loading' || state === 'loading-fallback') {
              if (on_ready) {
                  instance.emitter.once('ready', function() { on_ready(); });
              }
              if (on_failure) {
                  instance.emitter.once('error', on_failure);
              }
              return;
          }
          if (state === 'failed') {
              if (on_failure) {
                  on_failure(new Error('_components: The component with ID "' + final_id + '" is in a failed state.'));
              }
              return;
          }

          var original_placeholder = element.cloneNode(true);

          component_states[final_id] = 'loading';
          main._notifyStateChange(final_id, 'loading');

          var resolved_src = options.src;
          if (!resolved_src) {
              var comp_path = component_name || options.id || '';
              resolved_src = find_nearest_origin(element) + comp_path + '/';
          }
          resolved_src = normalize_origin(resolved_src);

          var
            steps = parse_order_string(options.componentOrder),
            current_step = 0;

          function run_step() {
              if (current_step >= steps.length) {
                  component_states[final_id] = 'ready';
                  main._notifyStateChange(final_id, 'ready');

                  flush_queue(final_id, instance);

                  instance.emit('ready');
                  if (on_ready) on_ready();
                  return;
              }

              var
                group = steps[current_step],
                count = group.length,
                finished = 0,
                failed = false,
                step_error = null;

              function next(err, resource_type, resolved_url) {
                  finished++;
                  if (err) {
                      if (resource_type === 'js') {
                          failed = true;
                          step_error = err;
                      } else {
                          console.warn('_components: Non-critical resource "' + resource_type + '" failed at ' + resolved_url + '. Initiating UI degradation: ' + err.message);
                      }
                  }
                  if (finished === count) {
                      if (failed) {
                          handle_failure(step_error);
                      } else {
                          current_step++;
                          run_step();
                      }
                  }
              }

              for (var i = 0; i < count; i++) {
                  var
                    type = group[i].toLowerCase(),
                    url = resolved_src + (options.files && typeof options.files[type] === 'string' ? options.files[type] : '.' + type),
                    timeout_value = options.timeout ? parseInt(options.timeout, 10) : global_config.timeout;

                  (function(t, u) {
                      fetch_and_apply_resource(t, u, timeout_value, element, final_id, function(err) {
                          next(err, t, u);
                      });
                  })(type, url);
              }
          }

          function handle_failure(err) {
              if (options.fallback) {
                  component_states[final_id] = 'loading-fallback';
                  main._notifyStateChange(final_id, 'loading-fallback');

                  var
                    inherited_listeners = instance.emitter ? instance.emitter.listeners : null,
                    saved_event_queue = event_queues[final_id] ? event_queues[final_id].slice(0) : null;

                  remove_observer(instance);
                  main._unregisterInstance(final_id);

                  var
                    resolved_fallback_src = options.fallbackSrc || find_nearest_fallback_origin(element),
                    resolved_fallback_order = options.fallbackOrder || find_nearest_fallback_order(element) || 'css,html,js',
                    fallback_config = {
                      component: options.fallback,
                      id: final_id,
                      componentOrder: resolved_fallback_order,
                      src: resolved_fallback_src || null
                    },
                    fallback_inst = create_component_instance(element, fallback_config, parent_coordinator);

                  if (saved_event_queue && saved_event_queue.length > 0) {
                      event_queues[final_id] = saved_event_queue;
                  }

                  var lifecycle_events = { 'ready': true, 'error': true };
                  if (inherited_listeners) {
                      for (var ev in inherited_listeners) {
                          if (inherited_listeners.hasOwnProperty(ev) && !lifecycle_events[ev]) {
                              var fns = inherited_listeners[ev];
                              for (var k = 0; k < fns.length; k++) {
                                  var fn = fns[k];
                                  if (fn && fn._is_once) {
                                      fallback_inst.emitter.once(ev, fn._original_callback);
                                  } else {
                                      fallback_inst.emitter.on(ev, fn);
                                  }
                              }
                          }
                      }
                  }

                  fallback_inst.start(function() {
                      instance.emitter.emit('ready', { replacedBy: fallback_inst });
                      if (on_ready) on_ready();
                  }, function(fallback_err) {
                      terminate_with_error(fallback_err);
                  });
              } else {
                  terminate_with_error(err);
              }
          }

          function terminate_with_error(err) {
              component_states[final_id] = 'failed';
              main._notifyStateChange(final_id, 'failed');

              if (event_queues[final_id]) {
                  delete event_queues[final_id];
              }

              if (original_placeholder) {
                  element.innerHTML = '';

                  var
                    attrs_to_remove = [],
                    current_attrs = element.attributes;
                  for (var idx = 0; idx < current_attrs.length; idx++) {
                      attrs_to_remove.push(current_attrs[idx].name);
                  }
                  for (var idx = 0; idx < attrs_to_remove.length; idx++) {
                      element.removeAttribute(attrs_to_remove[idx]);
                  }

                  var orig_attrs = original_placeholder.attributes;
                  for (var a = 0; a < orig_attrs.length; a++) {
                      element.setAttribute(orig_attrs[a].name, orig_attrs[a].value);
                  }

                  var restored = original_placeholder.cloneNode(true);
                  while (restored.firstChild) {
                      element.appendChild(restored.firstChild);
                  }
              }

              // Dual error notification (ensures both fallback and original listeners receive it)
              var active_inst = instances[final_id];
              if (active_inst && active_inst !== instance) {
                  active_inst.emitter.emit('error', err);
              }
              instance.emitter.emit('error', err);

              if (on_failure) on_failure(err);
          }

          var cancel_deps = evaluate_dependencies(options.required, parent_coordinator, function() {
              run_step();
          }, function(err) {
              terminate_with_error(err);
          });

          if (cancel_deps) {
              instance._cleanups.push(cancel_deps);
          }
      };

      return instance;
  }

  // --- COORDINATOR INSTANTIATION ---

  function scan_direct_subcoordinators(root) {
      var
        all_sub_coords = root.querySelectorAll('[data-e-components]'),
        direct = [],
        len = all_sub_coords.length;
      for (var i = 0; i < len; i++) {
          var
            el = all_sub_coords[i],
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

  function create_coordinator_instance(element, config) {
      var
        options = resolve_config(element, config),
        coordinator_id = options.components || null,
        final_id = coordinator_id ? resolve_unique_id(coordinator_id) : null,

        is_starting = false,
        start_callbacks = [],

      instance = {
          id: final_id,
          element: element,
          options: options,
          _destroy: function(is_reset) {
              if (final_id && instances[final_id] !== this) {
                  remove_observer(this);
                  return;
              }
              remove_observer(this);
              if (final_id) {
                  main._unregisterInstance(final_id);
              }
          },
          start: function(on_finished) {
              if (final_id && component_states[final_id] === 'ready') {
                  if (on_finished) on_finished();
                  return;
              }
              if (is_starting) {
                  if (on_finished) start_callbacks.push(on_finished);
                  return;
              }
              is_starting = true;
              if (on_finished) start_callbacks.push(on_finished);

              if (final_id) {
                  component_states[final_id] = 'loading';
                  main._notifyStateChange(final_id, 'loading');
              }

              function finish_coordinator(err) {
                  is_starting = false;
                  if (final_id) {
                      component_states[final_id] = err ? 'failed' : 'ready';
                      main._notifyStateChange(final_id, component_states[final_id]);
                  }
                  var list = start_callbacks;
                  start_callbacks = [];
                  var len = list.length;
                  for (var i = 0; i < len; i++) {
                      try {
                          list[i](err);
                      } catch (e) {
                          console.error('_components: Error in finalized coordinator callback:', e);
                      }
                  }
              }

              function scan_and_init_subcoordinators(root, done) {
                  var
                    sub_coords = scan_direct_subcoordinators(root),
                    total = sub_coords.length;
                  if (total === 0) return done();

                  var
                    initialized = 0,
                    critical_failed = null;

                  for (var i = 0; i < total; i++) {
                      var coordinator_inst = create_coordinator_instance(sub_coords[i], null);

                      (function(coord) {
                          coord.start(function(err) {
                              initialized++;
                              if (err && !critical_failed) {
                                  critical_failed = err;
                              }
                              if (initialized === total) {
                                  done(critical_failed);
                              }
                          });
                      })(coordinator_inst);
                  }
              }

              function scan_direct_children() {
                  var
                    all_descendants = element.querySelectorAll('[data-e-component]'),
                    direct = [],
                    len = all_descendants.length;
                  for (var i = 0; i < len; i++) {
                      var
                        el = all_descendants[i],
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
                direct_children_nodes = scan_direct_children(),
                order_steps = parse_order_string(options.order),
                current_step = 0;

              function run_coordinator_step() {
                  if (current_step >= order_steps.length) {
                      finish_coordinator();
                      return;
                  }

                  var
                    group = order_steps[current_step],
                    count = group.length,
                    finished = 0,
                    critical_failed = false;

                  function check_progress(child_id, success, is_critical) {
                      finished++;
                      if (!success) {
                          var
                            child_inst = instances[child_id],
                            is_required = false;
                          if (is_critical) {
                              is_required = true;
                          } else if (child_inst && child_inst.options.required !== null && child_inst.options.required !== undefined) {
                              var req_val = child_inst.options.required;
                              if (req_val !== 'false' && req_val !== false) {
                                  is_required = true;
                              }
                          }

                          if (is_required) {
                              critical_failed = true;
                          }
                      }

                      if (finished === count) {
                          if (critical_failed) {
                              finish_coordinator(new Error('_components: Orchestration halted due to a failure in a required component.'));
                          } else {
                              current_step++;
                              run_coordinator_step();
                          }
                      }
                  }

                  for (var i = 0; i < count; i++) {
                      var
                        child_name = group[i],
                        matched_node = null,
                        nodes_len = direct_children_nodes.length;

                      for (var j = 0; j < nodes_len; j++) {
                          if (direct_children_nodes[j].getAttribute('data-e-component') === child_name) {
                              matched_node = direct_children_nodes[j];
                              break;
                          }
                      }

                      if (!matched_node) {
                          check_progress(child_name, true);
                          continue;
                      }

                      var
                        child_id = matched_node.getAttribute('data-e-component-id') || child_name,
                        child_inst = instances[child_id] || create_component_instance(matched_node, null, instance);

                      (function(c_id, c_inst) {
                          c_inst.start(function() {
                              scan_and_init_subcoordinators(c_inst.element, function(err) {
                                  if (err) {
                                      check_progress(c_id, false, true); // Added isCritical flag for correct propagation
                                  } else {
                                      check_progress(c_id, true);
                                  }
                              });
                          }, function() {
                              check_progress(c_id, false);
                          });
                      })(child_inst.id, child_inst);
                  }
              }

              run_coordinator_step();
          }
      };

      if (final_id) {
          register_instance(final_id, instance);
      }
      setup_observer(element, instance);

      return instance;
  }

  function initialize(element, config) {
      if (!element) return;
      var
        options = resolve_config(element, config),
        is_coordinator = !!options.components,
        is_component = !!options.component;

      if (is_component) {
          var comp_instance = create_component_instance(element, config);
          comp_instance.start(function() {
              if (is_coordinator) {
                  var coord_instance = create_coordinator_instance(element, config);
                  coord_instance.start();
              }
          });
          return comp_instance;
      } else if (is_coordinator) {
          var coord_instance = create_coordinator_instance(element, config);
          coord_instance.start();
          return coord_instance;
      }
  }

  /**
    * Main entry point for module initialization or configuration.
    * @param {Element|Object} element_or_config - DOM element to initialize or global configuration.
    * @param {Object} [config] - Instance-specific configuration.
    * @returns {Object|undefined} Global configuration or created instance.
    */
  _components.fn(function (element_or_config, config) {
    if (is_plain_object(element_or_config)) {
      var _config = configure(element_or_config);
      return { config: function () { return _config; } };
    }

    var _ref = initialize(element_or_config, config);
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
