/**
 * A collection of encoding functions that act on a value and encode it in wire format
 * @module protob
 * @namespace coercers
 * @exports coercers
 */
var Long = require('../protob').Protob.Long,
    ByteBuffer = require('../protob').ByteBuffer,
    Util = require('util'),
    Enum = require('../enum').Enum,
    EnumValue = require('../enum').EnumValue,
    goog = require('./google-protos-defn'),
    fd = goog.fieldDescriptorProto;

function isBlank(val) {
  return val === undefined || val === null;
}

var UNIMPLEMENTED = function(val) { return val; };

function FLOAT(fieldName) {
  var func = function(val) {
    if ( val === undefined || val === null ) { return undefined; }
    val = parseFloat(val);
    if ( isNaN(val) ) {
      throw(new Error(fieldName + ": is not a number"));
    } else {
      return val;
    }
  };
  return func;
};

function INTEGER32(fieldName, signed) {
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

function SIGNED32(fieldName) { return INTEGER32(fieldName, true); };
function UNSIGNED32(fieldName) { return INTEGER32(fieldName, false); };

function INTEGER64(fieldName, signed) {
  var maxSize = ( signed ? Long.MAX_VALUE : Long.MAX_UNSIGNED_VALUE );
  var minSize = ( signed ? Long.MIN_VALUE : Long.ZERO );

  var func = function(val, opts) {
    opts = opts || {};
    if ( val === undefined || val === null ) { return undefined; }
    var value;
    if ( val instanceof Long ) {
      value = val;
    } else if ( val instanceof Object ) {
      if (isNaN(val.low) || isNaN(val.high)) {
        throw(new Error(fieldName + " is not a number"));
      }
      value = new Long(val.low, val.high, !!val.unsigned);
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

    if(opts.longs === undefined){
      return value;
    } else if (opts.longs == 'string') {
      return value.toString();
    } else if (opts.longs == 'ints'){
      return value.toNumber();
    } else {
      return value;
    }
  };
  return func;
};

function SIGNED64(fieldName) {
  return INTEGER64(fieldName, true);
};

function UNSIGNED64(fieldName) {
  return INTEGER64(fieldName, false);
};

var coercers = {
  TYPE_ENUM: function(fn, e) {
    var func = function(val, opts) {
      var r;
      if ( val === undefined || val === null ) { return undefined; }
      if ( val instanceof EnumValue ) {
        r = e.fetch(val.name);
      } else {
        r =  e.fetch(val);
      }
      if ( !r ) { 
        if( isNaN(Number(val)) ){
          throw( new Error(fn + ": Unknown ENUM value " + val + " for " + e.fullName));
        } else {
          r = new EnumValue({ number: val, name: undefined });
        }
      }

      switch(opts && opts.enums){
        case 'name':
          r =  r.name;
          break;
        case 'value':
        case 'numbers':
        case 'values':
        case 'number':
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
      if ( typeof(val) == 'string' ){
        return val !== 'false';
      }
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
        return val.toString();
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
  },

  addFieldCoercers: function() {
    var registry = require('../registry'),
        FD = registry.lookup('google.protobuf.FieldDescriptorProto');

    FD.prototype.coerce = function(msg, value, opts) {
      this.coerce = specificFieldCoercer(this);
      return this.coerce(msg, value, opts);
    }
  }
};

function specificFieldCoercer(field) {
  var dp = goog.descriptorProto,
      fd = goog.fieldDescriptorProto,
      registry = require('../registry'),
      TYPE = registry.lookup('google.protobuf.FieldDescriptorProto.Type'),
      type = TYPE.fetch(field[fd.TYPE]).name,
      typeName = field[fd.TYPE_NAME],
      coercer = coercers[type],
      fieldName = field[fd.NAME],
      referer, val;

  if (typeName) typeName = typeName.replace(/^\./, '');
  if (typeName) referer = registry.lookup(typeName);

  if (type == 'TYPE_ENUM') {
    return function(msg, value, opts) {
      if(isBlank(value)) return;
      return coercer(fieldName, referer).call(msg, value, opts);
    };
  } else if (type == 'TYPE_MESSAGE') {
    return function(msg, value, opts) {
      return coercer(fieldName, field).call(msg, value, opts);
    };
  } else {
    return function(msg, value, opts) {
      return coercer(fieldName).call(msg, value, opts);
    };
  }
}

exports.coercers = coercers;
