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
    _sqlite_run_id = 0;

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
              var
                callback = responseData[1],
                resolve = responseData[2],
                reject = responseData[3];

              if (typeof callback === 'function') {
                callback(data);
              }
              else if (resolve) {
                if (data.error){
                  reject(new Error(data.error), data);
                }
                else {
                  resolve(data);
                }
              }

              if (prestartQueue){ _sqlite_frontend_prestart_queue.delete(data.id); }
              else { _sqlite_frontend_queue.delete(data.id); }
            }
            else if(typeof _sqlite_frontend.unhandledResponse === 'function') {
              _sqlite_frontend.unhandledResponse(data);
            }
          }
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
