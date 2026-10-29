/*
Estructura / HTTP extension
Copyright (C) 2026 OKZGN

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please visit one of the following:
- https://okzgn.com/#contact
- https://okzgn.github.io/#contact
*/

(function (global, factory) {
  'use strict';
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  }
  else if (typeof define === 'function' && define.amd) {
    define(factory);
  }
  else {
    global._http = factory();
  }
}(this, function () {
  "use strict";

  var _http = _e.instance('http');

  // Works with prototype-less header maps (Object.create(null))
  var has_own_prop = Object.prototype.hasOwnProperty;

  // Request bodies that are serialized as JSON: plain objects and arrays only.
  function is_json_body(value) {
    var tag;
    if (!value || typeof value !== 'object' || typeof JSON === 'undefined') {
      return false;
    }
    tag = Object.prototype.toString.call(value);
    if (tag !== '[object Object]' && tag !== '[object Array]') {
      return false;
    }
    if ((typeof FormData === 'function' && value instanceof FormData) ||
      (typeof Blob === 'function' && value instanceof Blob) ||
      (typeof ArrayBuffer === 'function' && (value instanceof ArrayBuffer || (ArrayBuffer.isView && ArrayBuffer.isView(value)))) ||
      (typeof URLSearchParams === 'function' && value instanceof URLSearchParams) ||
      (typeof Document === 'function' && value instanceof Document)) {
      return false;
    }
    return true;
  }

  function has_header(headers, name) {
    for (var key in headers) {
      if (has_own_prop.call(headers, key) && String(key).toLowerCase() === name) {
        return true;
      }
    }
    return false;
  }

  function is_json_content_type(content_type) {
    return /(^|\/|\+)json\s*(;|$)/i.test(content_type || '');
  }

  function parse_json(text) {
    if (typeof JSON === 'undefined') {
      throw new Error('JSON is not available');
    }
    return text === '' ? null : JSON.parse(text);
  }

  function parse_headers(raw) {
    var result = {}, lines = (raw || '').split(/\r?\n/), index, name, value;
    for (var i = 0; i < lines.length; i++) {
      index = lines[i].indexOf(':');
      if (index < 1) {
        continue;
      }
      name = lines[i].slice(0, index).replace(/^\s+|\s+$/g, '').toLowerCase();
      value = lines[i].slice(index + 1).replace(/^\s+|\s+$/g, '');
      result[name] = result.hasOwnProperty(name) ? result[name] + ', ' + value : value;
    }
    return result;
  }

  _http.fn(function (options) {
    if (!options || typeof options !== 'object') {
      throw new Error('Options is not an Object.');
    }

    if (typeof options.url !== 'string') {
      throw new Error('Options.url is not an String.');
    }

    if (options.url.length < 1) {
      throw new Error('Options.url is an empty String.');
    }

    var
      xhr = new XMLHttpRequest(),
      method = options.method || 'GET',
      url = options.url,
      timeout = options.timeout || 0,
      headers = options.headers || {},
      data = options.data !== undefined ? options.data : null,
      // GET/HEAD send no body: no JSON serialization nor Content-Type (which would force a CORS preflight)
      json_body = !/^(GET|HEAD)$/i.test(method) && is_json_body(data),
      // Single final outcome: success | error | timeout | abort.
      settled = false,
      failure = null,
      parsed,
      has_parsed = false,
      // Lazy Promise: created only when then/catch/finally is used.
      promise = null,
      promise_resolve,
      promise_reject;

    // Observability check: Warning when mixing callbacks
    if (options.onReadyStateChange && (options.onSuccess || options.onError || options.onHeadersReceived)) {
      console.warn('_http: "onReadyStateChange" has been defined in conjunction with granular response callbacks ("onSuccess", "onError", or "onHeadersReceived"). Ensure that conflicting executions do not occur.');
    }

    function fail(type, message) {
      var error = new Error(message);
      error.type = type;
      // Some old engines (IE9) throw when reading "status" after abort()
      try { error.status = xhr.status; } catch (e) { error.status = 0; }
      error.xhr = xhr;
      return error;
    }

    // Raw response data captured when the request succeeds, so a later abort() or reuse of the
    // XHR does not change what then/await receive.
    var snapshot = null;

    function take_snapshot() {
      snapshot = {
        text: xhr.responseText,
        status: xhr.status,
        content_type: xhr.getResponseHeader('Content-Type'),
        raw_headers: xhr.getAllResponseHeaders()
      };
    }

    function response() {
      var text = snapshot.text, result = text;
      if (has_parsed) {
        result = parsed;
      } else if (is_json_content_type(snapshot.content_type)) {
        try { result = parse_json(text); } catch (e) { result = text; }
      }
      return { data: result, text: text, status: snapshot.status, headers: parse_headers(snapshot.raw_headers), xhr: xhr };
    }

    function settle_promise() {
      if (failure) {
        promise_reject(failure);
      } else {
        promise_resolve(response());
      }
    }

    // Returns false when an outcome was already delivered.
    function settle(error) {
      if (settled) {
        return false;
      }
      settled = true;
      failure = error;
      if (!error) {
        take_snapshot();
      }
      if (promise) {
        settle_promise();
      }
      return true;
    }

    function get_promise() {
      if (!promise) {
        promise = new Promise(function (resolve, reject) {
          promise_resolve = resolve;
          promise_reject = reject;
        });
        if (settled) {
          settle_promise();
        }
      }
      return promise;
    }

    if (json_body) {
      data = JSON.stringify(data);
    }

    xhr.open(method, url, true);

    if (timeout) {
      xhr.timeout = timeout;
    }

    xhr.ontimeout = function () {
      var error = fail('timeout', 'Request timed out (' + (xhr.timeout || timeout) + 'ms): ' + url);
      if (!settle(error)) {
        return;
      }
      if (options.onTimeout) {
        options.onTimeout(xhr);
      } else if (options.onError) {
        options.onError(error, xhr);
      }
    };

    if (options.withCredentials) {
      xhr.withCredentials = true;
    }

    function on_abort() {
      if (settle(fail('abort', 'Request aborted: ' + url)) && options.onAbort) {
        options.onAbort(xhr);
      }
    }

    xhr.onabort = on_abort;

    xhr.onreadystatechange = function () {
      var body, error;

      if (options.onReadyStateChange) {
        options.onReadyStateChange(xhr.readyState, xhr.status, xhr);
      }

      if (xhr.readyState === 2) { // HEADERS_RECEIVED
        if (options.onHeadersReceived) {
          options.onHeadersReceived(xhr.getAllResponseHeaders(), xhr);
        }
      } else if (xhr.readyState === 4 && !settled) { // DONE
        if (xhr.status >= 200 && xhr.status < 300) {
          body = xhr.responseText;
          if (options.responseType === 'json') {
            try {
              parsed = parse_json(body);
              has_parsed = true;
            } catch (e) {
              error = fail('parse', 'Response JSON parse failed (' + e.message + '): ' + url);
              if (settle(error) && options.onError) {
                options.onError(error, xhr);
              }
              return;
            }
            body = parsed;
          }
          if (settle(null) && options.onSuccess) {
            options.onSuccess(body, xhr);
          }
        } else if (xhr.status > 0) {
          error = fail('http', 'HTTP request failed with status ' + xhr.status + ' at ' + url);
          if (settle(error) && options.onError) {
            options.onError(error, xhr);
          }
        } else {
          // Status 0: error/timeout/abort events arrive after readystatechange; let them settle first.
          setTimeout(function () {
            var error = fail('network', 'Request failed with status 0 (network/CORS/blocked): ' + url);
            if (settle(error) && options.onError) {
              options.onError(error, xhr);
            }
          }, 0);
        }
      }
    };

    if (options.onProgress) {
      xhr.onprogress = function (event) {
        if (event.lengthComputable) {
          options.onProgress(event.loaded, event.total, (event.loaded / event.total) * 100);
        }
      };
    }

    if (xhr.upload && options.onUploadProgress) {
      xhr.upload.onprogress = function (event) {
        if (event.lengthComputable) {
          options.onUploadProgress(event.loaded, event.total, (event.loaded / event.total) * 100);
        }
      };
    }

    xhr.onerror = function () {
      var error = fail('network', 'Critical network failure: ' + url);
      if (settle(error) && options.onError) {
        options.onError(error, xhr);
      }
    };

    for (var key in headers) {
      if (has_own_prop.call(headers, key)) {
        xhr.setRequestHeader(key, headers[key]);
      }
    }

    if (json_body && !has_header(headers, 'content-type')) {
      xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    }

    xhr.send(data);

    var control = {
      abort: function () {
        xhr.abort();
        // Fallback for agents that do not dispatch "abort" synchronously.
        if (!settled) {
          on_abort();
        }
      },
      getXHR: function () {
        return xhr;
      }
    };

    // The core prepends the dispatcher arguments array to every returned method.
    if (typeof Promise === 'function') {
      control.then = function (_dispatch_args, on_fulfilled, on_rejected) {
        return get_promise().then(on_fulfilled, on_rejected);
      };
      control['catch'] = function (_dispatch_args, on_rejected) {
        return get_promise().then(null, on_rejected);
      };
      control['finally'] = function (_dispatch_args, fn) {
        var current = get_promise();
        if (typeof current['finally'] === 'function') {
          return current['finally'](fn);
        }
        if (typeof fn !== 'function') {
          return current.then(fn, fn);
        }
        return current.then(function (value) {
          return Promise.resolve(fn()).then(function () { return value; });
        }, function (reason) {
          return Promise.resolve(fn()).then(function () { throw reason; });
        });
      };
    }

    return control;
  });

  return _http;
}));
