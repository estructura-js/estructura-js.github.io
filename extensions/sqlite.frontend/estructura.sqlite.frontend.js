/*
Estructura / SQLite Frontend extension
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
    global._sqlite_frontend = factory();
  }
}(this, function () {
  "use strict";

  var
    _sqlite_frontend = _e.instance('sqlite_frontend'),
    _sqlite_frontend_start = false,
    _sqlite_frontend_worker,
    _sqlite_frontend_queue = new Map(),
    _sqlite_frontend_prestart_queue = new Map(),
    _sqlite_frontend_start_error = '',
    _sqlite_run_id = 0;

  // Delivers a response to its callback or promise. The entry is removed first, so a callback that throws
  // does not leave it in the queue; a rejected promise keeps the whole response in error.response.
  function _sqlite_deliver(entry, data) {
    var
      callback = entry[1],
      resolve = entry[2],
      reject = entry[3];

    if (typeof callback === 'function') {
      callback(data);
    }
    else if (resolve) {
      if (data.error){
        var error = new Error(data.error);
        error.response = data;
        reject(error);
      }
      else {
        resolve(data);
      }
    }
  }

  // The Worker or SQLite could not start: every pending and future request receives the error
  function _sqlite_start_failed(message) {
    _sqlite_frontend_start_error = message || 'SQLite could not be started.';
    var pending = [];
    _sqlite_frontend_prestart_queue.forEach(function (entry, id) { pending.push([id, entry]); });
    _sqlite_frontend_queue.forEach(function (entry, id) { pending.push([id, entry]); });
    _sqlite_frontend_prestart_queue.clear();
    _sqlite_frontend_queue.clear();
    for (var i = 0; i < pending.length; i++) {
      try { _sqlite_deliver(pending[i][1], { id: pending[i][0], error: _sqlite_frontend_start_error }); }
      catch (e) { console.error('_sqlite_frontend: callback error:', e); }
    }
  }

  function _sqlite_run(object, data, timeout) {
    var
      queue = (!_sqlite_frontend_start ? _sqlite_frontend_prestart_queue : _sqlite_frontend_queue),
      id = _sqlite_run_id++;

    object.id = id;

    var isCallback = typeof data === 'function';
    var resolvePromise, rejectPromise;
    var promise;

    if (!isCallback) {
      promise = new Promise(function (resolve, reject) {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
    }

    if (_sqlite_frontend_start_error) {
      _sqlite_deliver([object, isCallback ? data : null, resolvePromise, rejectPromise], { id: id, error: _sqlite_frontend_start_error });
      return isCallback ? void(0) : promise;
    }

    queue.set(id, [object, isCallback ? data : null, resolvePromise, rejectPromise]);

    if (typeof timeout === 'number' && timeout > 0) {
      setTimeout(function() {
        if (queue.has(id)) {
          if (!isCallback && rejectPromise) {
            rejectPromise(new Error('SQLite request timeout.'));
          }
          queue.delete(id);
        }
      }, timeout);
    }

    if (_sqlite_frontend_start) {
      _sqlite_frontend_worker.postMessage(object);
    }

    return isCallback ? void(0) : promise;
  }

  if (!_sqlite_frontend_start) {
    try {
      _sqlite_frontend_worker = new Worker('./estructura.sqlite.frontend.wasm.worker.js', { type: 'module' });
      _sqlite_frontend_worker.onmessage = function (e) {
        var data = e.data;
        if (data && typeof data === 'object') {
          if (data.sqlite === true) {
            _sqlite_frontend_start = true;
            // A transient error reported before the Worker became ready no longer applies
            _sqlite_frontend_start_error = '';

            // Executes queued SQL queries prior to initialization
            for (var object of _sqlite_frontend_prestart_queue.values()) {
              _sqlite_frontend_worker.postMessage(object[0]);
            }
          }
          else if (typeof data.id === 'number') {
            var
              prestartQueue = _sqlite_frontend_prestart_queue.get(data.id),
              queue = _sqlite_frontend_queue.get(data.id),
              responseData = queue || prestartQueue;

            if (responseData) {
              if (prestartQueue){ _sqlite_frontend_prestart_queue.delete(data.id); }
              else { _sqlite_frontend_queue.delete(data.id); }

              _sqlite_deliver(responseData, data);
            }
            else if(typeof _sqlite_frontend.unhandledResponse === 'function') {
              _sqlite_frontend.unhandledResponse(data);
            }
          }
          else if (data.error) {
            // Initialization error (a message without "id")
            _sqlite_start_failed(data.error);
          }
        }
      };
      _sqlite_frontend_worker.onerror = function (event) {
        var message = event && event.message ? event.message : '';
        // Before the "ready" message, an error means the Worker (or its modules) could not be loaded
        if (!_sqlite_frontend_start) {
          _sqlite_start_failed('SQLite worker could not be loaded' + (message ? ': ' + message : '.'));
        }
        else {
          console.error('_sqlite_frontend: worker error:', message || event);
        }
      };
    }
    catch (e) {
      throw e;
    }
  }

  function _sqlite_str_command(cmd){
    return function (args, data, timeout) {
      if (args[0]) {
        var command_object = Object.create(null);
        command_object[cmd] = args[0];
        return _sqlite_run(command_object, data, timeout);
      }
    }
  }

  function _sqlite_obj_command(cmd){
    return function (args, data, timeout) {
      var command_object = Object.create(null);
      command_object[cmd] = args[0];
      return _sqlite_run(command_object, data, timeout);
    }
  }

  _sqlite_frontend.fn({
    String: {
      sql: _sqlite_str_command('sql'),
      db: _sqlite_str_command('db'),
      table: _sqlite_str_command('table'),
      save: _sqlite_str_command('save'),
      close: _sqlite_str_command('close')
    },
    Object: {
      column: _sqlite_obj_command('column'),
      row: _sqlite_obj_command('row'),
      get: _sqlite_obj_command('get'),
      set: _sqlite_obj_command('set'),
      del: _sqlite_obj_command('del'),
      open: _sqlite_obj_command('open')
    }
  });

  return _sqlite_frontend;
}));
