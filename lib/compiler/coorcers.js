var Util = require('util');
var Enum = require('../enum').Enum;
var EnumValue = require('../enum').EnumValue;

var UNIMPLEMENTED = function(val) { return val; };

var FLOAT = function(fieldName) {
  var func = function(val) {
    if ( !val ) { return undefined; }
    return parseFloat(val);
  };
  return func;
};

var UNSIGNED = function(fieldName, size) {
  var int = INTEGER(fieldName, size);
  var maxSize = ( size == 32 ? 2147483648 : 9223372036854775808 ); // TODO: LONG this will lose precision :(

  var func = function(val) {
    var response = int(val);

    if ( response === undefined || response === null ) { return undefined; };
    if ( response < 0 ) {
      throw( fieldName + ": Value cannot be less than Zero" );
    }

    if ( result > maxSize ) {
      throw(fieldName + ": is too large at " + result + ". Should be less than " + maxSize);
    }
    return response;
  };
  return func;
};

var INTEGER = function(fieldName, size) {
  var maxSize = ( size == 32 ? 4294967296 : 18446744073709551616 ); // TODO: LONG this will lose precision :(
  var func = function(val) {
    if ( !val ) { return undefined; }
    var result = parseInt(val);
    if ( result > maxSize ) {
      throw(fieldName + ": is too large at " + result + ". Should be less than " + maxSize);
    }
    return result;
  };
  return func;
};

var coorcers = {
  TYPE_ENUM: function(fn, e) {
    var func = function(val) {
      var r;
      if ( !val ) { return undefined; }
      if ( val instanceof EnumValue ) {
        r = e.fetch(val.name);
      } else {
        r =  e.fetch(val);
      }
      if ( !r ) { throw( fn + ": Unknown ENUM value " + val + " for " + e.fullName); }
      return r;
    };
    return func;
  },

  TYPE_DOUBLE:   function(fn) { return FLOAT(fn); },
  TYPE_FLOAT:    function(fn) { return FLOAT(fn); },
  TYPE_INT32:    function(fn) { return INTEGER(fn,  32); },
  TYPE_INT64:    function(fn) { return INTEGER(fn,  64); },
  TYPE_UINT32:   function(fn) { return UNSIGNED(fn, 32); },
  TYPE_UINT64:   function(fn) { return UNSIGNED(fn, 64); },
  TYPE_FIXED32:  function(fn) { return UNSIGNED(fn, 32); },
  TYPE_FIXED64:  function(fn) { return UNSIGNED(fn, 64); },
  TYPE_SFIXED32: function(fn) { return INTEGER(fn,  32); },
  TYPE_SFIXED64: function(fn) { return INTEGER(fn,  64); },
  TYPE_SINT32:   function(fn) { return INTEGER(fn,  32); },
  TYPE_SINT64:   function(fn) { return INTEGER(fn,  64); },

  TYPE_BOOL: function(fn) {
    var func = function(val) {
      if ( val === undefined || val === null ) { return undefined; };
      return !!val;
    };
    return func;
  },

  TYPE_STRING: function(fn) {
    var func = function(val) {
      if ( val === undefined || val === null ) { return undefined; };
      if ( typeof(val) == 'string' ){
        return val;
      } else {
        throw( fn + ": must be a string. Was " + Util.inspect(val) );
      }
    };
    return func;
  },

  TYPE_MESSAGE: function(fn, field) {
    var clazz = field.descriptor.concrete;
    var func = function(val) {
      if ( val === undefined || val === null ) { return undefined; };
      if ( val instanceof clazz ) { return clazz; }
      // coorce the object into one of those messages
      return new clazz(val); // TODO: are we serializing this here or validating it or what?
    };
    return func;
  },

  TYPE_GROUP:    function(fn) { return UNIMPLEMENTED; },
  TYPE_BYTES:    function(fn) { return UNIMPLEMENTED; }
};

exports.coorcers = coorcers;
