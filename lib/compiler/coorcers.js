var Util = require('util');
var Enum = require('../enum').Enum;
var EnumValue = require('../enum').EnumValue;
var Long = require('../protob').Protob.Long;
var ByteBuffer = require('../protob').ByteBuffer;

var UNIMPLEMENTED = function(val) { return val; };

var FLOAT = function(fieldName) {
  var func = function(val) {
    if ( !val ) { return undefined; }
    val = parseFloat(val);
    if ( isNaN(val) ) {
      throw(new Error(fieldName + ": is not a number"));
    } else {
      return val;
    }
  };
  return func;
};

var INTEGER32 = function(fieldName, signed) {
  var maxSize = ( signed ? 2147483648 : 4294967296 );
  var minSize = ( signed ? -2147483648 : 0 );
  var func = function(val) {
    if ( val === undefined || val === null ) { return undefined; }
    var result = parseInt(val, 10);
    if ( isNaN(result) ) {
      throw(new Error(fieldName + ": is not a number"));
    } else if ( result > maxSize ) {
      throw(new Error(fieldName + ": is too large at " + result + ". Should be less than " + maxSize));
    } else if ( result < minSize ) {
      throw(new Error(fieldName + ": is too small at " + result + ". Should be less than " + minSize));
    }
    return result;
  };
  return func;
};

var SIGNED32   = function(fieldName) { return INTEGER32(fieldName, true); };
var UNSIGNED32 = function(fieldName) { return INTEGER32(fieldName, false); };

var INTEGER64 = function(fieldName, signed) {
  var maxSize = ( signed ? Long.MAX_SIGNED_VALUE : Long.MAX_UNSIGNED_VALUE );
  var minSize = ( signed ? Long.MIN_SIGNED_VALUE : Long.ZERO );

  var func = function(val) {
    if ( val === undefined || val === null ) { return undefined; }
    var value;
    if ( val instanceof Long ) {
      value = val;
    } else if ( isNaN(val) ) {
      throw(new Error(fieldName + " is not a number"));
    } else if (typeof val == 'string') {
      value = Long.fromString(val, !signed);
    } else {
      value = Long.fromNumber(val, !signed);
    }
    if ( value.greaterThan(maxSize) ) {
      throw(new Error(fieldName + " is too large", value.toString() ));
    } else if ( value.lessThan(minSize) ) {
      throw(new Error(fieldName + " is too small", value.toString() ));
    }
    return value;
  };
  return func;
};

var SIGNED64 = function(fieldName) {
  return INTEGER64(fieldName, true);
};

var UNSIGNED64 = function(fieldName) {
  return INTEGER64(fieldName, false);
};

var coorcers = {
  TYPE_ENUM: function(fn, e) {
    var func = function(val, opts) {
      var r;
      if ( !val ) { return undefined; }
      if ( val instanceof EnumValue ) {
        r = e.fetch(val.name);
      } else {
        r =  e.fetch(val);
      }
      if ( !r ) { throw( new Error(fn + ": Unknown ENUM value " + val + " for " + e.fullName)); }

      switch(opts && opts.enums){
        case 'name':
          r =  r.name;
          break;
        case 'value':
          r = r.number;
          break;
        default:
          break;
      }
      return r;
    };
    return func;
  },

  TYPE_DOUBLE:   function(fn) { return FLOAT(fn);      } ,
  TYPE_FLOAT:    function(fn) { return FLOAT(fn);      } ,
  TYPE_INT32:    function(fn) { return SIGNED32(fn);   } ,
  TYPE_INT64:    function(fn) { return SIGNED64(fn);   } ,
  TYPE_UINT32:   function(fn) { return UNSIGNED32(fn); } ,
  TYPE_UINT64:   function(fn) { return UNSIGNED64(fn); } ,
  TYPE_FIXED32:  function(fn) { return UNSIGNED32(fn); } ,
  TYPE_FIXED64:  function(fn) { return UNSIGNED64(fn); } ,
  TYPE_SFIXED32: function(fn) { return SIGNED32(fn);   } ,
  TYPE_SFIXED64: function(fn) { return SIGNED64(fn);   } ,
  TYPE_SINT32:   function(fn) { return SIGNED32(fn);   } ,
  TYPE_SINT64:   function(fn) { return SIGNED64(fn);   } ,

  TYPE_BOOL: function(fn) {
    var func = function(val) {
      if ( val === undefined || val === null ) { return undefined; }
      return !!val;
    };
    return func;
  },

  TYPE_STRING: function(fn) {
    var func = function(val) {
      if ( val === undefined || val === null ) { return undefined; }
      if ( typeof(val) == 'string' ){
        return val;
      } else {
        throw( new Error(fn + ": must be a string. Was " + Util.inspect(val)) );
      }
    };
    return func;
  },

  TYPE_MESSAGE: function(fn, field) {
    var clazz = field.descriptor.concrete;
    var func = function(val) {
      if ( val === undefined || val === null ) { return undefined; }
      if ( val instanceof clazz ) { return val; }
      // coorce the object into one of those messages
      return new clazz(val); // TODO: are we serializing this here or validating it or what?
    };
    return func;
  },

  TYPE_GROUP:    function(fn) { return UNIMPLEMENTED; },
  TYPE_BYTES:    function(fn) {
    var func = function(val) {
      if ( val === undefined || val === null ) { return undefined; }
      if ( val instanceof ByteBuffer ) { return val; }

      return ByteBuffer.wrap(val);
    };
    return func;
  }
};

exports.coorcers = coorcers;
