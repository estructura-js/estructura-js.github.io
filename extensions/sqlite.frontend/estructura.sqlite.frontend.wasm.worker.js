import sqlite3InitModule from './_dependencies/_sqlite/index.mjs';

const dbs = {};
const _supported_queries = ['SELECT', 'UPDATE', 'DELETE'];
const _auto_id_varName = '_auto_id';
const _auto_id_limit = 99999999999;
const _columns_separator = /\s*\,+\s*/;
const allColumnsSupportedQueries = ['SELECT'];
const columnsTransformSupportedQueries = ['UPDATE'];
const countSupportedQueries = ['SELECT'];
const limitSupportedQueries = ['SELECT'];
const whereSupportedQueries = ['SELECT', 'UPDATE', 'DELETE'];

let startError = '';
let sqlite;

sqlite3InitModule()
.then(function (sqlite3) {
  sqlite = sqlite3;
  postMessage({ sqlite: true });
})
.catch(function (error) {
  startError = error.message;
  postMessage({ error: startError });
});

self.onmessage = function(e){
  const data = e.data;
  const id = data.id;

  if (startError) {
    return postMessage({ error: startError, id: id });
  }

  if (typeof sqlite === 'undefined') {
    return postMessage({ error: 'SQLite not initialized yet.', id: id });
  }

  const response = Object.create(null);
  let db;

  sqlite_execution: {
    try {
      data.db = cleanName(data.db, 'db');
      if (data.db) {
        response.db = Object.create(null);
        try {
          if (!dbs[data.db]){
            try {
              db = new sqlite.oo1.OpfsDb(data.db);
              response.opfs = true;
            }
            catch (e) {
              db = new sqlite.oo1.DB(data.db);
              response.opfs = false;
            }

            dbs[data.db] = { db: db, tables: {} };
          }
          else {
            db = dbs[data.db].db;
            try {
              response.opfs = db instanceof sqlite.oo1.OpfsDb;
            }
            catch (e) {
              response.opfs = false;
            }
          }

          response.db.name = data.db;
        }
      catch (e) {
          response.db.error = e.message;
          throw e;
        }
      }

      if (data.save) {
        response.save = Object.create(null);
        try {
          const saveDbName = cleanName(data.save, 'db');
          const targetDb = dbs[saveDbName] ? dbs[saveDbName].db : db;

          if (!targetDb) {
            throw new Error('DB "' + saveDbName + '" not found.');
          }

          response.save.data = sqlite.capi.sqlite3_js_db_export(targetDb);
          response.save.data = new Blob([response.save.data], { type: 'application/x-sqlite3' })
          response.save.name = saveDbName;
        }
        catch (e) {
          response.save.error = e.message;
          throw e;
        }
        break sqlite_execution;
      }

      if (data.sql) {
        response.sql = Object.create(null);
        try {
          response.sql.result = db.exec({ sql: data.sql, returnValue: 'resultRows', rowMode: 'object' });
        }
        catch (e) {
          response.sql.error = e.message;
          throw e;
        }
        break sqlite_execution;
      }

      data.table = cleanName(data.table, 'table');
      if (data.table) {
        response.table = Object.create(null);
        try {
          if (!dbs[data.db].tables[data.table]) {
            db.exec('CREATE TABLE IF NOT EXISTS "' + data.table + '" (' + _auto_id_varName + ' INTEGER PRIMARY KEY AUTOINCREMENT)');
            dbs[data.db].tables[data.table] = { columns: {} };
          }
          response.table.name = data.table;
        }
        catch (e) {
          response.table.error = e.message;
          throw e;
        }
      }

      if (typeof data.column !== 'undefined') {
        data.column = data.column && typeof data.column === 'object' ? data.column : { name: data.column };
        data.column.name = cleanName(data.column.name, 'columnName');
        data.column.type = cleanName(data.column.type, 'columnType');
        response.column = Object.create(null);
        try {
          if (!dbs[data.db].tables[data.table].columns[data.column.name]){
            try {
              db.exec('ALTER TABLE "' + data.table + '" ADD COLUMN "' + data.column.name + '" ' + data.column.type);
            }
            catch (e) {
              if (!e.message.includes('duplicate column name')) {
                throw e;
              }
            }
            dbs[data.db].tables[data.table].columns[data.column.name] = { type: data.column.type };
          }
          response.column.name = data.column.name;
          response.column.type = data.column.type;
        }
        catch (e) {
          response.column.error = e.message;
          throw e;
        }
      }

      if (typeof data.row !== 'undefined') {
        data.row = data.row && typeof data.row === 'object' ? data.row : {};
        const keys = Object.keys(data.row);
        if (keys.length) {
          response.row = Object.create(null);
          try {
            const cleanKeys = keys.map(key => cleanName(key, 'columnName'));
            const values = keys.map(key => data.row[key]);
            const columns = cleanKeys.map(key => '"' + key + '"').join(', ');
            const placeholders = cleanKeys.map(() => '?').join(', ');
            const sql = 'INSERT INTO "' + data.table + '" (' + columns + ') VALUES (' + placeholders + ')';

            db.exec({
              sql: sql,
              bind: values
            });

            response.row.id = db.selectValue('SELECT last_insert_rowid()');
          }
          catch (e) {
            response.row.error = e.message;
            throw e;
          }
        }
      }

      if (typeof data.get !== 'undefined') {
        data.get = data.get && typeof data.get === 'object' ? data.get : {};
        response.get = Object.create(null);

        sqlQueryBuilder(data.get, response.get, {
          query: function (columns) { return ['SELECT', columns, 'FROM', '"' + data.table + '"']; },
          byAutoId: db.selectObjects.bind(db),
          byCount: db.selectValue.bind(db),
          byLimit: db.selectObjects.bind(db),
          byTruthyEnding: db.selectObjects.bind(db)
        });
      }

      if (typeof data.set !== 'undefined') {
        data.set = data.set && typeof data.set === 'object' ? data.set : {};
        response.set = Object.create(null);

        sqlQueryBuilder(data.set, response.set, {
          query: function (columns) { return ['UPDATE', '"' + data.table + '"', 'SET', columns]; },
          columnTransform: function (column, columnValue, sqlValues) {
            sqlValues.push(columnValue);
            return column + ' = ?';
          },
          byAutoId: sqlQueryRun(db),
          byLimit: sqlQueryRun(db),
          byTruthyEnding: sqlQueryRun(db),
          byGlobalUpdate: sqlQueryRun(db)
        });
      }

      if (typeof data.del !== 'undefined') {
        data.del = data.del && typeof data.del === 'object' ? data.del : {};
        response.del = Object.create(null);

        sqlQueryBuilder(data.del, response.del, {
          query: function (columns) { return ['DELETE', 'FROM', '"' + data.table + '"']; },
          byAutoId: sqlQueryRun(db),
          byLimit: sqlQueryRun(db),
          byTruthyEnding: sqlQueryRun(db),
          byGlobalUpdate: sqlQueryRun(db)
        });
      }
    }
    catch (e)  {
      response.error = e.message;
    }
  }

  response.done = Date.now();
  response.id = id;
  postMessage(response);
};

function cleanName(str, type, _default){
  str = typeof str === 'string' ? str : '';
  switch (type) {
    case 'db': return str.replace(/[^a-zA-Z0-9_\.]/g, '') || (typeof _default !== 'undefined' ? _default : '_default_db');
    case 'table': return str.replace(/[^a-zA-Z0-9_]/g, '') || (typeof _default !== 'undefined' ? _default : '_default_table');
    case 'columnName': return str.replace(/[^a-zA-Z0-9_]/g, '') || (typeof _default !== 'undefined' ? _default : '_default_column');
    case 'columnType': return str.toUpperCase().replace(/[^A-Z\(\)\,0-9]/g, '') || (typeof _default !== 'undefined' ? _default : 'TEXT');
  }
  return str.replace(/[^a-zA-Z0-9]/g, '');
}

function sqlQueryRun (db) {
  return function (query, values) {
    db.exec({ sql: query, bind: values });
    return db.changes();
  };
}

function sqlQueryBuilder(data, response, callbacks){
  var keys = Object.keys(data);
  if (keys.length) {
    try {
      const _sqlMainQuery = callbacks.query('');
      const sqlMainQuery = _sqlMainQuery[0].trim();

      if (!Array.isArray(_sqlMainQuery) || typeof sqlMainQuery !== 'string' || !_supported_queries.includes(sqlMainQuery)) {
        throw new Error('Unsupported query (' + (sqlMainQuery || '[empty]') + ')');
      }

      for (var h = 0; h < keys.length; h++) {
        var columns = keys[h];
        if (!columns || typeof columns !== 'string') {
          continue;
        }

        var columnsValue = data[columns];
        response[columns] = Object.create(null);

        const sqlValues = [];
        const allColumns = '*';
        const allColumnsDetected = columns.trim() === allColumns;
        const allColumnsUnsupported = allColumnsDetected && !allColumnsSupportedQueries.includes(sqlMainQuery);

        if (allColumnsUnsupported) {
          response[columns].error = 'Unsupported columns (' + allColumns + ') for ' + sqlMainQuery;
          continue;
        }

        var transformedColumns = '';
        var untransformedColumns = '';
        var cleanColumns = [allColumns];

        if (!allColumnsDetected){
          cleanColumns = columns.trim();
          cleanColumns = cleanColumns.split(_columns_separator);
          cleanColumns = cleanColumns
            .map(column => cleanName(column, 'columnName', false))
            .filter(Boolean)
            .map(column => '"' + column + '"');

          untransformedColumns = cleanColumns.join(', ');
          const columnsTransformDetected = columnsTransformSupportedQueries.includes(sqlMainQuery);

          if (columnsTransformDetected) {
            let specificColumnsValue = columnsValue && typeof columnsValue === 'object';
            columnsValue = {
              set: specificColumnsValue ? columnsValue.set : columnsValue,
              query: specificColumnsValue ? columnsValue.query : undefined
            };

            cleanColumns = cleanColumns.map(function (column) {
              let transformValue = callbacks.columnTransform(column, columnsValue.set, sqlValues);
              return typeof transformValue === 'string' ? transformValue : '';
            });

            if (typeof columnsValue.query === 'undefined') {
              transformedColumns = cleanColumns.join(', ');
              response[columns].columns = untransformedColumns;
              response[columns].result = callbacks.byGlobalUpdate(callbacks.query(transformedColumns).join(' '), sqlValues);
              continue;
            }
            else {
              // To reuse WHERE next
              delete columnsValue.set;
              if (!columnsValue.query || typeof columnsValue.query !== 'object') {
                columnsValue = columnsValue.query;
              }
            }
          }

          if(!cleanColumns.length || !cleanColumns.join('').trim().length){
            response[columns].error = 'Columns (' + columns + ') results in an empty string.';
            continue;
          }
        }

        transformedColumns = transformedColumns || cleanColumns.join(', ');
        response[columns].columns = untransformedColumns || transformedColumns;

        try {
          let sqlQuery = callbacks.query(transformedColumns);

          if (!columnsValue) {
            columnsValue = false;
          }

          switch (typeof columnsValue) {
            case 'string':
              columnsValue = Number(columnsValue);
              // Intentional fallthrough

            case 'number':
              if (isNaN(columnsValue) || columnsValue < 1 || columnsValue > _auto_id_limit){
                response[columns].error = 'Wrong ID (' + columnsValue + ').';
                continue;
              }
              sqlValues.push(columnsValue);
              sqlQuery = sqlQuery.concat(['WHERE', '"' + _auto_id_varName + '"', '=', '?']);
              response[columns].result = callbacks.byAutoId(sqlQuery.join(' '), sqlValues);
            break;

            case 'object':
              let byTruthyEnding = false;
              const criteriaKeys = Object.keys(columnsValue);
              if (criteriaKeys.length) {
                const count = columnsValue.count === true;
                const countSupported = count && countSupportedQueries.includes(sqlMainQuery);
                const countUnsupported = count && !countSupportedQueries.includes(sqlMainQuery);

                if (countUnsupported) {
                  response[columns].error = 'COUNT unsupported in this query.';
                  break;
                }

                if (countSupported) {
                  sqlQuery[1] = 'COUNT(' + (columnsValue.distinct === true ? 'DISTINCT ' : '') + sqlQuery[1] + ')';
                }

                let where = columnsValue.where;
                const whereSupported = where && whereSupportedQueries.includes(sqlMainQuery);
                const whereUnsupported = where && !whereSupportedQueries.includes(sqlMainQuery);

                if (whereUnsupported) {
                  response[columns].error = 'WHERE unsupported in this query.';
                  break;
                }

                if (whereSupported) {
                  switch (typeof where) {
                    case 'string':
                      where = where.trim().replace(/\s+/g, ' ');
                      if (where) {
                        sqlQuery.push('WHERE');
                        sqlQuery.push(where);
                      }
                      else {
                        where = false;
                      }
                    break;
                    case 'object':
                      const whereKeys = Object.keys(where);
                      if (!whereKeys.length){
                        where = false;
                      }
                      else {
                        const privateLogicalAgrupations = ['AND', 'OR', 'NOT'];

                        for (var i = 0, ic = 0; i < whereKeys.length; i++) {
                          let whereKey = cleanName(whereKeys[i], 'columnName', '').trim();
                          let whereKeyValue = where[whereKeys[i]];
                          if (whereKey && !privateLogicalAgrupations.includes(whereKey.toUpperCase())) {
                            switch (typeof whereKeyValue) {
                              case 'number':
                              case 'boolean':
                              case 'string':
                                sqlQuery.push(ic ? 'AND' : 'WHERE');
                                sqlQuery.push('"' + whereKey + '"');
                                ic++;

                                sqlQuery.push('=');
                                sqlQuery.push('?');
                                sqlValues.push(whereKeyValue);
                              break;
                              case 'undefined':
                              case 'object':
                                if (!whereKeyValue) {
                                  sqlQuery.push(ic ? 'AND' : 'WHERE');
                                  sqlQuery.push('"' + whereKey + '"');
                                  ic++;

                                  sqlQuery.push('IS NULL');
                                  break;
                                }

                                const privateComparingExpressions = [
                                  '=', '==', '!=', '<>', '>', '<', '<=', '>=',
                                  'IS', 'IS NOT', 'IS DISTINCT FROM', 'IS NOT DISTINCT FROM',
                                  'BETWEEN', 'NOT BETWEEN', 'IN', 'NOT IN',
                                  'LIKE', 'NOT LIKE', 'GLOB', 'NOT GLOB',
                                  '&', '|', '<<', '>>', '~',
                                  'EXISTS', 'NOT EXISTS', '||',
                                  'NOT', 'AND', 'OR'
                                ];

                                const currentKeys = Object.keys(whereKeyValue);
                                if (!currentKeys.length) { break; }

                                for (var j = 0, jc = 0; j < currentKeys.length; j++) {
                                  let currentKey = currentKeys[j].trim();
                                  let currentKeyValue = whereKeyValue[currentKeys[j]];
                                  if (!currentKey || !privateComparingExpressions.includes(currentKey.toUpperCase())) {
                                    continue;
                                  }

                                  if (!jc) {
                                    sqlQuery.push(ic ? 'AND' : 'WHERE');
                                  }
                                  else {
                                    sqlQuery.push('AND');
                                  }

                                  sqlQuery.push('"' + whereKey + '"');
                                  jc++;
                                  ic++;

                                  switch (currentKey) {
                                    case 'IS':
                                    case 'IS NOT':
                                      sqlQuery.push(currentKey);
                                      if (typeof currentKeyValue === 'undefined' || currentKeyValue === null) {
                                        sqlQuery.push('NULL');
                                      }
                                      else {
                                        sqlQuery.push('?');
                                        sqlValues.push(currentKeyValue);
                                      }
                                    break;
                                    case 'IN':
                                    case 'NOT IN':
                                      sqlQuery.push(currentKey);
                                      sqlQuery.push('(');
                                      if (Array.isArray(currentKeyValue) && currentKeyValue.length){
                                        for (var k = 0; k < currentKeyValue.length; k++) {
                                          if (k) { sqlQuery.push(','); }
                                          sqlQuery.push('?');
                                          sqlValues.push(currentKeyValue[k]);
                                        }
                                      }
                                      else if(typeof currentKeyValue !== 'undefined' && currentKeyValue !== null) {
                                        sqlQuery.push('?');
                                        sqlValues.push(currentKeyValue);
                                      }
                                      sqlQuery.push(')');
                                    break;
                                    case 'NOT':
                                    case 'AND':
                                    case 'OR':
                                    case 'EXISTS':
                                    case 'NOT EXISTS':
                                      sqlQuery.push(currentKey);
                                      sqlQuery.push('(');
                                      if (typeof currentKeyValue === 'string') {
                                        sqlQuery.push(currentKeyValue);
                                      }
                                      sqlQuery.push(')');
                                    break;
                                    default:
                                      sqlQuery.push(currentKey);
                                      sqlQuery.push('?');
                                      sqlValues.push(currentKeyValue);
                                  }
                                }
                              break;
                            }
                          }
                        }
                      }
                    break;
                    default:
                      where = false;
                  }
                }

                if (countSupported) {
                  response[columns].result = callbacks.byCount(sqlQuery.join(' '), sqlValues);
                  break;
                }

                const limit = typeof columnsValue.limit !== 'undefined';
                const limitSupported = limit && limitSupportedQueries.includes(sqlMainQuery);
                const limitUnsupported = limit && !limitSupportedQueries.includes(sqlMainQuery);

                if (limitUnsupported) {
                  response[columns].error = 'LIMIT unsupported in this query.';
                  break;
                }

                if (limitSupported) {
                  sqlQuery.push('LIMIT');
                  sqlQuery.push(Number(columnsValue.limit));

                  response[columns].result = callbacks.byLimit(sqlQuery.join(' '), sqlValues);
                  break;
                }

                byTruthyEnding = true;
              }

            if (!byTruthyEnding) {
              break;
            }

            default:
              if (columnsValue) {
                response[columns].result = callbacks.byTruthyEnding(sqlQuery.join(' '), sqlValues);
                break;
              }

              response[columns].result = [];
            break;
          }
        }
        catch (e) {
          response[columns].error = e.message;
        }
      }
    }
    catch (e) {
      response.error = e.message;
      throw e;
    }
  }
}
