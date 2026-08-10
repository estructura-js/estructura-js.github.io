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
      data = options.data !== undefined ? options.data : null;

    // Observability check: Warning when mixing callbacks
    if (options.onReadyStateChange && (options.onSuccess || options.onError || options.onHeadersReceived)) {
      console.warn('_http: "onReadyStateChange" has been defined in conjunction with granular response callbacks ("onSuccess", "onError", or "onHeadersReceived"). Ensure that conflicting executions do not occur.');
    }

    xhr.open(method, url, true);

    if (timeout) {
      xhr.timeout = timeout;
      xhr.ontimeout = function () {
        if (options.onTimeout) {
          options.onTimeout(xhr);
        } else if (options.onError) {
          options.onError(new Error('Request timed out (' + timeout + 'ms): ' + url), xhr);
        }
      };
    }

    if (options.withCredentials) {
      xhr.withCredentials = true;
    }

    xhr.onabort = function () {
      if (options.onAbort) {
        options.onAbort(xhr);
      }
    };

    xhr.onreadystatechange = function () {
      if (options.onReadyStateChange) {
        options.onReadyStateChange(xhr.readyState, xhr.status, xhr);
      }

      if (xhr.readyState === 2) { // HEADERS_RECEIVED
        if (options.onHeadersReceived) {
          options.onHeadersReceived(xhr.getAllResponseHeaders(), xhr);
        }
      } else if (xhr.readyState === 4) { // DONE
        if (xhr.status >= 200 && xhr.status < 300) {
          if (options.onSuccess) {
            options.onSuccess(xhr.responseText, xhr);
          }
        } else if (xhr.status > 0) {
          if (options.onError) {
            options.onError(new Error('HTTP request failed with status ' + xhr.status + ' at ' + url), xhr);
          }
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
      if (options.onError) {
        options.onError(new Error('Critical network failure: ' + url), xhr);
      }
    };

    for (var key in headers) {
      if (headers.hasOwnProperty(key)) {
        xhr.setRequestHeader(key, headers[key]);
      }
    }

    xhr.send(data);

    return {
      abort: function () {
        xhr.abort();
      },
      getXHR: function () {
        return xhr;
      }
    };
  });

  return _http;
}));
