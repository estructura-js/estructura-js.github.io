/*
Estructura / DOM extension
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
	if(typeof exports === 'object' && typeof module !== 'undefined'){
		module.exports = factory();
	}
	else if(typeof define === 'function' && define.amd){
		define(factory);
	}
	else {
		global._dom = factory();
	}
}(this, function () {
    'use strict';

    var _dom = _e.instance('dom');
    _dom.subtype('browser-dom');

    // The core "browser-dom" map lists element constructors by name; any other element
    // (<time>, <data>, SVG children such as <path>, custom elements...) is also treated as a "Node".
    _dom.subtype({
        'Object': function (input) {
            return input && input.nodeType === 1 && typeof input.tagName === 'string' ? 'Node' : false;
        }
    });

    _dom.subtype({
        'String': {
            'DOMQuery': function (input) {
                return input.length > 1 && input[0] === '>';
            }
        }
    });

    _dom.fn({
        'DOMQuery': {
            each: function (DOMQuery, fn) {
                _fn_each.call(this, DOMQuery, fn);
                return this;
            },
            get: function (DOMQuery, property) {
                return _fn_get.call(this, DOMQuery, property);
            },
            set: _domquery_node_nodes_set_factory('DOMQuery'),
            style: _domquery_node_nodes_set_factory('DOMQuery', 'style'),
            data: _domquery_node_nodes_set_factory('DOMQuery', 'dataset')
        },

        'Node': {
            each: function (Node, fn) {
                _fn_each.call(this, null, fn, [Node[0]]);
                return this;
            },
            get: function (Node, property) {
                return _fn_get.call(this, null, property, [Node[0]]);
            },
            set: _domquery_node_nodes_set_factory('Node'),
            style: _domquery_node_nodes_set_factory('Node', 'style'),
            data: _domquery_node_nodes_set_factory('Node', 'dataset')
        },

        'Nodes': {
            each: function (Nodes, fn) {
                _fn_each.call(this, null, fn, Nodes[0]);
                return this;
            },
            get: function (Nodes, property) {
                return _fn_get.call(this, null, property, Nodes[0]);
            },
            set: _domquery_node_nodes_set_factory('Nodes'),
            style: _domquery_node_nodes_set_factory('Nodes', 'style'),
            data: _domquery_node_nodes_set_factory('Nodes', 'dataset')
        }
    });

    function _domquery_node_nodes_set_factory(type, property_prefix) {
        var is_domquery = type === 'DOMQuery';
        return function (reference, property) {
            var have_value = typeof arguments[2] !== 'undefined';
            var args = [
                (!is_domquery ? null : reference),
                (!property_prefix ? '' : property_prefix + '.') + property,
                (is_domquery ? null : (type === 'Node' ? [reference[0]] : reference[0]))
            ];
            if(!have_value){ return _fn_get.apply(this, args); }
            args.push(arguments[2]);
            _fn_set.apply(this, args);
            return this;
        }
    }

    function _fn_set(DOMQuery, property, array, value) {
        _fn_set_get_wrapper(DOMQuery, property, array, function (element, clean_property) {
            _access_sub_object(element, clean_property, value, true);
        });
    }

    function _property_function(property) {
        property = property.split('.');
        if(!property[0]){ return; }
        if(_property_transform[property[0]]){ property = _property_transform[property[0]](property); }
        return {
            keys: property,
            get_fn: _get_functions[property[0]],
            set_fn: _set_functions[property[0]]
        }
    };

    var _property_transform = {
        style: _camel_case_one_level_properties('style'),
        dataset: _camel_case_one_level_properties('dataset')
    };

    var _get_functions = {
        style: function (property, value, previousValue, object) {
            if(this.nodeType === 1 && previousValue === ''){
                return window.getComputedStyle(this)[property];
            }
            return previousValue;
        },
    };

    var _set_functions = {
    };

    function _to_camel_case(property) {
        return property.replace(/-([a-z])/g, function (found, first_letter) { return first_letter.toUpperCase(); });
    }

    function _clean_dataset(property) {
        return property.replace(/^data\-/, '').replace(/\-+/g, '-').replace(/^\-+|\-+$/g, '');
    }

    function _clean_property(property) {
        if(typeof property !== 'string'){ return; }
        return property.replace(/\s+/g, '').replace(/^\.+|\.+$/g, '');
    }

    function _camel_case_one_level_properties(name) {
        return function (property_parts) {
            if(property_parts.length > 2){
                var error = new Error('"' + property_parts.slice(1).join('.') + '"');
                error.name = 'unknown "' + name + '" property';
                throw error;
            }

            if(property_parts.length < 2){
                var error = new Error('a property name is required (e.g. "' + name + '.color")');
                error.name = '"' + name + '" property';
                throw error;
            }

            var original_property = property_parts[1];
            property_parts[1] = _clean_dataset(property_parts[1]);
            if(!property_parts[1]){
                var error = new Error('resulting an empty string');
                error.name = '"' + original_property + '" property';
                throw error;
            }

            property_parts[1] = _to_camel_case(property_parts[1]);
            return property_parts;
        }
    }

    function _fn_get(DOMQuery, property, array) {
        var results = [];
        _fn_set_get_wrapper(DOMQuery, property, array, function (element, clean_property) {
            results.push(_access_sub_object(element, clean_property, null, false));
        });
        return results;
    }

    function _fn_set_get_wrapper(DOMQuery, property, array, callback) {
        var original_property = property;
        if(!(property = _clean_property(property))){
            var error = new Error('resulting an empty string');
            error.name = '"' + original_property + '" property';
            throw error;
        }

        property = _property_function(property);
        if(!property || typeof property !== 'object' || !_e.type(property.keys)['Array']){
            var error = new Error('returns "' + _e.type(property).join(', ') + '" without array keys');
            error.name = 'can\'t access to object properties';
            throw error;
        }

        try {
            var found = array || document.querySelectorAll(DOMQuery[0].slice(1)), item = 0;
            while(item < found.length){ callback(found[item++], property); }
        }
        catch(e){
            var error = new Error(e.message);
            error.name = '"' + property.keys.join('.') + '"';
            error.message = error.message.replace(/querySelectorAll/g, 'DOMQuery');
            throw error;
        }
    }

    function _access_sub_object(object, property, value, is_set) {
        var current = object;
        var keys = property.keys;
        var set_fn = property.set_fn;
        var get_fn = property.get_fn;

        for(var i = 0; i < keys.length - 1; i++){
            if(typeof keys[i] !== 'string' || !current[keys[i]]){ return; }
            current = current[keys[i]];
        }

        var last_key = keys[keys.length - 1];
        if(is_set && !_unsanitized_prefixes[keys[0]] && typeof _dom.sanitize === 'function'){
            value = _dom.sanitize(value, { type: 'property', name: last_key, element: object });
        }

        var args = [last_key, value, current[last_key], current];
        if(!is_set){ return !get_fn ? current[last_key] : get_fn.apply(object, args); }
        current[!set_fn ? last_key : (set_fn.key ? set_fn.key.apply(object, args) : set_fn.apply(object, args))] = !set_fn ? value : (set_fn.value ? set_fn.value.apply(object, args) : set_fn.apply(object, args));
    }

    function _fn_each(DOMQuery, fn, array) {
        if(typeof fn !== 'function'){ return; }
        try {
            var found = array || document.querySelectorAll(DOMQuery[0].slice(1)), item = 0;
            while(item < found.length){
                fn(found[item], item++);
            }
        }
        catch(e){
            var error = new Error(e.message);
            error.name = 'iteration';
            error.message = error.message.replace(/querySelectorAll/g, 'DOMQuery');
            throw error;
        }
    }

    var
    _unsanitized_prefixes = { style: true, dataset: true },
    _url_properties = { href: true, src: true, action: true, formaction: true, 'xlink:href': true, poster: true, cite: true, background: true },
    _data_url_properties = { src: true, poster: true };

    function _sanitize(value, ctx) {
        if(value === null || value === undefined || !ctx || typeof ctx.name !== 'string'){ return value; }

        var name = ctx.name.toLowerCase();
        if(!_url_properties[name]){ return value; }

        // Browsers ignore spaces and control characters inside the scheme ("java\tscript:").
        var url = String(value).replace(/[\x00-\x20\x7f-\x9f]+/g, '').toLowerCase();
        if(/^(javascript|vbscript):/.test(url) || (/^data:/.test(url) && !(_data_url_properties[name] && /^data:(image|video|audio)\//.test(url)))){
            console.warn('Estructura DOM: unsafe URL blocked in "' + ctx.name + '".', ctx.element);
            return '';
        }
        return value;
    }

    _dom.sanitize = _sanitize;

    return _dom;
}));
