"use strict";

var _http = {
    /**
     * HTTP request engine with granular control and parallel compatibility.
     * @param {Object} options - Request configuration.
     */
    request: function(options) {
        var xhr = new XMLHttpRequest();
        var method = options.method || 'GET';
        var url = options.url;
        var timeout = options.timeout || 0;
        var headers = options.headers || {};
        var data = options.data !== undefined ? options.data : null;

        // Observability check: Warning when mixing callbacks
        if (options.onReadyStateChange && (options.onSuccess || options.onError || options.onHeadersReceived)) {
            console.warn('_http: "onReadyStateChange" has been defined in conjunction with granular response callbacks ("onSuccess", "onError", or "onHeadersReceived"). Ensure that conflicting executions do not occur.');
        }

        xhr.open(method, url, true);

        if (timeout) {
            xhr.timeout = timeout;
            xhr.ontimeout = function() {
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

        xhr.onabort = function() {
            if (options.onAbort) {
                options.onAbort(xhr);
            }
        };

        xhr.onreadystatechange = function() {
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
            xhr.onprogress = function(event) {
                if (event.lengthComputable) {
                    options.onProgress(event.loaded, event.total, (event.loaded / event.total) * 100);
                }
            };
        }

        if (xhr.upload && options.onUploadProgress) {
            xhr.upload.onprogress = function(event) {
                if (event.lengthComputable) {
                    options.onUploadProgress(event.loaded, event.total, (event.loaded / event.total) * 100);
                }
            };
        }

        xhr.onerror = function() {
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
            abort: function() {
                xhr.abort();
            },
            getXHR: function() {
                return xhr;
            }
        };
    }
};