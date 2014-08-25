require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"protob":[function(require,module,exports){
module.exports=require('Focm2+');
},{}],"Focm2+":[function(require,module,exports){
exports.Protob    = require('./lib/protob').Protob
exports.Compiler  = require('./lib/compiler').Compiler
exports.Message   = require('./lib/message').Message
exports.Service   = require('./lib/service').Service;
exports.Enum      = require('./lib/enum').Enum;
exports.EnumValue = require('./lib/enum').EnumValue;
exports.stevenInit   = require('./lib/steven_init');

exports.Compiler.compile(); // compile the base protos

},{"./lib/compiler":3,"./lib/enum":8,"./lib/message":10,"./lib/protob":11,"./lib/service":13,"./lib/steven_init":14}],3:[function(require,module,exports){
/**
 * Compiler for parsed .proto files that have already been converted into .json files
 *
 * @module protob/compiler
 * @exports Compiler
 */
var Path = require('path'),
    Util = require('util'),
    goog = require('./compiler/google-protos-defn'),
    pUtil = require('./util').Util,
    compiler = new Compiler(),
    _registry;

function registry() {
  _registry = _registry || require('./registry');
  return _registry;
}

module.exports.Compiler = compiler;
/**
 * A new instance of a compiler. Compilers will update the Protob registry and define Javascript objects for each message, enum, service found
 * @constructor
 */
function Compiler(){
  this.reset = function() { this.descriptorsByFile = {}; }.bind(this);

  this.reset();
}

/**
 * Compiles all the .json files found in any of the paths (found recursively) provided
 *
 * This will create Javascript objects in the registry for each message, enum, service found in the descriptors for those files.
 * Extensions will then be applied and finally the Object cache (Protob.v) will be updated to include any new objects.
 *
 * compile can be called many times and is additive to the registry. Each time you call it though, every message type will be finalized anew.
 *
 * @argument {string} - Repeated arguments for each directory to look under for json files to compile
 * @example
 *    compiler = new Compiler();
 *    compiler.compile("./foo", "./protos")
 *
 * @public
 */
Compiler.prototype.compile = function(){
  var self = this,
      paths =  Array.prototype.slice.call(arguments) || [],
      fs = require('fs'),
      glob = require('glob'),
      descriptors = [];

  paths.forEach(function(pathh) {
    var pathz = [pathh];
    if (!( /\.json/.test(pathh)) ) {
      pathz = glob.sync(Path.join(pathh, "**/*.json"));
    }

    pathz.forEach(function(path) {
      fileDescriptors = JSON.parse(fs.readFileSync(path));
      if ( fileDescriptors.length === 0 ) { return; }
      descriptors = descriptors.concat(fileDescriptors);
    });

  });

  self.compileDescriptors(descriptors);

  return registry();
}

/**
 * @param {Array<google.protobuf.FileDescriptorProto>} descriptors - A list of file descriptors
 * @private
 */
Compiler.prototype.compileDescriptors = function(descriptors) {
  var self = this,
      reg = registry(),
      fd = goog.fileDescriptorProto;

  // The file descriptors should be available immediately after the initial google compilation
  // They also need to make sure that all dependencies are compiled first
  descriptors.forEach(function(desc) {
    self.descriptorsByFile[desc[fd.NAME]] = desc;
  });

  descriptors.forEach(function(desc) {
    // These descriptors are file descriptors
    self.compileDescriptor(self.descriptorsByFile[desc[fd.NAME]]);
  });
  return registry();
};

/**
 * Compiles a generic descriptor, this could be of type message, enum, or service
 * @param {object} descriptor - The object that is a google.protobuf.FileDescriptor
 * @private
 */
Compiler.prototype.compileDescriptor = function(descriptor) {

  // We need to bootstrap the things until we actually get the file proto descriptor
  var FD = goog.fileDescriptorProto,
      reg = registry(),
      name = descriptor[FD.NAME],
      dependency = descriptor[FD.DEPENDENCY],
      self = this,
      FDP = reg.lookup('google.protobuf.FileDescriptorProto');

  this.descriptorsByFile[name] = this.descriptorsByFile[name] || descriptor;

  if(dependency) {
    dependency.forEach(function(path) {
      var depDesc = self.descriptorsByFile[path];

      if(!depDesc) throw "Dependency not found: " + path;

      self.compileDescriptor(depDesc);
    });
  }


  if(FDP && !(descriptor instanceof FDP)) {
    descriptor = new FDP(descriptor);
    this.descriptorsByFile[descriptor[FD.NAME]] = descriptor;
  }

  var name = descriptor[FD.NAME],
      pkg  = descriptor[FD.PACKAGE],
      message_type = descriptor[FD.MESSAGE_TYPE],
      enum_type = descriptor[FD.ENUM_TYPE],
      service = descriptor[FD.SERVICE],
      extension = descriptor[FD.EXTENSION],
      options = descriptor[FD.OPTIONS],
      source_code_info = descriptor[FD.SOURCE_CODE_INFO];


  if ( Array.isArray(enum_type) ) {
    enum_type.forEach( function(enumDesc) {
      self.compileEnum(enumDesc, pkg, descriptor);
    });
  }

  if ( Array.isArray(message_type) ) {
    message_type.forEach( function(msgDesc) {
      self.compileMessage(msgDesc, pkg, descriptor);
    });
  }

  if ( Array.isArray(service) ) {
    service.forEach( function(serviceDesc) {
      self.compileService(serviceDesc, pkg, descriptor);
    });
  }

  if( Array.isArray(extension) ) {
    extension.forEach(function(ext){
      ext.pkg = pkg;
      registry()._addExtension(ext);
    });
  }

  registry()._applyExtensions();
  registry()._finalize(true);
  descriptor.__protobCompiled__ = true;
}

/**
 * Compiles an Enum, and all associated EnumValues and creates a new object in the registry,
 * or updates an existing one by calling updateDescriptor on the enum.
 * @param {object} enumDesc - The enum descriptor
 * @param {string} pkg - The protobuf package name
 * @param {object} descriptor - The file descriptor that this enum came from
 * @private
 */
Compiler.prototype.compileEnum = function(enumDesc, pkg, descriptor) {
  var enumDescriptor = goog.enumDescriptorProto,
      name = enumDesc[enumDescriptor.NAME],
      fullName = pkg + "." + name,
      Enum = require('./enum').Enum,
      nenum, obj;

  if ( !registry().has(fullName) ) {
    nenum = function() {
      Enum.prototype.constructor.call(this, Array.prototype.slice.call(arguments));
    };
    Util.inherits(nenum, Enum);
    obj = new nenum(pkg);
    obj.fileDescriptor = descriptor;
    registry()._addObject(fullName, obj);
  }

  registry().lookup(fullName).updateDescriptor(enumDesc);
};

/**
 * Compiles a Message and adds it to the registry
 * or updates an existing one by calling updateDescriptor
 * @param {object} messageDesc - The message descriptor
 * @param {string} pkg - The protobuf package name
 * @param {object} descriptor - The file descriptor that this message came from
 * @private
 */
Compiler.prototype.compileMessage = function(messageDesc, pkg, descriptor) {
  var descriptorProto = goog.descriptorProto,
      protobufs = registry().scope('google.protobuf'),
      DescriptorProto = protobufs.lookup('DescriptorProto'),
      nmessage;

  if(registry().googleCompiled && DescriptorProto && !(messageDesc instanceof DescriptorProto)) {
    messageDesc = new DescriptorProto(messageDesc);
  }

  var fullName = pkg + "." + (messageDesc[descriptorProto.NAME]),
      Message = require('./message').Message,
      self    = this,
      messageEnumType = messageDesc[descriptorProto.ENUM_TYPE];

  if( Array.isArray(messageEnumType) ) {
    messageEnumType.forEach(function(enumDesc) {
      self.compileEnum(enumDesc, fullName, descriptor);
    });
  }

  if ( !registry().has(fullName) ) {
    nmessage = function() { Message.apply(this, Array.prototype.slice.call(arguments)); };
    Util.inherits(nmessage, Message);
    nmessage.parent = pkg;
    nmessage.fieldCache = {};
    nmessage.updateDescriptor = Message.updateDescriptor;
    nmessage.afterInitialize = [];
    nmessage.isService = Message.isService;
    nmessage.isMessage = Message.isMessage;
    nmessage.isEnum = Message.isEnum;
    registry()._addObject(fullName, nmessage);
  }

  registry().lookup(fullName).fileDescriptor = descriptor;

  var messageExtensions = messageDesc[descriptorProto.EXTENSION];

  if( Array.isArray(messageExtensions) ){
    messageExtensions.forEach(function(ext){
      ext.pkg = pkg;
      registry()._addExtension(ext);
    });
  }

  var nestedType = messageDesc[descriptorProto.NESTED_TYPE];
  if( Array.isArray(nestedType) ) {
    nestedType.forEach(function(msgDesc) {
      self.compileMessage(msgDesc, fullName, descriptor);
    });
  }

  registry().lookup(fullName).updateDescriptor(messageDesc);
}

/**
 * Compiles a Service and adds it to the registry
 * or updates an existing one by calling updateDescriptor
 * @param {object} serviceDesc - The service descriptor
 * @param {string} pkg - The protobuf package name
 * @param {object} descriptor - The file descriptor that this service
 * @private
 */
Compiler.prototype.compileService = function(serviceDesc, pkg, descriptor) {
  var serviceDescriptor = goog.serviceDescriptorProto,
      name = serviceDesc[serviceDescriptor.NAME],
      method = serviceDesc[serviceDescriptor.METHOD],
      options = serviceDesc[serviceDescriptor.OPTIONS],
      fullName = pkg + "." + name,
      Service = require('./service').Service,
      self = this,
      nservice;

  if ( !registry().has(fullName) ) {
    nservice = function() {
      Service.apply(this, Array.prototype.slice.call(arguments));
    };
    Util.inherits(nservice, Service);
    nservice.parent = pkg;
    nservice.updateDescriptor = Service.updateDescriptor;
    nservice.handler = Service.handler;
    nservice.isService = Service.isService;
    nservice.isMessage = Service.isMessage;
    nservice.isEnum = Service.isEnum;
    registry()._addObject(fullName, nservice);
  }

  registry().lookup(fullName).fileDescriptor = descriptor;
  registry().lookup(fullName).updateDescriptor(serviceDesc);
};

},{"./compiler/google-protos-defn":7,"./enum":8,"./message":10,"./registry":12,"./service":13,"./util":15,"fs":17,"glob":53,"path":26,"util":37}],4:[function(require,module,exports){
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

},{"../enum":8,"../protob":11,"../registry":12,"./google-protos-defn":7,"util":37}],5:[function(require,module,exports){
/**
 * A collection of decoding functions that act on an encoded (wire format) buffer and convert to field values
 * @module protob
 * @namespace dencoders
 * @exports dencoders
 */
var Util = require('util'),
    Protob = require('../protob').Protob,
    registry = require('../registry'),
    goog = require('./google-protos-defn'),
    fd = goog.fieldDescriptorProto,
    fo = goog.fieldOptions;

var UNIMPLEMENTED = function(buffer, field) {
  throw("TYPE GROUP for " + field[fd.NAME] + " is not implemented");
};

var decoders = {

  /**
   * Decode a double
   * @function TYPE_DOUBLE
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {number} - The double to return
   * @protected
   */
  TYPE_DOUBLE: function(buffer, field) { return buffer.readDouble(); } ,


  /**
   * Decode a float
   * @function TYPE_FLOAT
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {number} - The float that was read
   * @protected
   */
  TYPE_FLOAT: function(buffer, field) { return buffer.readFloat(); } ,

  /**
   * Decode an int32
   * @function TYPE_INT32
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {integer} - The int that was read
   * @protected
   */
  TYPE_INT32: function(buffer, field) { return buffer.readVarint32() | 0; } ,

  /**
   * Decode an int64
   * @function TYPE_INT64
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {Long} - The int that was read
   * @protected
   */
  TYPE_INT64: function(buffer, field) { return buffer.readVarint64(); } ,

  /**
   * Decode an uint32
   * @function TYPE_UINT32
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {number} - The int that was read
   * @protected
   */
  TYPE_UINT32: function(buffer, field) { return buffer.readVarint32() >>> 0; } ,

  /**
   * Decode an uint64
   * @function TYPE_UINT64
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {Long} - The int that was read
   * @protected
   */
  TYPE_UINT64: function(buffer, field) { return buffer.readVarint64().toUnsigned(); } ,

  /**
   * Decode an fixed32
   * @function TYPE_FIXED32
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {number} - The int that was read
   * @protected
   */
  TYPE_FIXED32: function(buffer, field) { return buffer.readUint32() >>> 0; },

  /**
   * Decode an fixed64
   * @function TYPE_FIXED64
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {Long} - The number that was read
   * @protected
   */
  TYPE_FIXED64: function(buffer, field) { return buffer.readUint64(); },

  /**
   * Decode an sfixed32
   * @function TYPE_SFIXED32
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {number} - The number that was read
   * @protected
   */
  TYPE_SFIXED32: function(buffer, field) { return buffer.readInt32() | 0; },

  /**
   * Decode an sfixed64
   * @function TYPE_SFIXED64
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {Long} - The number that was read
   * @protected
   */
  TYPE_SFIXED64: function(buffer, field) { return buffer.readInt64(); },

  /**
   * Decode an sint32
   * @function TYPE_SINT32
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {number} - The number that was read
   * @protected
   */
  TYPE_SINT32: function(buffer, field) { return buffer.readZigZagVarint32() | 0; },

  /**
   * Decode an sint64
   * @function TYPE_SINT64
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {Long} - The number that was read
   * @protected
   */
  TYPE_SINT64: function(buffer, field) { return buffer.readZigZagVarint64(); },

  /**
   * Decode an boolean
   * @function TYPE_BOOL
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {boolean} - The boolean that was read
   * @protected
   */
  TYPE_BOOL: function(buffer, field) { return !!buffer.readVarint32(); },

  /**
   * Decode a string
   * @function TYPE_STRING
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {string} - The string that was read
   * @protected
   */
  TYPE_STRING: function(buffer, field) { return buffer.readVString(); },

  TYPE_GROUP: UNIMPLEMENTED,

  /**
   * Decode an enum value
   * @function TYPE_ENUM
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @param {object} [opts] - Options hash
   * @param {object} opts.enums - 'full' or 'name' or 'number'. Defaults to 'number'
   * @return {string|number|EnumValue} - The enum value that was read
   * @protected
   */
  TYPE_ENUM: function(buffer, field, opts) {
    var raw = buffer.readVarint32(),
        r;

    switch(opts && opts.enums) {
      case 'full':
        r = field.concrete.fetch(raw);
        break;
      case 'name':
        r = field.concrete.fetch(raw).name;
        break;
      case 'number':
        r = field.concrete.fetch(raw).number;
        break;
      default:
        r = field.concrete.fetch(raw);
        break;
    }
    return r;
  } ,

  /**
   * Decode a bytes
   * @function TYPE_BYTES
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {ByteBuffer} - The bytes that were read
   * @protected
   */
  TYPE_BYTES: function(buffer, field) {
    nBytes = buffer.readVarint32();
    if (buffer.remaining() < nBytes) {
      throw(new Error("Illegal number of bytes for "+this.toString(true)+": "+nBytes+" required but got only "+buffer.remaining()));
    }
    value = buffer.clone(); // Offset already set
    value.length = value.offset+nBytes;
    buffer.offset += nBytes;
    return value;
  },

  /**
   * Decode a message
   * @function TYPE_MESSAGE
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @param {object} field - The field object
   * @return {Protob.Message} - The message that were read
   * @protected
   */
  TYPE_MESSAGE: function(buffer, field, opts) {
    nBytes = buffer.readVarint32();
    return field.descriptor.concrete.decode(buffer, nBytes, opts);
  },

  field: function(wireType, buffer, skipRepeated, field, opts) {
    var nBytes,
        fieldWireType = Protob.TYPES[field.fieldType] && Protob.TYPES[field.fieldType].wireType,
        label = field[fd.LABEL],
        delimWireType = (wireType == Protob.WIRE_TYPES.LDELIM),
        repeated;

    if(label && label.number) label = label.number;
    repeated = (label == fd.label.LABEL_REPEATED);

    if (wireType != fieldWireType && (skipRepeated || (!delimWireType || !repeated))) {
      throw(new Error("Illegal wire type for field "+field[fd.NAME]+": "+wireType+" ("+fieldWireType+" expected)"));
    }

    if (delimWireType && repeated && (field[fd.OPTIONS] && field[fd.OPTIONS][fo.PACKED]) && Protob.PACKABLE_WIRE_TYPES.indexOf(fieldWireType) >= 0)  {
      if( !skipRepeated ) {
        nBytes = buffer.readVarint32();
        nBytes = buffer.offset + nBytes; // Limit
        var values = [];
        while (buffer.offset < nBytes) {
          values.push(decoders.field(fieldWireType, buffer, true, field, opts));
        }
        return values;
      }
    }
    // Read the next value otherwise...
    var decoder = decoders[field.fieldType];
    if ( !decoder ) {
      // We should never end here
      throw(new Error("[INTERNAL] Illegal wire type for "+field.name+": "+wireType));
    }

    return decoder(buffer, field, opts);
  }
};

exports.decoders = decoders;

},{"../protob":11,"../registry":12,"./google-protos-defn":7,"util":37}],6:[function(require,module,exports){
var goog = require('./google-protos-defn');
/**
 * A collection of encoding functions that act on a value and encode it in wire format
 * @module protob
 * @namespace encoders
 * @exports encoders
 */
var Protob = require('../protob').Protob,
    ByteBuffer = require('../protob').ByteBuffer,
    EnumValue = require('../enum').EnumValue;

var encoders = {
  /**
   * Encode an int32
   * @function TYPE_INT32
   * @param {object} field - The field object
   * @param {integer} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_INT32: function(field, value, buffer){ buffer.writeVarint32(value); },

  /**
   * Encode an uint32
   * @function TYPE_UINT32
   * @param {object} field - The field object
   * @param {integer} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_UINT32: function(field, value, buffer){ buffer.writeVarint32(value); },

  /**
   * Encode an sint32 field
   * @function TYPE_SINT32
   * @param {object} field - The field object
   * @param {integer} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_SINT32: function(field, value, buffer) { buffer.writeZigZagVarint32(value); },

  /**
   * Encode an fixed32 field
   * @function TYPE_FIXED32
   * @param {object} field - The field object
   * @param {number} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_FIXED32: function(field, value, buffer) { buffer.writeUint32(value); },

  /**
   * Encode an sfixed32 field
   * @function TYPE_SFIXED32
   * @param {object} field - The field object
   * @param {number} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_SFIXED32: function(field, value, buffer) { buffer.writeInt32(value); },

  /**
   * Encode an int64 field
   * @function TYPE_INT64
   * @param {object} field - The field object
   * @param {Long|number} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_INT64: function(field, value, buffer) { buffer.writeVarint64(value); },

  /**
   * Encode an uint64 field
   * @function TYPE_UINT64
   * @param {object} field - The field object
   * @param {Long|number} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_UINT64: function(field, value, buffer) { buffer.writeVarint64(value); },

  /**
   * Encode an sint64 field
   * @function TYPE_SINT64
   * @param {object} field - The field object
   * @param {Long|number} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_SINT64: function(field, value, buffer) { buffer.writeZigZagVarint64(value); },

  /**
   * Encode an fixed64 field
   * @function TYPE_FIXED64
   * @param {object} field - The field object
   * @param {Long|number} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_FIXED64: function(field, value, buffer) { buffer.writeUint64(value); },

  /**
   * Encode an sfixed64 field
   * @function TYPE_SFIXED64
   * @param {object} field - The field object
   * @param {Long|number} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_SFIXED64: function(field, value, buffer) { buffer.writeInt64(value); },

  /**
   * Encode an bool field
   * @function TYPE_BOOL
   * @param {object} field - The field object
   * @param {true|false} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_BOOL: function(field, value, buffer) { buffer.writeVarint32(value ? 1 : 0); },

  /**
   * Encode an float field
   * @function TYPE_FLOAT
   * @param {object} field - The field object
   * @param {number} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_FLOAT: function(field, value, buffer) { buffer.writeFloat32(value); },

  /**
   * Encode an double field
   * @function TYPE_DOUBLE
   * @param {object} field - The field object
   * @param {number} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_DOUBLE: function(field, value, buffer) { buffer.writeFloat64(value); },

  /**
   * Encode an string field
   * @function TYPE_STRING
   * @param {object} field - The field object
   * @param {string} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_STRING: function(field, value, buffer) { buffer.writeVString(value); },

  /**
   * Encode an enum field
   * @function TYPE_ENUM
   * @param {object} field - The field object
   * @param {EnumValue|integer} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_ENUM: function(field, value, buffer) {
    if(value instanceof EnumValue) {
      buffer.writeVarint32(value.number);
    } else {
      buffer.writeVarint32(value);
    }
  },

  /**
   * Encode an bytes field
   * @function TYPE_BYTES
   * @param {object} field - The field object
   * @param {ByteBuffer} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_BYTES: function(field, value, buffer) {
    if (value.offset > value.length) { // Forgot to flip?
      buffer = buffer.clone().flip();
    }
    buffer.writeVarint32(value.remaining());
    buffer.append(value);
    value.offset = 0;
  },

  /**
   * Encode a message field
   * @function TYPE_MESSAGE
   * @param {object} field - The field object
   * @param {Protob.Message} value - The unencoded value of the field
   * @param {ByteBuffer} buffer - The buffer to write the encoded value into
   * @protected
   */
  TYPE_MESSAGE: function(field, value, buffer) {
    if ( !value ) { return; }
    if ( !( value instanceof field.descriptor.concrete ) ) {
      value = new field.descriptor.concrete(value);
    }
    var bb = value.encode().toBuffer();

    buffer.writeVarint32(bb.length);
    buffer.append(bb);
  },

  addFieldEncoders: function() {
    var registry = require('../registry');
        FD = registry.lookup('google.protobuf.FieldDescriptorProto');

    FD.prototype.encode = function(value, buffer) {
      this.encode = specificFieldEncoder(this);
      return this.encode(value, buffer);
    }
  }
};

function specificFieldEncoder(field) {
  var registry = require('../registry'),
      fd = goog.fieldDescriptorProto,
      fo = goog.fieldOptions,
      constructor = field.constructor,
      Protob = require('../protob').Protob,
      repeated = field.repeated,
      fieldType = field.fieldType,
      encoder = encoders[fieldType],
      tag = field[fd.NUMBER] << 3,
      fieldWireType = Protob.TYPES[fieldType].wireType,
      packed = field[fd.OPTIONS] && field[fd.OPTIONS][fo.PACKED];

  if ( fieldType === null ) { throw(new Error("[INTERNAL] Unresolved type in "+field[fd.NAME]+": "+fieldType)); }

  if( repeated ) {
    if (packed) {
      return function(value, buffer) {
        if (value === null || value === undefined || !value || !value.length) return buffer; // Optional omitted
        buffer.writeVarint32(tag | Protob.WIRE_TYPES.LDELIM);
        buffer.ensureCapacity(buffer.offset += 1); // We do not know the length yet, so let's assume a varint of length 1
        var start = buffer.offset; // Remember where the contents begin
        value.forEach(function(v) { encoder(field, v, buffer); });

        var len = buffer.offset-start;
        var varintLen = ByteBuffer.calculateVarint32(len);
        if (varintLen > 1) { // We need to move the contents
          var contents = buffer.slice(start, buffer.offset);
          start += varintLen-1;
          buffer.offset = start;
          buffer.append(contents);
        }
        buffer.writeVarint32(len, start-varintLen);
        return buffer;
      };
    } else {
      // Repeated, but not packed
      return function(value, buffer) {
        var self = this;
        if (value === null || value === undefined || !value || !value.length) return buffer; // Optional omitted
        // "If your message definition has repeated elements (without the [packed=true] option), the encoded
        // message has zero or more key-value pairs with the same tag number"
        value.forEach(function(val){
          buffer.writeVarint32(tag | fieldWireType);
          encoder(self, val, buffer);
        });
        return buffer;
      };
    }
  } else {
    // Not Repeated
    return function(value, buffer) {
      if (value === null || value === undefined) return buffer; // Optional omitted
      buffer.writeVarint32(tag | fieldWireType);
      encoder(this, value, buffer);
      return buffer;
    };
  }
}


module.exports.encoders = encoders;

},{"../enum":8,"../protob":11,"../registry":12,"./google-protos-defn":7}],7:[function(require,module,exports){
// Need to map the numbers for known google protobuf messages
// so that we can compile the initial protocol buffers
module.exports = {
  fileDescriptorSet: {
    FILE: 1
  },
  fileDescriptorProto: {
    NAME: 1,
    PACKAGE: 2,
    DEPENDENCY: 3,
    MESSAGE_TYPE: 4,
    ENUM_TYPE: 5,
    SERVICE: 6,
    EXTENSION: 7,
    OPTIONS: 8,
    SOURCE_CODE_INFO: 9
  },
  descriptorProto: {
    NAME: 1,
    DOC: 8,
    FIELD: 2,
    EXTENSION: 6,
    NESTED_TYPE: 3,
    ENUM_TYPE: 4,

    extensionRange: {
      START: 1,
      END: 2
    },
    EXTENSION_RANGE: 5,
    OPTIONS: 7
  },
  fieldDescriptorProto: {
    type: {
      TYPE_DOUBLE: 1,
      TYPE_FLOAT: 2,
      TYPE_INT64: 3,
      TYPE_UINT64: 4,
      TYPE_INT32: 5,
      TYPE_FIXED64: 6,
      TYPE_FIXED32: 7,
      TYPE_BOOL: 8,
      TYPE_STRING: 9,
      TYPE_GROUP: 10,
      TYPE_MESSAGE: 11,
      TYPE_BYTES: 12,
      TYPE_UINT32: 13,
      TYPE_ENUM: 14,
      TYPE_SFIXED32: 15,
      TYPE_SFIXED64: 16,
      TYPE_SINT32: 17,
      TYPE_SINT64: 18
    },
    label: {
      LABEL_OPTIONAL: 1,
      LABEL_REQUIRED: 2,
      LABEL_REPEATED: 3
    },
    NAME: 1,
    DOC: 9,
    NUMBER: 3,
    LABEL: 4,
    TYPE: 5,
    TYPE_NAME: 6,
    EXTENDEE: 2,
    DEFAULT_VALUE: 7,
    OPTIONS: 8
  },
  enumDescriptorProto: {
    NAME: 1,
    DOC: 4,
    VALUE: 2,
    OPTIONS: 3
  },
  enumValueDescriptorProto: {
    NAME: 1,
    DOC: 4,
    NUMBER: 2,
    OPTIONS: 3
  },
  serviceDescriptorProto: {
    NAME: 1,
    METHOD: 2,
    DOC: 4,
    OPTIONS: 3
  },
  methodDescriptorProto: {
    NAME: 1,
    DOC: 5,
    INPUT_TYPE: 2,
    OUTPUT_TYPE: 3,
    OPTIONS: 4
  },
  fileOptions: {
    JAVA_PACKAGE: 1,
    JAVA_OUTER_CLASSNAME: 8,
    JAVA_MULTIPLE_FILES: 10,
    GO_PACKAGE: 11,
    JAVA_GENERATE_EQUALS_AND_HASH: 20,
    optimizeMode: {
      SPEED: 1,
      CODE_SIZE: 2,
      LITE_RUNTIME: 3
    },
    OPTIMIZE_FOR: 9,
    CC_GENERIC_SERVICES: 16,
    JAVA_GENERIC_SERVICES: 17,
    PY_GENERIC_SERVICES: 18,
    UNINTERPRETED_OPTION: 999
  },
  messageOptions: {
    MESSAGE_SET_WIRE_FORMAT: 1,
    NO_STANDARD_DESCRIPTOR_ACCESSOR: 2,
    UNINTERPRETED_OPTION: 999
  },
  fieldOptions: {
    CTYPE: 1,
    ctype: {
      STRING: 0,
      CORD: 1,
      STRING_PIECE: 2
    },
    PACKED: 2,
    DEPRECATED: 3,
    EXPERIMENTAL_MAP_KEY: 9,
    UNINTERPRETED_OPTION: 999
  },
  enumOptions: {
    UNINTERPRETED_OPTION: 999
  },
  enumValueOptions: {
    UNINTERPRETED_OPTION: 999
  },
  serviceOptions: {
    UNINTERPRETED_OPTION: 999
  },
  methodOptions: {
    UNINTERPRETED_OPTION: 999
  },
  uninterpretedOption: {
    namePart: {
      NAME_PART: 1,
      IS_EXTENSION: 2
    },
    NAME: 2,
    IDENTIFIER_VALUE: 3,
    POSITIVE_IN_VALUE: 4,
    NEGATIVE_INT_VALUE: 5,
    DOUBLE_VALUE: 6,
    STRING_VALUE: 7,
    AGGREGATE_VALUE: 8
  },
  sourceCodeInfo: {
    LOCATION: 1,
    location: {
      PATH: 1,
      SPAN: 2
    }
  }
};

},{}],8:[function(require,module,exports){
/**
 * @module protob/enum
 * @exports Enum
 * @exports EnumValue
 */
var ENUM = "ENUM",
    registry = require('./registry'),
    goog = require('./compiler/google-protos-defn');

/**
 * Creates a new Enum as a container for enums
 * The Enum is a container for enum values and should never be instantiated directly.
 *
 * @protected
 * @constructor
 * @param {string} pkg - The package name this enum belongs to
 */
function Enum(pkg){
  this.parent = pkg;
  this.v = {};
  this.valuesByNumber = {};
};

Enum.prototype.isService = function() { return false; };
Enum.prototype.isMessage = function() { return false; };
Enum.prototype.isEnum = function() { return true; };

/**
 * Creates a new EnumValue. When using protocol buffers, the EnumValue is the object that your
 * field will be given. These objects are immutable.
 *
 * @param {string} name - The name of the Enum value
 * @param {number} number - The ID number of the Enum Value
 * @param {object} [options] - Any options defined in the protobuf package for the enum
 *
 * @constructor
 * @protected
 */
function EnumValue(name, number, options) {
  /** @member {string} - The name of the this EnumValue */
  this.name = name;

  /** @member {string} - The ID number of the this EnumValue */
  this.number = number;
  if( options ) {
    /** @member {object} - Any protobuf options that have been set for this EnumValue in the .proto definition */
    this.options = options;
  }
};

/**
 * Updates the Enum and all containing values based on a change in the protobuf descriptor
 *
 * @param {object} desc - The protobuf descriptor for this enum
 * @protected
 */
Enum.prototype.updateDescriptor = function(desc) {
  var enumDescriptor = goog.enumDescriptorProto;

  // if( !Object.isFrozen(desc) ) { Object.freeze(desc); }
  /** @member {object} - The protobuf descriptor */
  this.descriptor = desc;
  /** @member {object} - The protocol buffer name for this enum */
  this.clazz = desc[enumDescriptor.NAME];
  /** @member {object} - The protocol buffer full name for this Enum */
  this.fullName = this.parent + "." + this.clazz;
  this.reset();
};

/**
 * Finalizes the Enum.
 * @protected
 */
Enum.prototype.finalize = function() {
  var TYPE  = registry.lookup('google.protobuf.FieldDescriptorProto.Type');
  this.type = TYPE.fetch('TYPE_ENUM');
};

/**
 * Fetches any descriptor options defined in the proto definition
 * @public
 */
Enum.prototype.options = function() {
  return this.descriptor[goog.enumDescriptorProto.OPTIONS];
};

/*this.clazz;
 * Resets the Enum after a new descriptor has been created.
 * Re-Creates the EnumValues associated with this enum.
 * Called as part of finalization
 *
 * @protected
 */
Enum.prototype.reset = function() {
  var enumDescriptor = goog.enumDescriptorProto,
      enumValueDescriptor = goog.enumValueDescriptorProto;

  this.v   = {};
  this.valuesByNumber = {};
  var self = this,
      values = this.descriptor[enumDescriptor.VALUE];

  if ( !Array.isArray(values) ) { return; }

  values.forEach(function(v) {
    var val = new EnumValue(v[enumValueDescriptor.NAME], v[enumValueDescriptor.NUMBER], v[enumValueDescriptor.OPTIONS]);
    self.v[v[enumValueDescriptor.NAME]] = val;
    self.valuesByNumber[v[enumValueDescriptor.NUMBER]] = val;
  });
};

/**
 * Fetches the EnumValue by ID value
 * @param {integer} val - The ID value of the EnumValue to fetch
 * @return {Protob.EnumValue} - The found value or undefined
 */
Enum.prototype.byValue = function(val)  { return this.valuesByNumber[val]; };

/**
 * Fetches the EnumValue by name
 * @param {string} name - The name of the EnumValue to fetch
 * @return {Protob.EnumValue} - The found value or undefined
 */
Enum.prototype.byName  = function(name) {
  if(name == 0 || name) {
    return this.v[name] || this.v[name.toString().toUpperCase()];
  } else {
    return;
  }
};

/**
 * Fetches the EnumValue by name or ID
 * @param {string|integer} nameOrValue - The name or value of the EnumValue to fetch
 * @return {Protob.EnumValue} - The found value or undefined
 */
Enum.prototype.fetch = function(nameOrValue) {
  if(nameOrValue instanceof EnumValue) return nameOrValue;
  return this.byName(nameOrValue) || this.byValue(nameOrValue);
};

/**
 * Checks to see if a value is valid for this enum
 * @param {integer} val - The id value to check if the enum is valid
 * @return {boolean} - True if the value is valid
 */
Enum.prototype.isValidValue = function(val) { return !!this.byValue(val); };

/**
 * Checks to see if name maps to a valid value for this enum
 * @param {integer} val - The name of value
 * @return {boolean} - True if the value is valid
 */
Enum.prototype.isValidName  = function(val) { return !!this.byName(val);  };

/**
 * Provide an array of valid names for the EnumValues on this enum
 * @return {array} - The array of Names for this enum
 */
Enum.prototype.names = function() {
  return Object.getOwnPropertyNames(this.v);
};

/**
 * Provide an array of valid ID values of the EnumValues on this enum
 * @return {array} - The array of value ids for this enum
 */
Enum.prototype.values = function() {
  return Object.getOwnPropertyNames(this.valuesByNumber).map(function(i) { return parseInt(i, 10); });
};

/**
 * Provide an array of EnumValues attached to this enum
 * @return {array} - The array of full EnumValue objects found on this enum
 */
Enum.prototype.enumValues = function(){
  var self = this;
  return Object.getOwnPropertyNames(this.v).map(function(name) {
    return self.v[name];
  });
};


exports.Enum = Enum;
exports.EnumValue = EnumValue;

},{"./compiler/google-protos-defn":7,"./registry":12}],9:[function(require,module,exports){
module.exports = [
  {
    "1": "google/protobuf/descriptor.proto",
    "2": "google.protobuf",
    "4": [
      {
        "1": "FileDescriptorSet",
        "2": [
          {
            "1": "file",
            "3": 1,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.FileDescriptorProto"
          }
        ]
      },
      {
        "1": "FileDescriptorProto",
        "2": [
          {
            "1": "name",
            "3": 1,
            "4": 1,
            "5": 9
          },
          {
            "1": "package",
            "3": 2,
            "4": 1,
            "5": 9
          },
          {
            "1": "dependency",
            "3": 3,
            "4": 3,
            "5": 9
          },
          {
            "1": "message_type",
            "3": 4,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.DescriptorProto"
          },
          {
            "1": "enum_type",
            "3": 5,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.EnumDescriptorProto"
          },
          {
            "1": "service",
            "3": 6,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.ServiceDescriptorProto"
          },
          {
            "1": "extension",
            "3": 7,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.FieldDescriptorProto"
          },
          {
            "1": "options",
            "3": 8,
            "4": 1,
            "5": 11,
            "6": ".google.protobuf.FileOptions"
          },
          {
            "1": "source_code_info",
            "3": 9,
            "4": 1,
            "5": 11,
            "6": ".google.protobuf.SourceCodeInfo"
          }
        ]
      },
      {
        "1": "DescriptorProto",
        "2": [
          {
            "1": "name",
            "3": 1,
            "4": 1,
            "5": 9
          },
          {
            "1": "doc",
            "3": 8,
            "4": 1,
            "5": 9
          },
          {
            "1": "field",
            "3": 2,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.FieldDescriptorProto"
          },
          {
            "1": "extension",
            "3": 6,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.FieldDescriptorProto"
          },
          {
            "1": "nested_type",
            "3": 3,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.DescriptorProto"
          },
          {
            "1": "enum_type",
            "3": 4,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.EnumDescriptorProto"
          },
          {
            "1": "extension_range",
            "3": 5,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.DescriptorProto.ExtensionRange"
          },
          {
            "1": "options",
            "3": 7,
            "4": 1,
            "5": 11,
            "6": ".google.protobuf.MessageOptions"
          }
        ],
        "3": [
          {
            "1": "ExtensionRange",
            "2": [
              {
                "1": "start",
                "3": 1,
                "4": 1,
                "5": 5
              },
              {
                "1": "end",
                "3": 2,
                "4": 1,
                "5": 5
              }
            ]
          }
        ]
      },
      {
        "1": "FieldDescriptorProto",
        "2": [
          {
            "1": "name",
            "3": 1,
            "4": 1,
            "5": 9
          },
          {
            "1": "doc",
            "3": 9,
            "4": 1,
            "5": 9
          },
          {
            "1": "number",
            "3": 3,
            "4": 1,
            "5": 5
          },
          {
            "1": "label",
            "3": 4,
            "4": 1,
            "5": 14,
            "6": ".google.protobuf.FieldDescriptorProto.Label"
          },
          {
            "1": "type",
            "3": 5,
            "4": 1,
            "5": 14,
            "6": ".google.protobuf.FieldDescriptorProto.Type"
          },
          {
            "1": "type_name",
            "3": 6,
            "4": 1,
            "5": 9
          },
          {
            "1": "extendee",
            "3": 2,
            "4": 1,
            "5": 9
          },
          {
            "1": "default_value",
            "3": 7,
            "4": 1,
            "5": 9
          },
          {
            "1": "options",
            "3": 8,
            "4": 1,
            "5": 11,
            "6": ".google.protobuf.FieldOptions"
          }
        ],
        "4": [
          {
            "1": "Type",
            "2": [
              {
                "1": "TYPE_DOUBLE",
                "2": 1
              },
              {
                "1": "TYPE_FLOAT",
                "2": 2
              },
              {
                "1": "TYPE_INT64",
                "2": 3
              },
              {
                "1": "TYPE_UINT64",
                "2": 4
              },
              {
                "1": "TYPE_INT32",
                "2": 5
              },
              {
                "1": "TYPE_FIXED64",
                "2": 6
              },
              {
                "1": "TYPE_FIXED32",
                "2": 7
              },
              {
                "1": "TYPE_BOOL",
                "2": 8
              },
              {
                "1": "TYPE_STRING",
                "2": 9
              },
              {
                "1": "TYPE_GROUP",
                "2": 10
              },
              {
                "1": "TYPE_MESSAGE",
                "2": 11
              },
              {
                "1": "TYPE_BYTES",
                "2": 12
              },
              {
                "1": "TYPE_UINT32",
                "2": 13
              },
              {
                "1": "TYPE_ENUM",
                "2": 14
              },
              {
                "1": "TYPE_SFIXED32",
                "2": 15
              },
              {
                "1": "TYPE_SFIXED64",
                "2": 16
              },
              {
                "1": "TYPE_SINT32",
                "2": 17
              },
              {
                "1": "TYPE_SINT64",
                "2": 18
              }
            ]
          },
          {
            "1": "Label",
            "2": [
              {
                "1": "LABEL_OPTIONAL",
                "2": 1
              },
              {
                "1": "LABEL_REQUIRED",
                "2": 2
              },
              {
                "1": "LABEL_REPEATED",
                "2": 3
              }
            ]
          }
        ]
      },
      {
        "1": "EnumDescriptorProto",
        "2": [
          {
            "1": "name",
            "3": 1,
            "4": 1,
            "5": 9
          },
          {
            "1": "doc",
            "3": 4,
            "4": 1,
            "5": 9
          },
          {
            "1": "value",
            "3": 2,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.EnumValueDescriptorProto"
          },
          {
            "1": "options",
            "3": 3,
            "4": 1,
            "5": 11,
            "6": ".google.protobuf.EnumOptions"
          }
        ]
      },
      {
        "1": "EnumValueDescriptorProto",
        "2": [
          {
            "1": "name",
            "3": 1,
            "4": 1,
            "5": 9
          },
          {
            "1": "doc",
            "3": 4,
            "4": 1,
            "5": 9
          },
          {
            "1": "number",
            "3": 2,
            "4": 1,
            "5": 5
          },
          {
            "1": "options",
            "3": 3,
            "4": 1,
            "5": 11,
            "6": ".google.protobuf.EnumValueOptions"
          }
        ]
      },
      {
        "1": "ServiceDescriptorProto",
        "2": [
          {
            "1": "name",
            "3": 1,
            "4": 1,
            "5": 9
          },
          {
            "1": "method",
            "3": 2,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.MethodDescriptorProto"
          },
          {
            "1": "doc",
            "3": 4,
            "4": 1,
            "5": 9
          },
          {
            "1": "options",
            "3": 3,
            "4": 1,
            "5": 11,
            "6": ".google.protobuf.ServiceOptions"
          }
        ]
      },
      {
        "1": "MethodDescriptorProto",
        "2": [
          {
            "1": "name",
            "3": 1,
            "4": 1,
            "5": 9
          },
          {
            "1": "doc",
            "3": 5,
            "4": 1,
            "5": 9
          },
          {
            "1": "input_type",
            "3": 2,
            "4": 1,
            "5": 9
          },
          {
            "1": "output_type",
            "3": 3,
            "4": 1,
            "5": 9
          },
          {
            "1": "options",
            "3": 4,
            "4": 1,
            "5": 11,
            "6": ".google.protobuf.MethodOptions"
          }
        ]
      },
      {
        "1": "FileOptions",
        "2": [
          {
            "1": "java_package",
            "3": 1,
            "4": 1,
            "5": 9
          },
          {
            "1": "java_outer_classname",
            "3": 8,
            "4": 1,
            "5": 9
          },
          {
            "1": "java_multiple_files",
            "3": 10,
            "4": 1,
            "5": 8,
            "7": false
          },
          {
            "1": "java_generate_equals_and_hash",
            "3": 20,
            "4": 1,
            "5": 8,
            "7": false
          },
          {
            "1": "optimize_for",
            "3": 9,
            "4": 1,
            "5": 14,
            "6": ".google.protobuf.FileOptions.OptimizeMode",
            "7": "SPEED"
          },
          {
            "1": "cc_generic_services",
            "3": 16,
            "4": 1,
            "5": 8,
            "7": false
          },
          {
            "1": "java_generic_services",
            "3": 17,
            "4": 1,
            "5": 8,
            "7": false
          },
          {
            "1": "py_generic_services",
            "3": 18,
            "4": 1,
            "5": 8,
            "7": false
          },
          {
            "1": "uninterpreted_option",
            "3": 999,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.UninterpretedOption"
          }
        ],
        "4": [
          {
            "1": "OptimizeMode",
            "2": [
              {
                "1": "SPEED",
                "2": 1
              },
              {
                "1": "CODE_SIZE",
                "2": 2
              },
              {
                "1": "LITE_RUNTIME",
                "2": 3
              }
            ]
          }
        ],
        "5": [
          {
            "1": 1000,
            "2": 536870912
          }
        ]
      },
      {
        "1": "MessageOptions",
        "2": [
          {
            "1": "message_set_wire_format",
            "3": 1,
            "4": 1,
            "5": 8,
            "7": false
          },
          {
            "1": "no_standard_descriptor_accessor",
            "3": 2,
            "4": 1,
            "5": 8,
            "7": false
          },
          {
            "1": "uninterpreted_option",
            "3": 999,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.UninterpretedOption"
          }
        ],
        "5": [
          {
            "1": 1000,
            "2": 536870912
          }
        ]
      },
      {
        "1": "FieldOptions",
        "2": [
          {
            "1": "ctype",
            "3": 1,
            "4": 1,
            "5": 14,
            "6": ".google.protobuf.FieldOptions.CType",
            "7": "STRING"
          },
          {
            "1": "packed",
            "3": 2,
            "4": 1,
            "5": 8
          },
          {
            "1": "deprecated",
            "3": 3,
            "4": 1,
            "5": 8,
            "7": false
          },
          {
            "1": "experimental_map_key",
            "3": 9,
            "4": 1,
            "5": 9
          },
          {
            "1": "uninterpreted_option",
            "3": 999,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.UninterpretedOption"
          }
        ],
        "4": [
          {
            "1": "CType",
            "2": [
              {
                "1": "STRING",
                "2": 0
              },
              {
                "1": "CORD",
                "2": 1
              },
              {
                "1": "STRING_PIECE",
                "2": 2
              }
            ]
          }
        ],
        "5": [
          {
            "1": 1000,
            "2": 536870912
          }
        ]
      },
      {
        "1": "EnumOptions",
        "2": [
          {
            "1": "uninterpreted_option",
            "3": 999,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.UninterpretedOption"
          }
        ],
        "5": [
          {
            "1": 1000,
            "2": 536870912
          }
        ]
      },
      {
        "1": "EnumValueOptions",
        "2": [
          {
            "1": "uninterpreted_option",
            "3": 999,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.UninterpretedOption"
          }
        ],
        "5": [
          {
            "1": 1000,
            "2": 536870912
          }
        ]
      },
      {
        "1": "ServiceOptions",
        "2": [
          {
            "1": "uninterpreted_option",
            "3": 999,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.UninterpretedOption"
          }
        ],
        "5": [
          {
            "1": 1000,
            "2": 536870912
          }
        ]
      },
      {
        "1": "MethodOptions",
        "2": [
          {
            "1": "uninterpreted_option",
            "3": 999,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.UninterpretedOption"
          }
        ],
        "5": [
          {
            "1": 1000,
            "2": 536870912
          }
        ]
      },
      {
        "1": "UninterpretedOption",
        "2": [
          {
            "1": "name",
            "3": 2,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.UninterpretedOption.NamePart"
          },
          {
            "1": "identifier_value",
            "3": 3,
            "4": 1,
            "5": 9
          },
          {
            "1": "positive_int_value",
            "3": 4,
            "4": 1,
            "5": 4
          },
          {
            "1": "negative_int_value",
            "3": 5,
            "4": 1,
            "5": 3
          },
          {
            "1": "double_value",
            "3": 6,
            "4": 1,
            "5": 1
          },
          {
            "1": "string_value",
            "3": 7,
            "4": 1,
            "5": 12
          },
          {
            "1": "aggregate_value",
            "3": 8,
            "4": 1,
            "5": 9
          }
        ],
        "3": [
          {
            "1": "NamePart",
            "2": [
              {
                "1": "name_part",
                "3": 1,
                "4": 2,
                "5": 9
              },
              {
                "1": "is_extension",
                "3": 2,
                "4": 2,
                "5": 8
              }
            ]
          }
        ]
      },
      {
        "1": "SourceCodeInfo",
        "2": [
          {
            "1": "location",
            "3": 1,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.SourceCodeInfo.Location"
          }
        ],
        "3": [
          {
            "1": "Location",
            "2": [
              {
                "1": "path",
                "3": 1,
                "4": 3,
                "5": 5,
                "8": {
                  "1": "STRING",
                  "2": true,
                  "3": false
                }
              },
              {
                "1": "span",
                "3": 2,
                "4": 3,
                "5": 5,
                "8": {
                  "1": "STRING",
                  "2": true,
                  "3": false
                }
              }
            ]
          }
        ]
      }
    ],
    "8": {
      "1": "com.google.protobuf",
      "8": "DescriptorProtos",
      "9": 1,
      "10": false,
      "16": false,
      "17": false,
      "18": false,
      "20": false
    }
  },
  {
    "1": "google/protobuf/compiler/plugin.proto",
    "2": "google.protobuf.compiler",
    "3": [
      "google/protobuf/descriptor.proto"
    ],
    "4": [
      {
        "1": "CodeGeneratorRequest",
        "2": [
          {
            "1": "file_to_generate",
            "3": 1,
            "4": 3,
            "5": 9
          },
          {
            "1": "parameter",
            "3": 2,
            "4": 1,
            "5": 9
          },
          {
            "1": "proto_file",
            "3": 15,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.FileDescriptorProto"
          }
        ]
      },
      {
        "1": "CodeGeneratorResponse",
        "2": [
          {
            "1": "error",
            "3": 1,
            "4": 1,
            "5": 9
          },
          {
            "1": "file",
            "3": 15,
            "4": 3,
            "5": 11,
            "6": ".google.protobuf.compiler.CodeGeneratorResponse.File"
          }
        ],
        "3": [
          {
            "1": "File",
            "2": [
              {
                "1": "name",
                "3": 1,
                "4": 1,
                "5": 9
              },
              {
                "1": "insertion_point",
                "3": 2,
                "4": 1,
                "5": 9
              },
              {
                "1": "content",
                "3": 15,
                "4": 1,
                "5": 9
              }
            ]
          }
        ]
      }
    ],
    "8": {
      "1": "com.google.protobuf.compiler",
      "8": "PluginProtos"
    }
  }
];


},{}],10:[function(require,module,exports){
/**
 * Represents a compiled protobuf message
 * Messages are introspective so you can discover the field definitions at runtime
 * @module protob/message
 */
var _ = require('underscore'),
    MESSAGE = "MESSAGE",
    goog = require('./compiler/google-protos-defn'),
    registry = require('./registry'),
    coorcers = require('./compiler/coorcers').coorcers,
    ByteBuffer = require('./protob').ByteBuffer,
    Protob     = require('./protob').Protob,
    decoders   = require('./compiler/decoders').decoders,
    encoders   = require('./compiler/encoders').encoders,
    EnumValue  = require('./enum').EnumValue,
    sortBy     = require('./util').Util.sortBy;

function isBlank(val) {
  return val === undefined || val === null;
}

/**
 * The base class for all compiled protobuf messages.
 * Message instances may have additional fields to what is defined in the .proto file (dynamic fields)
 * but these fields are ignored when encoding.
 *
 * Once a Message is compiled, it may have it's definition updated, but it will still be the same constructor function instance.
 * Messages may have any behavior needed added to them by extending them, but should be careful not to name these fields by the same
 * name as defined in the protobuf definition.
 *
 * @param {object} [opts] - An object with values corresponding to instance attributes. All attributes wil be made available on the instance.
 * @constructor
 *
 * @example
 *    var MyMessage = Protob.registry.lookup('some.package.MyMessage');
 *
 *    var myMessage = new MyMessage({with: "some", field: "values"});
 *    myMessage.getf('some_field');
 *    myMessage.getf('some_field', 'from_some_package');
 *    myMessage.setf('a value', 'some_field');
 *    myMessage.setf('a value', 'some_field', 'from_some_package');
 *    myMessage.asJSON();
 */
function Message(opts) {
  opts = opts || {};
  var self = this;

  this.setDefaults();

  // Set the values passed in on this object
  Object.getOwnPropertyNames(opts).forEach(function(name){
    self.setf(opts[name], name);
  });

  // Apply all after initializers on this message
  [Message.afterInitialize, this.constructor.afterInitialize].forEach(function(funcs) {
    if ( !funcs ) { return; }
    funcs.forEach(function(func) { func.call(self); });
  });
};

/**
 * A collection of functions to run after each message is initialized. This is global to all Messages.
 * Each individual message class will also get afterInitialize array that will be run on each create
 * Be careful setting these. These are run on every instantiation of protobuf messages
 * @public
 */
Message.afterInitialize = [];

Message.isService = function() { return false; };
Message.isMessage = function() { return true; };
Message.isEnum = function() { return false; };

Message.prototype.isService = function() { return false; };
Message.prototype.isMessage = function() { return true; };
Message.prototype.isEnum = function() { return false; };

/**
 * When a protocol buffer is compiled from .json A new message class is created by inheriting from Message.
 * The updateDescriptor is then called with the raw descriptor that came from the .json file.
 * This descriptor maps to a google.protobuf.DescriptorProto using field ids as the keys fo the object
 *
 * Update descriptor augments the constructor function with information about
 *
 * Do not call this method directly
 *
 * @param {object} desc - An instance of google.protobuf.DescriptorProto
 * @private
 */
Message.updateDescriptor = function(desc) {
  var self = this,
      dp = goog.descriptorProto;

  /** @member {google.protobuf.DescriptorProto} - the descriptor defining this message */
  this.descriptor = desc;

  /** @member {string} - the name of the object. This is the final name only and does not include package information */
  this.clazz = desc[dp.NAME];

  // TODO remove this if we don't need it
  // this.extensions     = this.extension;

  /** @member {string} - The full name, including package of this object */
  this.fullName       = this.parent + "." + this.clazz;

  this.reset = Message.reset;

  this.finalize = Message.finalize;

  /** Decodes messages for this class */
  this.decode = Message.decode;

  /** Encodes messages for this class */
  this.encode = Message.encode;

  this.fieldCache = {};

  // Add this message to to the finalizers so that we get a chance to finish up at the end of the compilation
  registry._addFinalize(this.fullName);
};

/**
 * Reset the descriptor
 * @private
 */
Message.reset = function(force) {
  /** @member {object} - A map of fields by id */
  this.fieldsById   = (force ? {} : this.fieldsById || {});

  this.fieldIds = (force ? [] : this.fieldIds || []);

  /** @member {object} - A map of fields by package */
  this.fieldsByPkg  = (force ? {undefined: []} : this.fieldsByPkg || {undefined: []});

  /** @member {array} - A collection of fields in ascending id order */
  this.orderedFields = (force ? [] : this.orderedFields || []);

  this.fieldCache = {};

  this.prototype.setDefaults = Message.prototype.setDefaults;
};

/**
 * Expands out all descriptors on this message
 * Looks at the type of the message, and attaches the relevant constructor to the descriptor
 * @param {google.protobuf.DescriptorProto} descriptor - The descriptor proto for the message
 * @private
 */
function expandDescriptors(descriptor) {
  var TYPE  = registry.lookup('google.protobuf.FieldDescriptorProto.Type'),
      LABEL = registry.lookup('google.protobuf.FieldDescriptorProto.Label'),
      dp = goog.descriptorProto,
      fd = goog.fieldDescriptorProto;

  (descriptor[dp.FIELD] || []).forEach(function(field) {
    if(field.expandedForProtob) return;
    var label = field[fd.LABEL],
        type  = field[fd.TYPE],
        typeName = field[fd.TYPE_NAME];

    if(typeName) typeName = typeName.replace(/^./, '');
    field[fd.TYPE_NAME] = typeName;

    if(label && label.number) label = label.number;

    field.repeated = LABEL.fetch(label) == LABEL.fetch("LABEL_REPEATED");
    field.required = LABEL.fetch(label) == LABEL.fetch("LABEL_REQUIRED");
    var type = TYPE.fetch(type || type.name);
    field.fieldType = type.name;
    if ( type.name == 'TYPE_MESSAGE' || type.name == 'TYPE_ENUM') {
      field.concrete   = registry.lookup(typeName);
      field.descriptor = registry.lookup(typeName).descriptor;
    }
    field.expandedForProtob = true;
  });
};

/**
 * Finalizes the message descriptor and message marking it complete
 * @private
 */
Message.finalize = function(force) {

  var DescriptorProto = registry.lookup('google.protobuf.DescriptorProto'),
      dp = goog.descriptorProto,
      fd = goog.fieldDescriptorProto,
      desc = this.descriptor,
      self = this,
      fields;

  if(!desc instanceof DescriptorProto) desc = this.descriptor = new DescriptorProto(desc);
  fields = desc[dp.FIELD] || [];

  if(desc.concrete && self.fieldIds && self.fieldIds.length === fields.length) return;

  var TYPE  = registry.lookup('google.protobuf.FieldDescriptorProto.Type'),
      FieldDescriptor = registry.lookup('google.protobuf.FieldDescriptorProto'),
      sortFields = sortBy(fd.NUMBER);//function(a,b) {
        // var _a = a[fd.NUMBER],
        //     _b = b[fd.NUMBER];
        // if ( _a < _b) {
        //   return -1;
        // } else if (_a > _b) {
        //   return 1;
        // } else {
        //   return 0;
        // }
      // };

  this.reset(force);

  self.fieldsById = {};
  self.fieldsByPkg = { undefined: [] };
  self.fieldIds = [];

  fields = fields.map(function(field) {
    if (!(field instanceof FieldDescriptor)) field =  new FieldDescriptor(field);

    var number = field[fd.NUMBER],
        name = field[fd.NAME],
        label = field[fd.LABEL],
        extendee = field[fd.EXTENDEE],
        pkgFields = self.fieldsByPkg[field.pkg] = self.fieldsByPkg[field.pkg] || [];

    self.fieldIds.push(number);
    self.fieldsById[number] = field;
    pkgFields.push(field);

    return field;
  });

  self.fieldIds = self.fieldIds.sort();
  desc[dp.FIELD] = fields;

  // Setup the ordered fields so that they are able
  // to be laid out on the wire
  this.orderedFields = self.fieldIds.map(function(id) { return self.fieldsById[id]; }); //fields.sort(sortFields);

  this.type = TYPE.fetch("TYPE_MESSAGE");
  this.descriptor.concrete = this;

  expandDescriptors(desc);
};

/**
 * Gets the value for a field that has been set
 * @param {string} fieldNameOrNumber - The field name or number that identifies the field
 * @param {string} [pkg] - The package name that the field comes from. Use for extensions
 * @return {any} - The value of this field
 */
Message.prototype.getf = function(fieldNameOrNumber, pkg) {
  if(!registry.googleCompiled) return this[fieldNameOrNumber];

  var field = this.getProtoField(fieldNameOrNumber, pkg),
      fd = goog.fieldDescriptorProto;

  if(!field) return undefined;

  var val = this[field[fd.NUMBER]];
  if(!val && field.repeated) this[field[fd.NUMBER]] = [];
  return this[field[fd.NUMBER]];
};

/**
 * Set a proto message field value
 * Coorces on setting
 * @param {string} fieldNameOrNumber - The name or number of the field
 * @param {string} pkg - An optional package name. This can be left blank if the field is not an extension
 * @param {any} value - The value to set for the field. This should be of the correct type to be coorced for this value.
 * @return {this} - returns this so that sets can be chained
 */
Message.prototype.setf = function(value, fieldNameOrNumber, pkg) {
  if(!registry.googleCompiled) {
    // This is just for the initial google things
    this[fieldNameOrNumber] = value;
    return this;
  }

  var field = this.getProtoField(fieldNameOrNumber, pkg),
      fd = goog.fieldDescriptorProto,
      self = this;

  if(!field) {
    // Need to handle unknown fields
    this[fieldNameOrNumber] = value;
  } else {
    var id = field[fd.NUMBER],
        label = field[fd.LABEL];

    if(label && label.number) label = label.number;

    if(field.repeated) { //label == fd.label.LABEL_REPEATED) {
      this[id] = [];
      if(!value) return;
      if(!Array.isArray(value)) value = [value];

      value.forEach(function(val) {
        self[id].push(field.coerce(self, val, {}));
      });

    } else {
      this[id] = field.coerce(this, value, {});
    }
  }

  return this;
};

/**
 * Updates many field values at once. All fields should be within the messages own package and should not be extensions
 * @param {object} obj - The object to update the values to
 * @return {this} - return this for method chaining
 */
Message.prototype.updateValues = function(obj) {
  var self = this;
  Object.keys.forEach(function(key) { self.setf(value, key); });
  return self;
};

/**
 * Checks to see if the field is set
 * @param {string} fieldNameOrNumber - The field name or number
 * @param {string} [pkg] - The package name for the field. Should only use for extensions
 * @return {boolean} - Returns true if the field has been set, even if it is not truthy
 */
Message.prototype.isFieldSet = function(fieldNameOrNumber, pkg) {
  var field = this.getProtoField(fieldNameOrNumber, pkg),
      fd = goog.fieldDescriptorProto;

  if(!field) return false;
  return this.hasOwnProperty(field[fd.NUMBER]);
}

/**
 * fetch the field definition for a field
 * @private
 */
Message.prototype.getProtoField = function(nameOrNumber, pkg) {
  var key = '' + nameOrNumber + '#' + pkg,
      constructor = this.constructor,
      fieldCache = constructor.fieldCache,
      fd = goog.fieldDescriptorProto;

  if(fieldCache.hasOwnProperty(key)) return fieldCache[key];

  if(constructor.fieldsById[nameOrNumber]) {
    fieldCache[key] = constructor.fieldsById[nameOrNumber];
    return fieldCache[key];
  }

  pkg = pkg || undefined;

  if(!constructor.fieldsByPkg[pkg]) throw new Error('Package ' + pkg + ' not found for ' + this.constructor.fullName);

  fieldCache[key] = constructor.fieldsByPkg[pkg].filter(function(f) {
    return f[fd.NUMBER] == nameOrNumber || f[fd.NAME] == nameOrNumber;
  })[0];

  return fieldCache[key];
};

/**
 * Fetches the full EnumValue for a field given it's current value.
 * @param {string} fieldName - The name of the field to fetch the current EnumValue for
 * @return {Protob.EnumValue|undefined} - The current value of the enum field
 */
Message.prototype.enumFor = function(fieldNameOrNumber, pkg) {
  var field = this.getProtoField(fieldNameOrNumber, pkg),
      fd = goog.fieldDescriptorProto,
      val = this.getf(fieldNameOrNumber, pkg);

  if(!field){ throw new Error('Field ' + fieldNameOrNumber + ' not defined'); }
  if(!field[fd.TYPE] == 'TYPE_ENUM') throw new Error('Field ' + fieldNameorNumber + ' is not an enum');

  return val;
}

/**
 * Fetches the current numeric value of the specified enum value
 * @param {string} fieldNameOrNumber - The name or number of the enum field
 * @return {integer} - The protobuf id of the field
 */
Message.prototype.enumValue = function(fieldNameOrNumber, pkg){
  var _enum = this.enumFor(fieldNameOrNumber, pkg),
      ed = goog.enumValueDescriptorProto;

  return _enum && _enum.number;
};

/**
 * Fetches the current name value of the specified enum value
 * @param {string} fieldNameOrNumber - The name or number of the field
 * @return {string} - The name of the EnumValue
 */
Message.prototype.enumName = function(fieldNameOrNumber, pkg){
  var _enum = this.enumFor(fieldNameOrNumber, pkg),
      ed = goog.enumValueDescriptorProto;

  return _enum && _enum.name;
}

/**
 * Sets the default values on the message as defined by any defaults in the proto definition
 * This is called by the initializer
 * @private
 */
Message.prototype.setDefaults = function(){
  var dp = goog.descriptorProto,
      fd = goog.fieldDescriptorProto;

  if(!this.constructor.descriptor) { return; }
  if(!this.constructor.descriptor[dp.FIELD]) { return; }

  var fields = (this.constructor.orderedFields || []).filter(function(f) {
    return f.hasOwnProperty(fd.DEFAULT_VALUE);
  });

  this.constructor.prototype.setDefaults = function() {
    for(var i=0; i<fields.length; i++){
      if(this.isFieldSet(fields[i][fd.NUMBER])) continue;
      this.setf(fields[i][fd.DEFAULT_VALUE], fields[i][fd.NUMBER]);
    }
  };
  this.setDefaults();
};

/**
 * Renders the message as a JSON compatible object
 * @param {object} [opts] - An options hash
 * @param {Array<string>} [opts.extensions] - Only render fields that this message owns and the extensions listed explicitly. Default all.
 * @param {bool} [opts.enumsAsValues] - Output enums as names by default, if this is true, render enums as values instead.
 * @param {bool} [opts.longsAsInts] - By default longs are rendered as strings, but this option allows for having them rendered as ints
 * @param {bool} [opts.fieldsAsNumbers] - By default, field names are used. Set this to true to have field ids used instead
 * @return {pojo} - A pojo with fields set by name
 */
Message.prototype.asJSON = function(opts) {
  var Klass = this.constructor,
      out = {},
      self = this,
      fd = goog.fieldDescriptorProto;

  opts = opts || {};

  function setField(field) {
    var fieldNumber = field[fd.NUMBER],
        fieldName = field[fd.NAME],
        id = (opts.fieldsAsNumbers ? fieldNumber : fieldName),
        val;

    if(!field.repeated && !self.isFieldSet(fieldNumber)) return;

    val = self.getf(fieldNumber);
    if(!val) {
      out[id] = val;
      return;
    } else {
      if(fieldIsEnum(field)) {
        if(field.repeated) {
          out[id] = val.map(function(v) { return (opts.enumsAsValues ? v.number : v.name); });
        } else {
          out[id] = (opts.enumsAsValues ? val.number : val.name);
        }
      } else if(fieldIsMessage(field)) {
        if(field.repeated) {
          out[id] = val.map(function(v) { return (v.asJSON ? v.asJSON(opts) : v); });
        } else {
          out[id] = (val.asJSON ? val.asJSON(opts) : val);
        }
      } else if(fieldIsLong(field)) {
        if(field.repeated) {
          out[id] = val.map(function(v) { return (opts.longsAsInts ? v.toNumber() : v.toString()); });
        } else {
          out[id] = (opts.longsAsInts ? val.toNumber() : val.toString());
        }
      } else {
        out[id] = val;
      }
    }
  }

  (Klass.fieldsByPkg[undefined] || []).forEach(setField);

  var extensionPkgs = opts.extensions;

  if(!extensionPkgs) extensionPkgs = Object.keys(Klass.fieldsByPkg);

  extensionPkgs.forEach(function(pkg) {
    if(!pkg || pkg == 'undefined') return;
    var fields = Klass.fieldsByPkg[pkg];
    fields.forEach(setField);
  });
  return out;
};

function fieldIsEnum(field) {
  if(!field) return false;
  return field.fieldType == 'TYPE_ENUM';
}

function fieldIsMessage(field) {
  if(!field) return false;
  return field.fieldType == 'TYPE_MESSAGE';
}

var IS_LONG = /64$/;
function fieldIsLong(field) {
  if(!field) return false;
  return IS_LONG.test(field.fieldType);
}


/**
 * Fetch the field with the given id
 * @param {integer} id - The id of the field as specified in the proto file
 * @return {object|undefined} - The field definition
 */
Message.prototype.fieldById = function(id) {
  return this.constructor.fieldsById[id];
};

/**
 * Decodes a buffer into an instantiated protocolbuffer message
 * This method is attached to each messages constructor
 * @param {ByteBuffer} buffer - The byte buffer holding the encoded protobuf message
 * @param {integer} [length] - The length we're up to
 * @param {object} [opts] - An options hash
 * @see Message#decode
 * @example
 *     MyMessage.decode(buffer);
 * @return {Protob.Message}
 * @throws - Will throw if it cannot decode the message
 */
Message.decode = function(buffer, length, opts){
  if(typeof length === 'object' && !opts) {
    opts = length;
    length = undefined;
  }

  buffer = buffer ? (buffer instanceof ByteBuffer ? buffer : ByteBuffer.wrap(buffer)) : new ByteBuffer();
  var le = buffer.littleEndian;
  try {
    var msg = (new this()).decode(buffer.LE(), length, opts);
    buffer.littleEndian = le;
    return msg;
  } catch (e) {
    buffer.littleEndian = le;
    throw(e);
  }
};

/**
 * Decodes the raw protobuf message into this instance
 * @param {ByteBuffer} buffer - The buffer to get the objects from
 * @param {integer} length - The length of the buffer to read
 * @param {object} [opts] - Options passed to the decoder functions
 */
Message.prototype.decode = function(buffer, length, opts) {
  length = typeof length === 'number' ? length : -1;
  opts = opts || {};

  var self = this,
      start = buffer.offset,
      msg = new (this.constructor)(),
      fd = goog.fieldDescriptorProto,
      fo = goog.fieldOptions,
      tag, wireType, id, field, fieldWireType;

  while (buffer.offset < start+length || (length == -1 && buffer.remaining() > 0)) {
    tag = buffer.readVarint32();
    wireType = tag & 0x07;
    id = tag >> 3;
    field = this.fieldById(id); // Message.Field only

    if (!field) {
        // "messages created by your new code can be parsed by your old code: old binaries simply ignore the new field when parsing."
       switch (wireType) {
         case Protob.WIRE_TYPES.VARINT:
           buffer.readVarint32();
           break;
          case Protob.WIRE_TYPES.BITS32:
            buffer.offset += 4;
            break;
          case Protob.WIRE_TYPES.BITS64:
            buffer.offset += 8;
            break;
          case Protob.WIRE_TYPES.LDELIM:
            var len = buffer.readVarint32();
            buffer.offset += len;
            break;
          case ProtoBuf.WIRE_TYPES.STARTGROUP:
              while (skipTillGroupEnd(id, buffer)) {}
              break;
          default:
            throw(new Error("Illegal wire type of unknown field "+id+" in "+this.constructor.fullName+"#decode: "+wireType) + " Possible extension collsion.");
        }
      continue;
    }

    if (field.repeated && (!field[fd.OPTIONS] || !field[fd.OPTIONS][fo.PACKED])) {
      msg[field[fd.NUMBER]] = msg[field[fd.NUMBER]] || [];
      msg[field[fd.NUMBER]].push(decoders.field(wireType, buffer, false, field, opts));
    } else {
      msg[field[fd.NUMBER]] = decoders.field(wireType, buffer, false, field, opts);
    }
  }

  // Check if all required fields are present
  this.constructor.orderedFields.forEach( function(field) {
    if(field.required && !msg.isFieldSet(field[fd.NUMBER])) {
      var err = new Error("Missing field `"+field[fd.NAME]+"`");
      err.decoded = msg;
      throw err;
    }

    var TYPE  = registry.lookup('google.protobuf.FieldDescriptorProto.Type'),
        dp = goog.descriptorProto,
        evd = goog.enumValueDescriptorProto,
        type = TYPE.fetch(field[fd.TYPE]);

    // convert the default_value (if any) to the proper type
    if (field[fd.DEFAULT_VALUE] && type.name != 'TYPE_ENUM' && type.name != 'TYPE_MESSAGE' && !msg.isFieldSet(field[fd.NUMBER])) {
      msg[field[fd.NUMBER]] = coorcers[type.name](msg[field[fd.NAME]]).call(self, field[fd.DEFAULT_VALUE]);
    }

  });
  return msg;
};


/**
 * Skips all data until the end of the specified group has been reached.
 * @param {number} expectedId Expected GROUPEND id
 * @param {!ByteBuffer} buf ByteBuffer
 * @returns {boolean} `true` if a value as been skipped, `false` if the end has been reached
 * @throws {Error} If it wasn't possible to find the end of the group (buffer overrun or end tag mismatch)
 * @inner
 */
function skipTillGroupEnd(expectedId, buf) {
  var tag = buf.readVarint32(), // Throws on OOB
      wireType = tag & 0x07,
      id = tag >> 3;
  switch (wireType) {
      case Protob.WIRE_TYPES.VARINT:
          do tag = buf.readUint8();
          while ((tag & 0x80) === 0x80);
          break;
      case Protob.WIRE_TYPES.BITS64:
          buf.offset += 8;
          break;
      case Protob.WIRE_TYPES.LDELIM:
          tag = buf.readVarint32(); // reads the varint
          buf.offset += tag;        // skips n bytes
          break;
      case Protob.WIRE_TYPES.STARTGROUP:
          skipTillGroupEnd(id, buf);
          break;
      case Protob.WIRE_TYPES.ENDGROUP:
          if (id === expectedId)
              return false;
          else
              throw Error("Illegal GROUPEND after unknown group: "+id+" ("+expectedId+" expected)");
      case Protob.WIRE_TYPES.BITS32:
          buf.offset += 4;
          break;
      default:
          throw Error("Illegal wire type in unknown group "+expectedId+": "+wireType);
  }
  return true;
}


/**
 * Encode a protocol buffer message.
 *
 * Usually used by calling the instance version
 *
 * @param {Protob.Message} message - The instance to encode
 * @param {ByteBuffer} [buffer] - The buffer to encode into
 * @throws Error - When the protocol buffer is invalid
 * @return {ByteBuffer} - The encoded message
 * @see Message#encode
 * @private
 * @example
 *   msg = new MyMessage({foo: 'bar'})
 *   raw = Message.encode(msg);
 */
Message.encode = function(message, buffer){
  buffer = buffer || new ByteBuffer();
  var le = buffer.littleEndian;
  try {
    if ( !(message instanceof this) ) { message = new this(message); }
    return message.encode(buffer.LE()).flip().LE(le);
  } catch (e) {
    console.error(e);
    buffer.LE(le);
    throw(e);
  }
};

/**
 * Encode the message, optionally to a buffer
 * @param {ByteBuffer} buffer - The buffer to encode into. Usually you won't use this.
 *
 * @throws Error - When the message is invalid
 * @example
 *    msg = new MyMessage({foo: 'bar'});
 *    buf = msg.encode();
 *
 * @return {ByteBuffer} - The encoded message
 */
Message.prototype.encode = function(buffer) {
  if ( !buffer ) { return this.constructor.encode(this); }

  var fieldIds = this.constructor.fieldIds,
      constructor = this.constructor,
      self = this,
      dp = goog.descriptorProto,
      fd = goog.fieldDescriptorProto,
      fieldEncoder = encoders.field;

  // Ensure required fields are present before encoding
  fieldIds.forEach(function(id) {
    var field = constructor.fieldsById[id];

    if(field.required && !self.isFieldSet(id)) {
      var err = new Error("Missing at least one required field for "+self.constructor.fullName+": "+field[fd.NAME]);
      throw(err);
    }

    if(isBlank(self.getf(id))) return;
    field.encode(self.getf(id), buffer);
  });

  return buffer;
};

exports.Message = Message;

},{"./compiler/coorcers":4,"./compiler/decoders":5,"./compiler/encoders":6,"./compiler/google-protos-defn":7,"./enum":8,"./protob":11,"./registry":12,"./util":15,"underscore":60}],11:[function(require,module,exports){
(function (global){
/**
 * Provides protocol buffer support for Node.js
 * Protob includes a proto buffer compiler `proto-gen-json` and uses the output to dynamically construct Javascript objects
 * that implement these definitions.
 *
 * Protob provides support for:
 *
 * <ul>
 *   <li>Converting .proto files to json definitions using protoc</li>
 *   <li>Dynamic loading</li>
 *   <li>64 bit support (Long.js && ByteBuffer.js)</li>
 *   <li>Reflection and introspection</li>
 *   <li>Messages</li>
 *   <li>Enums</li>
 *   <li>Services</li>
 *   <li>Extensions</li>
 * </ul>
 *
 * RPC handling is outside the scope of Protob. These schemes vary wildly between usecases and so should be implmeneted at a different layer.
 *
 * This library took inspiration from protobuf.js and borrows some code from there (with changes).
 * Thanks to the protobuf.js maintainers.
 *
 * @module protob
 */
var ByteBuffer = require('bytebuffer'),
    Path = require('path');

/**
 * Fetches a cache from the global object for protobuf definitions to be stored on
 * @private
 */
function fetchProtobCache(){
  var cache;
  if(typeof window == 'undefined') {
    global.protob = global.protob || {};
    cache = global.protob;
  } else {
    window.protob = window.protob || {};
    cache = window.protob;
  }

  return cache;
}

/**
* The Protob namespace.
* @exports Protob
* @namespace
* @expose
*/
var Protob = {};

/**
 * Protob.js version.
 * @type {string}
 * @const
 * @expose
 */
Protob.VERSION = require('./version');

/**
 * Wire types.
 * @type {Object.<string,number>}
 * @const
 * @expose
 */
Protob.WIRE_TYPES = {};

/**
 * Varint wire type.
 * @type {number}
 * @expose
 */
Protob.WIRE_TYPES.VARINT = 0;

/**
 * Fixed 64 bits wire type.
 * @type {number}
 * @const
 * @expose
 */
Protob.WIRE_TYPES.BITS64 = 1;

/**
 * Length delimited wire type.
 * @type {number}
 * @const
 * @expose
 */
Protob.WIRE_TYPES.LDELIM = 2;

/**
 * Start group wire type.
 * @type {number}
 * @const
 * @deprecated Not supported.
 * @expose
 */
Protob.WIRE_TYPES.STARTGROUP = 3;

/**
 * End group wire type.
 * @type {number}
 * @const
 * @deprecated Not supported.
 * @expose
 */
Protob.WIRE_TYPES.ENDGROUP = 4;

/**
 * Fixed 32 bits wire type.
 * @type {number}
 * @const
 * @expose
 */
Protob.WIRE_TYPES.BITS32 = 5;

Protob.PACKABLE_WIRE_TYPES = [
    Protob.WIRE_TYPES.VARINT,
    Protob.WIRE_TYPES.BITS64,
    Protob.WIRE_TYPES.BITS32
];

/**
 * Types.
 * @dict
 * @type {Object.<string,{name: string, wireType: number}>}
 * @const
 * @expose
 */
Protob.TYPES = {
    // According to the protobuf spec.
    "TYPE_INT32": {
        name: "int32",
        wireType: Protob.WIRE_TYPES.VARINT
    },
    "TYPE_UINT32": {
        name: "uint32",
        wireType: Protob.WIRE_TYPES.VARINT
    },
    "TYPE_SINT32": {
        name: "sint32",
        wireType: Protob.WIRE_TYPES.VARINT
    },
    "TYPE_INT64": {
        name: "int64",
        wireType: Protob.WIRE_TYPES.VARINT
    },
    "TYPE_UINT64": {
        name: "uint64",
        wireType: Protob.WIRE_TYPES.VARINT
    },
    "TYPE_SINT64": {
        name: "sint64",
        wireType: Protob.WIRE_TYPES.VARINT
    },
    "TYPE_BOOL": {
        name: "bool",
        wireType: Protob.WIRE_TYPES.VARINT
    },
    "TYPE_DOUBLE": {
        name: "double",
        wireType: Protob.WIRE_TYPES.BITS64
    },
    "TYPE_STRING": {
        name: "string",
        wireType: Protob.WIRE_TYPES.LDELIM
    },
    "TYPE_BYTES": {
        name: "bytes",
        wireType: Protob.WIRE_TYPES.LDELIM
    },
    "TYPE_FIXED32": {
        name: "fixed32",
        wireType: Protob.WIRE_TYPES.BITS32
    },
    "TYPE_SFIXED32": {
        name: "sfixed32",
        wireType: Protob.WIRE_TYPES.BITS32
    },
    "TYPE_FIXED64": {
        name: "fixed64",
        wireType: Protob.WIRE_TYPES.BITS64
    },
    "TYPE_SFIXED64": {
        name: "sfixed64",
        wireType: Protob.WIRE_TYPES.BITS64
    },
    "TYPE_FLOAT": {
        name: "float",
        wireType: Protob.WIRE_TYPES.BITS32
    },
    "TYPE_ENUM": {
        name: "enum",
        wireType: Protob.WIRE_TYPES.VARINT
    },
    "TYPE_MESSAGE": {
        name: "message",
        wireType: Protob.WIRE_TYPES.LDELIM
    }
};
/**
* @type {?Long}
*/
Protob.Long = ByteBuffer.Long;
Protob.ByteBuffer = ByteBuffer;

/**
 * A registry of compiled protocol buffer objects
 * Each object is keyed by it's protocol buffer name (including package) and each value is the constructor.
 * @type {object.<string,Protob.Message>}
 * @example
 *    var registry = require('protob').Protob.registry,
 *        fileDescriptor = new registry.lookup('google.protobuf.FileDescriptor')();
 * @expose
 */

exports.Protob = Protob;
exports.ByteBuffer = ByteBuffer;

exports.registry = require('./registry');
Protob.registry = exports.registry;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./registry":12,"./version":16,"bytebuffer":38,"path":26}],12:[function(require,module,exports){
(function (global){
/**
 * Maintains a registry of all known protocol buffer object definitions.
 * This registry is a global registry that spans versions. Protob should be included at the top level
 */
var cache, REGISTRY,
    goog = require('./compiler/google-protos-defn');

if(typeof window == 'undefined') {
  global.protob = global.protob || {};
  cache = global.protob;
} else {
  window.protob = window.protob || {};
  cache = window.protob;
}

if(cache.registry) {
  module.exports = cache.registry;
  return;
} else {
  var registry = {},
      extensions = {},
      awaitingFinalizers = [];

  /**
   * The registry of all protocol buffer objects that have been compiled
   * @constructor
   */
  function Registry() { }

  /**
   * Resets the registry and clears all related information. Useful for testing.
   * @private
   */
  Registry.prototype.reset = function() {
    awaitingFinalizers = [];
    registry = {};
    extensions = {};
    require('./compiler').Compiler.reset();
    this.compileGoogleDescriptors();
  }

  /**
   * Provides a scope for accessing information from the registry. 
   * This is a convenience and does not need to be used
   * Scopes can be created before anything is registered, and is only evealuated when a lookup is performed
   * @example
   *    myPackage = registry.scope('my.package')
   *    NestedObject = myPackage.lookup('some.NestedObject');
   *
   * @param {string} name - The name of the package to create the scope for. Can be a sub package if coming from another scope
   * @param {Scope} parentScope - The parent scope to create this scope from
   * @constructor
   */
  function Scope(name, parentScope) {
    if(parentScope) {
      this.name = [parentScope.name, name].join('.');
    } else {
      /** @member {string} - the name of the scope */
      this.name = name;
    }
  }

  /**
   * Create a new scope based off this one. This will be a child scope of the current scope
   * @param {string} name - The name of the sub-scope to create
   * @example
   *     scope = myScope.scope('other.package')
   * @public
   */
  Scope.prototype.scope = function(name) { return new Scope(name, this); };

  /**
   * Lookup an object stored in the registry using the current scope as the starting place
   * @param {string} name - The name of the object within this scope
   * @example
   *  scope = registry.scope('my.scope')
   *  scope.lookup('MyObject') // fetch my.scope.MyObject
   * @public
   */
  Scope.prototype.lookup = function(name) { 
    return REGISTRY.lookup([this.name, name].join('.'));
  };

  /**
   * List all keys in the registry under the current scope
   * @public
   */
  Scope.prototype.keys = function() {
    var keys = [],
        self = this,
        name = this.name,
        ln = this.name.length;

    Object.keys(registry).forEach(function(key) {
      if(key.substr(0, ln) == name) keys.push(key.substr(ln, key.length).replace(/^\./, ''));
    });
    return keys;
  };

  /**
   * List all keys in the registry under the current scope, but retain their full scope
   * @public
   */
  Scope.prototype.fullKeys = function() {
    var keys = this.keys(),
        self = this;

    return keys.map(function(k) { return (self.name ? self.name + '.' + k : k); });
  };

  function extractType(mtd) {
    return function() {
      var keys = this.fullKeys(),
          acc = [];
      keys.forEach(function (key) {
         var thing = REGISTRY.lookup(key);
         if (thing[mtd]()) acc.push(thing);
      });
      return acc;
    }
  }

  Registry.prototype.services = extractType('isService');
  Registry.prototype.enums = extractType('isEnum');
  Registry.prototype.messages = extractType('isMessage');
  Registry.prototype.serviceNames = function() { return this.services().map(function(s) { return s.fullName; }); };
  Registry.prototype.enumNames    = function() { return this.enums().map(function(e) { return e.fullName; }); };
  Registry.prototype.messageNames = function() { return this.messages().map(function(m) { return m.fullName; }); };

  Scope.prototype.services = extractType('isService');
  Scope.prototype.enums = extractType('isEnum');
  Scope.prototype.messages = extractType('isMessage');
  Scope.prototype.serviceNames = Registry.prototype.serviceNames;
  Scope.prototype.enumNames = Registry.prototype.enumNames;
  Scope.prototype.messageNames = Registry.prototype.messageNames;

  /**
   * Lookup an object in the registry
   * @example
   *     registry.lookup('my.package.MyObject');
   *
   * @return - an object from the registry if present, or undefined
   * @public
   */
  Registry.prototype.lookup = function(name) {
    if(!awaitingFinalizers.length) this._finalize();
    return registry[name];
  };

  /**
   * Shorthand for the lookup method
   * @see Registry#lookup
   * @public
   */
  Registry.prototype.l = function(name) { return this.lookup(name); };

  /**
   * Shorthand for the scope method
   * @see Registry#scope
   * @public
   */
  Registry.prototype.s = function(name) { return this.scope(name); };

  /**
   * Create a scope for the given name
   * @example
   *     scope = registry.scope('some.name')
   *     MyObject = scope.lookup('MyObject');
   * @public
   */
  Registry.prototype.scope = function(name) { return new Scope(name); }

  /**
   * Registers a set of descriptors into the registry.
   * @param {Array<Object>} descriptors - The objects must conform to google.protobuf.FileDescriptorProto using field numbers as keys
   * @public
   */
  Registry.prototype.register = function(descriptors) {
    var compiler = require('./compiler').Compiler;
    compiler.compileDescriptors(descriptors);
  };

  /**
   * List all keys in the registry
   * @public
   */
  Registry.prototype.keys = function() { return Object.keys(registry); }
  Registry.prototype.fullKeys = Registry.prototype.keys;

  /**
   * Check if a given key is present in the registry
   * @param {string} name - The full path of the protobuf object to check
   * @return boolean - Presence of the key
   * @public
   */
  Registry.prototype.has = function(name) { return registry.hasOwnProperty(name); }

  /**
   * Finalizes the objects in the registry if they are awaiting finalization
   * i.e. if they have just been added.
   * @param {boolean} force - Force the finalization. By default, it will only run if there is anything to run.
   * @private
   */
  Registry.prototype._finalize = function(force) {
    if(!force && !awaitingFinalizers.length) return;
    var finalizers = awaitingFinalizers,
        dp = goog.descriptorProto,
        fd = goog.fieldDescriptorProto;

    finalizers.forEach(function(name) { registry[name].finalize(); });
    awaitingFinalizers = [];
  };

  /**
   * Add an object to be finalized. 
   * This happens when each new object is added to the registry,
   * or when they are extended.
   * @param {string} name - The name of the thing to finalize
   * @private
   */
  Registry.prototype._addFinalize = function(name) {
    awaitingFinalizers = awaitingFinalizers || [];
    if(awaitingFinalizers.indexOf(name) < 0) awaitingFinalizers.push(name);
  }

  /**
   * Add a protocol buffer object to the registry by name
   * @param {string} name - The name of the object for the registry
   * @param {Object} protobufObject - The object to store in the registry
   * @private
   */
  Registry.prototype._addObject = function(name, protobufObject) {
    this._addFinalize(name);
    registry[name] = protobufObject;
  };

  /**
   * Adds an extension to be compiled when the objects are finalized.
   * @param {google.protobuf.FieldDescriptorProto} ext - The field extension to apply
   * @private
   */
  Registry.prototype._addExtension = function(ext) {
    var fd = goog.fieldDescriptorProto,
        extendee = (ext[fd.EXTENDEE]).replace(/^\./, ''),
        key = extendee + (ext[fd.NUMBER]);

    ext[fd.EXTENDEE] = extendee;
    extensions[key] = ext;
  };

  // TODO: remove if not needed
  // Registry.prototype.extensions = function() { return extensions; };

  /**
   * Apply any existing extensions to the objects in the reigstry. Also clear out the extensions so they're not doubly applied
   * @private
   */
  Registry.prototype._applyExtensions = function() {
    var self = this,
        fd = goog.fieldDescriptorProto;

    Object.keys(extensions).forEach(function(key){
      var ext = extensions[key],
          Extendee = registry[ext[fd.EXTENDEE]],
          extendee = Extendee.descriptor,
          fields = extendee[fd.FIELD],
          FieldDescriptor = registry['google.protobuf.FieldDescriptorProto'],
          field;

      if(!fields) fields = extendee[fd.EXTENDEE] = extendee[fd.EXTENDEE] || [];

      field = (fields || []).filter(function(f){ return f[fd.NUMBER] === (ext[fd.NUMBER]); })[0];
      if(!field){
        self._addFinalize(Extendee.fullName);
        if(!ext instanceof FieldDescriptor) ext = new FieldDescriptor(ext);
        fields.push(ext);
      }
    });
    extensions = {};
  };

  /**
   * Check to see if the google descriptors have been compiled
   * @protected
   */
  Registry.prototype.googleDescriptorsCompiled = function() {
    this.googleCompiled = true;
  }

  /**
   * Compile the google descriptors. This must be done as the first step and is done automatically
   * @private
   */
  Registry.prototype.compileGoogleDescriptors = function() {
    if(this.googleCompiled) return;
    this.register(require('./google_descriptors'));

    require('./compiler/encoders').encoders.addFieldEncoders();
    require('./compiler/coorcers').coercers.addFieldCoercers();

    this._finalize();
    this.googleDescriptorsCompiled();
    // These are only the google ones. We need to set their descriptors up
    Object.keys(registry).forEach(function(key) {
      var thing = registry[key];
      thing.fileDescriptor = new (registry['google.protobuf.FileDescriptorProto'])(thing.fileDescriptor);
      if(thing.type.name == 'TYPE_MESSAGE') {
        registry[key].updateDescriptor(new (registry['google.protobuf.DescriptorProto'])(thing.descriptor));
        registry[key].finalize(true);
      } else if(thing.type.name == 'TYPE_ENUM') {
        registry[key].updateDescriptor(new (registry['google.protobuf.EnumDescriptorProto'])(thing.descriptor));
        registry[key].finalize(true);
      } else if(thing.type.name == 'TYPE_SERVICE') {
        registry[key].updateDescriptor(new (registry['google.protobuf.ServiceDescriptorProto'])(thing.descriptor));
        registry[key].finalize(true);
      }
    });

  }

  REGISTRY = cache.registry = new Registry();
  module.exports = REGISTRY;
  REGISTRY.reset();
}


}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./compiler":3,"./compiler/coorcers":4,"./compiler/encoders":6,"./compiler/google-protos-defn":7,"./google_descriptors":9}],13:[function(require,module,exports){
/**
 * @module protob/service
 */
var SERVICE = "SERVICE",
    goog = require('./compiler/google-protos-defn'),
    Message = require('./message').Message,
    Promise = require('bluebird').Promise,
    registry = require('./registry');

/**
 * A compled service object defined by the 'service' keyword in a .proto file
 *
 * The service defines methods that have an input and output type and are available on the constructor
 *
 * The service has a descriptor that is of type google.protobuf.ServiceDescriptorProto
 *
 * @example
 *
 *    MyService = Protob.registry.lookup('my.service.Service');
 *    methods = MyService.methods; // An object describing the methods available for the service keyed by method name
 *    method = methods.MyMethod
 *    method.inputType  // The constructor for the input type of the rpc method
 *    method.outputType // the constructor for the output type of the rpc method
 *    method.getf('options').asJSON() // Show the options as a POJO
 *
 * @constructor
 */
var Service = function(context) {
  this.context = context || {}; // context for the eexecution of the method.
};

Service.isService = function() { return true; };
Service.isMessage = function() { return false; };
Service.isEnum = function() { return false; };

Service.prototype.isService = function() { return true; };
Service.prototype.isMessage = function() { return false; };
Service.prototype.isEnum = function() { return false; };

/**
 * Updates the descriptor for this service.
 * This also sets up some information on the constructor that can be used for introspection.
 *
 * @param {object} desc - The Json verion of the google.protobuf.DescriptorProto
 * @private
 */
Service.updateDescriptor = function(desc) {
  var sd = goog.serviceDescriptorProto;
  /** @member {string} - The type of service is 'SERVICE' */
  this.type = SERVICE;

  /** @member {object} - The descriptor is cached for introspection */
  this.descriptor = desc;

  /** @member {string} - The name of the message */
  this.clazz = desc[sd.NAME];

  /** @member {string} - The full protobuf name including package */
  this.fullName = this.parent + "." + desc[sd.NAME];
  this.reset = Service.reset;
  this.finalize = Service.finalize;
  this.reset();
};

/**
 * Create a service handler for a method.
 * @param {string} methodName - The name of the method as it appears in the proto rpc definition.
 * @param {string} [methodPrefix] - A method prefix for the handler. By default this is nil.
 * @param {function} fn - The handler. It will recieve the request object as the first instance.
 */
Service.handler = function(methodName, methodPrefix, fn) {
  if(!fn) {
    fn = methodPrefix;
    methodPrefix = undefined;
  }

  var method = this.methods[methodName],
      fullMethodName = [methodPrefix, methodName].join(''),
      handlerFn;
  if(!method) {
    throw new Error('Unknown method ' + methodName + ' for ' + this.fullName);
  }

  handlerFn = function (req) {
    req = req || {};
    var self = this; // Service instance
    return Promise.resolve().then(function() {
      req = ensureType(req, method.inputType);
      return fn.call(self, req) || {};
    }).then(function(res) {
      return ensureType(res, method.outputType);
    });
  };

  this.prototype[fullMethodName] = handlerFn;
}

function ensureType(msg, type) {
  if(msg instanceof Message && !(msg instanceof type)) {
    var err = new Error('Incompatible input type for ' + type.fullName + '. Got ' + msg.constructor.fullName);

    err.status = err.statusCode = 400;
    throw err;
  }

  if(!(msg instanceof type)) msg = new type(msg);
  return msg;
};

/**
 * Reset the service
 * @private
 */
Service.reset = function() { this.methods = {}; }

/**
 * Parses through all the methos and caches their definitions for later
 * @private
 */
Service.finalize = function() {
  this.reset();
  var self = this,
      sd = goog.serviceDescriptorProto,
      md = goog.methodDescriptorProto,
      MethodOptions = registry.lookup('google.protobuf.MethodOptions');

  if ( this.descriptor && Array.isArray(this.descriptor[sd.METHOD]) ) {
    this.descriptor[sd.METHOD].forEach(function(method) {
      self.methods[method[md.NAME]] = method;
      method.name = method[md.NAME];
      method.inputType = registry.lookup(method[md.INPUT_TYPE].replace(/^\./, ''));
      method.outputType = registry.lookup(method[md.OUTPUT_TYPE].replace(/^\./, ''));
    });
  }
  this.handler = Service.handler;
};

exports.Service = Service;

},{"./compiler/google-protos-defn":7,"./message":10,"./registry":12,"bluebird":43}],14:[function(require,module,exports){
/**
 * Adds an initialize lifecycle initializer to Steven applications to compile protos.
 *
 * Configuration values avaialble:
 * <ul>
 *   <li>protoDir - The directory path to your compiled protocol buffer. By default, {appDir}/protos</li>
 * </ul>
 *
 * Lifecycles:
 * <ul>
 *   <li>initialize.setup 'protob.compile' - Loads the compiled protocol buffers for the project</li>
 * </ul>
 *
 * @param {function} - The Steven function that the application knows about
 * @example
 *    require('protob').stevenInit(require('steven'));
 * @private
 */
function stevenInit(Steven){
  var Path   = require('path'),
      Compiler = require('./compiler').Compiler,
      init = Steven.lifecycles.initialize;

  init.setup.initializer("protob.compile", function(app){
    var protosDir = app.config.get('protoDir') || Path.resolve(Path.join(app.config.get('appDir'), "protos"))
    Compiler.compile(protosDir);
  });
}

module.exports = stevenInit;

},{"./compiler":3,"path":26}],15:[function(require,module,exports){
/**
 * @module protob/util
 * A simple set of utilities
 */
exports.Util = {
  sortBy: function(fieldName) {
    return function(a, b) {
      if ( a[fieldName] < b[fieldName]) {
        return -1;
      } else if (a[fieldName] > b[fieldName] ) {
        return 1;
      } else {
        return 0;
      }
    };
  },
  /**
   * A sort by length of string function
   * @function
   * @example
   *     someArrayOfStrings.sort(Util.sortByLength)
   * @private
   */
  sortByLength: function(a,b) {
    if ( a.length < b.length ) {
      return -1;
    } else if (a.length > b.length ) {
      return 1;
    } else {
      return 0;
    }
  }
};

},{}],16:[function(require,module,exports){
module.exports = "0.4.2";

},{}],17:[function(require,module,exports){

},{}],18:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":20}],19:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],20:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("FWaASH"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":19,"FWaASH":27,"inherits":25}],21:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":22,"ieee754":23}],22:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],23:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],24:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],25:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],26:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require("FWaASH"))
},{"FWaASH":27}],27:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],28:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

module.exports = Duplex;
var inherits = require('inherits');
var setImmediate = require('process/browser.js').nextTick;
var Readable = require('./readable.js');
var Writable = require('./writable.js');

inherits(Duplex, Readable);

Duplex.prototype.write = Writable.prototype.write;
Duplex.prototype.end = Writable.prototype.end;
Duplex.prototype._write = Writable.prototype._write;

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  var self = this;
  setImmediate(function () {
    self.end();
  });
}

},{"./readable.js":32,"./writable.js":34,"inherits":25,"process/browser.js":30}],29:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('./readable.js');
Stream.Writable = require('./writable.js');
Stream.Duplex = require('./duplex.js');
Stream.Transform = require('./transform.js');
Stream.PassThrough = require('./passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"./duplex.js":28,"./passthrough.js":31,"./readable.js":32,"./transform.js":33,"./writable.js":34,"events":24,"inherits":25}],30:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],31:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

module.exports = PassThrough;

var Transform = require('./transform.js');
var inherits = require('inherits');
inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough))
    return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function(chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./transform.js":33,"inherits":25}],32:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Readable;
Readable.ReadableState = ReadableState;

var EE = require('events').EventEmitter;
var Stream = require('./index.js');
var Buffer = require('buffer').Buffer;
var setImmediate = require('process/browser.js').nextTick;
var StringDecoder;

var inherits = require('inherits');
inherits(Readable, Stream);

function ReadableState(options, stream) {
  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = false;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // In streams that never have any data, and do push(null) right away,
  // the consumer can miss the 'end' event if they do some I/O before
  // consuming the stream.  So, we don't emit('end') until some reading
  // happens.
  this.calledRead = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;


  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = require('string_decoder').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (typeof chunk === 'string' && !state.objectMode) {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null || chunk === undefined) {
    state.reading = false;
    if (!state.ended)
      onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      // update the buffer info.
      state.length += state.objectMode ? 1 : chunk.length;
      if (addToFront) {
        state.buffer.unshift(chunk);
      } else {
        state.reading = false;
        state.buffer.push(chunk);
      }

      if (state.needReadable)
        emitReadable(stream);

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = require('string_decoder').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (isNaN(n) || n === null) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else
      return state.length;
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  var state = this._readableState;
  state.calledRead = true;
  var nOrig = n;

  if (typeof n !== 'number' || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;

  // if we currently have less than the highWaterMark, then also read some
  if (state.length - n <= state.highWaterMark)
    doRead = true;

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading)
    doRead = false;

  if (doRead) {
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read called its callback synchronously, then `reading`
  // will be false, and we need to re-evaluate how much data we
  // can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we happened to read() exactly the remaining amount in the
  // buffer, and the EOF has been seen at this point, then make sure
  // that we emit 'end' on the very next tick.
  if (state.ended && !state.endEmitted && state.length === 0)
    endReadable(this);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode &&
      !er) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.decoder && !state.ended) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // if we've ended and we have some data left, then emit
  // 'readable' now to make sure it gets picked up.
  if (state.length > 0)
    emitReadable(stream);
  else
    endReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (state.emittedReadable)
    return;

  state.emittedReadable = true;
  if (state.sync)
    setImmediate(function() {
      emitReadable_(stream);
    });
  else
    emitReadable_(stream);
}

function emitReadable_(stream) {
  stream.emit('readable');
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    setImmediate(function() {
      maybeReadMore_(stream, state);
    });
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    setImmediate(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    if (readable !== src) return;
    cleanup();
  }

  function onend() {
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (!dest._writableState || dest._writableState.needDrain)
      ondrain();
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  // check for listeners before emit removes one-time listeners.
  var errListeners = EE.listenerCount(dest, 'error');
  function onerror(er) {
    unpipe();
    if (errListeners === 0 && EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  dest.once('error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    // the handler that waits for readable events after all
    // the data gets sucked out in flow.
    // This would be easier to follow with a .once() handler
    // in flow(), but that is too slow.
    this.on('readable', pipeOnReadable);

    state.flowing = true;
    setImmediate(function() {
      flow(src);
    });
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var dest = this;
    var state = src._readableState;
    state.awaitDrain--;
    if (state.awaitDrain === 0)
      flow(src);
  };
}

function flow(src) {
  var state = src._readableState;
  var chunk;
  state.awaitDrain = 0;

  function write(dest, i, list) {
    var written = dest.write(chunk);
    if (false === written) {
      state.awaitDrain++;
    }
  }

  while (state.pipesCount && null !== (chunk = src.read())) {

    if (state.pipesCount === 1)
      write(state.pipes, 0, null);
    else
      forEach(state.pipes, write);

    src.emit('data', chunk);

    // if anyone needs a drain, then we have to wait for that.
    if (state.awaitDrain > 0)
      return;
  }

  // if every destination was unpiped, either before entering this
  // function, or in the while loop, then stop flowing.
  //
  // NB: This is a pretty rare edge case.
  if (state.pipesCount === 0) {
    state.flowing = false;

    // if there were data event listeners added, then switch to old mode.
    if (EE.listenerCount(src, 'data') > 0)
      emitDataEvents(src);
    return;
  }

  // at this point, no one needed a drain, so we just ran out of data
  // on the next readable event, start it over again.
  state.ranOut = true;
}

function pipeOnReadable() {
  if (this._readableState.ranOut) {
    this._readableState.ranOut = false;
    flow(this);
  }
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data' && !this._readableState.flowing)
    emitDataEvents(this);

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        this.read(0);
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  emitDataEvents(this);
  this.read(0);
  this.emit('resume');
};

Readable.prototype.pause = function() {
  emitDataEvents(this, true);
  this.emit('pause');
};

function emitDataEvents(stream, startPaused) {
  var state = stream._readableState;

  if (state.flowing) {
    // https://github.com/isaacs/readable-stream/issues/16
    throw new Error('Cannot switch to old mode now.');
  }

  var paused = startPaused || false;
  var readable = false;

  // convert to an old-style stream.
  stream.readable = true;
  stream.pipe = Stream.prototype.pipe;
  stream.on = stream.addListener = Stream.prototype.on;

  stream.on('readable', function() {
    readable = true;

    var c;
    while (!paused && (null !== (c = stream.read())))
      stream.emit('data', c);

    if (c === null) {
      readable = false;
      stream._readableState.needReadable = true;
    }
  });

  stream.pause = function() {
    paused = true;
    this.emit('pause');
  };

  stream.resume = function() {
    paused = false;
    if (readable)
      setImmediate(function() {
        stream.emit('readable');
      });
    else
      this.read(0);
    this.emit('resume');
  };

  // now make it start, just in case it hadn't already.
  stream.emit('readable');
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    if (state.decoder)
      chunk = state.decoder.write(chunk);
    if (!chunk || !state.objectMode && !chunk.length)
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (typeof stream[i] === 'function' &&
        typeof this[i] === 'undefined') {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }}(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function(ev) {
    stream.on(ev, function (x) {
      return self.emit.apply(self, ev, x);
    });
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted && state.calledRead) {
    state.ended = true;
    setImmediate(function() {
      // Check that we didn't get one last unshift.
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit('end');
      }
    });
  }
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf (xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

}).call(this,require("FWaASH"))
},{"./index.js":29,"FWaASH":27,"buffer":21,"events":24,"inherits":25,"process/browser.js":30,"string_decoder":35}],33:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

module.exports = Transform;

var Duplex = require('./duplex.js');
var inherits = require('inherits');
inherits(Transform, Duplex);


function TransformState(options, stream) {
  this.afterTransform = function(er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb)
    return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined)
    stream.push(data);

  if (cb)
    cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}


function Transform(options) {
  if (!(this instanceof Transform))
    return new Transform(options);

  Duplex.call(this, options);

  var ts = this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('finish', function() {
    if ('function' === typeof this._flush)
      this._flush(function(er) {
        done(stream, er);
      });
    else
      done(stream);
  });
}

Transform.prototype.push = function(chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, encoding, cb) {
  throw new Error('not implemented');
};

Transform.prototype._write = function(chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform ||
        rs.needReadable ||
        rs.length < rs.highWaterMark)
      this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function(n) {
  var ts = this._transformState;

  if (ts.writechunk && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};


function done(stream, er) {
  if (er)
    return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var rs = stream._readableState;
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./duplex.js":28,"inherits":25}],34:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

module.exports = Writable;
Writable.WritableState = WritableState;

var isUint8Array = typeof Uint8Array !== 'undefined'
  ? function (x) { return x instanceof Uint8Array }
  : function (x) {
    return x && x.constructor && x.constructor.name === 'Uint8Array'
  }
;
var isArrayBuffer = typeof ArrayBuffer !== 'undefined'
  ? function (x) { return x instanceof ArrayBuffer }
  : function (x) {
    return x && x.constructor && x.constructor.name === 'ArrayBuffer'
  }
;

var inherits = require('inherits');
var Stream = require('./index.js');
var setImmediate = require('process/browser.js').nextTick;
var Buffer = require('buffer').Buffer;

inherits(Writable, Stream);

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
}

function WritableState(options, stream) {
  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.buffer = [];
}

function Writable(options) {
  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Stream.Duplex))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, state, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  setImmediate(function() {
    cb(er);
  });
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    setImmediate(function() {
      cb(er);
    });
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (!Buffer.isBuffer(chunk) && isUint8Array(chunk))
    chunk = new Buffer(chunk);
  if (isArrayBuffer(chunk) && typeof Uint8Array !== 'undefined')
    chunk = new Buffer(new Uint8Array(chunk));
  
  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (typeof cb !== 'function')
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb))
    ret = writeOrBuffer(this, state, chunk, encoding, cb);

  return ret;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      typeof chunk === 'string') {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  state.needDrain = !ret;

  if (state.writing)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    setImmediate(function() {
      cb(er);
    });
  else
    cb(er);

  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(stream, state);

    if (!finished && !state.bufferProcessing && state.buffer.length)
      clearBuffer(stream, state);

    if (sync) {
      setImmediate(function() {
        afterWrite(stream, state, finished, cb);
      });
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  cb();
  if (finished)
    finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;

  for (var c = 0; c < state.buffer.length; c++) {
    var entry = state.buffer[c];
    var chunk = entry.chunk;
    var encoding = entry.encoding;
    var cb = entry.callback;
    var len = state.objectMode ? 1 : chunk.length;

    doWrite(stream, state, len, chunk, encoding, cb);

    // if we didn't call the onwrite immediately, then
    // it means that we need to wait until it does.
    // also, that means that the chunk and cb are currently
    // being processed, so move the buffer counter past them.
    if (state.writing) {
      c++;
      break;
    }
  }

  state.bufferProcessing = false;
  if (c < state.buffer.length)
    state.buffer = state.buffer.slice(c);
  else
    state.buffer.length = 0;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (typeof chunk !== 'undefined' && chunk !== null)
    this.write(chunk, encoding);

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(stream, state) {
  return (state.ending &&
          state.length === 0 &&
          !state.finished &&
          !state.writing);
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    state.finished = true;
    stream.emit('finish');
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      setImmediate(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

},{"./index.js":29,"buffer":21,"inherits":25,"process/browser.js":30}],35:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = require('buffer').Buffer;

function assertEncoding(encoding) {
  if (encoding && !Buffer.isEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  this.charBuffer = new Buffer(6);
  this.charReceived = 0;
  this.charLength = 0;
};


StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  var offset = 0;

  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var i = (buffer.length >= this.charLength - this.charReceived) ?
                this.charLength - this.charReceived :
                buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, offset, i);
    this.charReceived += (i - offset);
    offset = i;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (i == buffer.length) return charStr;

    // otherwise cut off the characters end from the beginning of this buffer
    buffer = buffer.slice(i, buffer.length);
    break;
  }

  var lenIncomplete = this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - lenIncomplete, end);
    this.charReceived = lenIncomplete;
    end -= lenIncomplete;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    this.charBuffer.write(charStr.charAt(charStr.length - 1), this.encoding);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }

  return i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 2;
  this.charLength = incomplete ? 2 : 0;
  return incomplete;
}

function base64DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 3;
  this.charLength = incomplete ? 3 : 0;
  return incomplete;
}

},{"buffer":21}],36:[function(require,module,exports){
module.exports=require(19)
},{}],37:[function(require,module,exports){
module.exports=require(20)
},{"./support/isBuffer":36,"FWaASH":27,"inherits":25}],38:[function(require,module,exports){
/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/**
 * @license ByteBuffer.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
 * Released under the Apache License, Version 2.0
 * see: https://github.com/dcodeIO/ByteBuffer.js for details
 */ //
(function(global) {
    "use strict";

    // Note that this library carefully avoids using the array access operator
    // (i.e. buffer[x]) on ArrayBufferView subclasses (e.g. Uint8Array), and
    // uses DataView instead. This is required for IE 8 compatibility.

    /**
     * @param {Function=} Long
     * @returns {Function}
     * @inner
     */
    function loadByteBuffer(Long) {

        // Support node's Buffer if available, see http://nodejs.org/api/buffer.html
        var Buffer = null;
        if (typeof require === 'function') {
            try {
                var nodeBuffer = require("buffer");
                Buffer = nodeBuffer && typeof nodeBuffer['Buffer'] === 'function' &&
                    typeof nodeBuffer['Buffer']['isBuffer'] === 'function' ? nodeBuffer['Buffer'] : null;
            } catch (e) {}
        }

        /**
         * Constructs a new ByteBuffer.
         * @class A full-featured ByteBuffer implementation in JavaScript using typed arrays.
         * @exports ByteBuffer
         * @param {number=} capacity Initial capacity. Defaults to {@link ByteBuffer.DEFAULT_CAPACITY}.
         * @param {boolean=} littleEndian `true` to use little endian multi byte values, defaults to `false` for big
         *  endian.
         * @param {boolean=} sparse If set to `true`, a ByteBuffer with array=view=null will be created which have to be
         *  set manually afterwards. Defaults to `false`.
         * @expose
         */
        var ByteBuffer = function(capacity, littleEndian, sparse) {
            capacity = typeof capacity !== 'undefined' ? parseInt(capacity, 10) : ByteBuffer.DEFAULT_CAPACITY;
            if (capacity < 1) capacity = ByteBuffer.DEFAULT_CAPACITY;

            /**
             * Backing ArrayBuffer.
             * @type {?ArrayBuffer}
             * @expose
             */
            this.array = sparse ? null : new ArrayBuffer(capacity);

            /**
             * DataView to mess with the ArrayBuffer.
             * @type {?DataView}
             * @expose
             */
            this.view = sparse ? null : new DataView(this.array);

            /**
             * Current read/write offset. Length- and capacity-independent index. Contents are the bytes between offset
             *  and length, which are both absolute indexes. There is no capacity property, use
             *  {@link ByteBuffer#capacity} instead.
             * @type {number}
             * @expose
             */
            this.offset = 0;

            /**
             * Marked offset set through {@link ByteBuffer#mark}. Defaults to `-1` (no marked offset).
             * @type {number}
             * @expose
             */
            this.markedOffset = -1;

            /**
             * Length of the contained data. Offset- and capacity-independent index. Contents are the bytes between
             *  offset and length, which are both absolute indexes. There is no capacity property, use
             *  {@link ByteBuffer#capacity} instead.
             * @type {number}
             * @expose
             */
            this.length = 0;

            /**
             * Whether to use little endian multi byte values, defaults to `false` for big endian.
             * @type {boolean}
             * @expose
             */
            this.littleEndian = typeof littleEndian != 'undefined' ? !!littleEndian : false;
        };

        /**
         * Version string.
         * @type {string}
         * @const
         * @expose
         */
        ByteBuffer.VERSION = "2.3.2";

        /**
         * Default buffer capacity of `16`. The ByteBuffer will be automatically resized by a factor of 2 if required.
         * @type {number}
         * @const
         * @expose
         */
        ByteBuffer.DEFAULT_CAPACITY = 16;

        /**
         * Little endian constant for usage in constructors instead of a boolean value. Evaluates to `true`.
         * @type {boolean}
         * @const
         * @expose
         */
        ByteBuffer.LITTLE_ENDIAN = true;

        /**
         * Big endian constant for usage in constructors instead of a boolean value. Evaluates to `false`.
         * @type {boolean}
         * @const
         * @expose
         */
        ByteBuffer.BIG_ENDIAN = false;

        /**
         * Long class for int64 support. May be `null` if the Long class has not been loaded and int64 support is
         *  not available.
         * @type {?Long}
         * @const
         * @expose
         */
        ByteBuffer.Long = Long || null;

        /**
         * Tests if the specified type is a ByteBuffer or ByteBuffer-like.
         * @param {*} bb ByteBuffer to test
         * @returns {boolean} true if it is a ByteBuffer or ByteBuffer-like, otherwise false
         * @expose
         */
        ByteBuffer.isByteBuffer = function(bb) {
            return bb && (
                (bb instanceof ByteBuffer) || (
                    typeof bb === 'object' &&
                    (bb.array === null || bb.array instanceof ArrayBuffer) &&
                    (bb.view === null || bb.view instanceof DataView) &&
                    typeof bb.offset === 'number' &&
                    typeof bb.markedOffset === 'number' &&
                    typeof bb.length === 'number' &&
                    typeof bb.littleEndian === 'boolean'
                )
            );
        };

        /**
         * Allocates a new ByteBuffer.
         * @param {number=} capacity Initial capacity. Defaults to {@link ByteBuffer.DEFAULT_CAPACITY}.
         * @param {boolean=} littleEndian `true` to use little endian multi byte values, defaults to `false` for big
         *  endian.
         * @returns {!ByteBuffer}
         * @expose
         */
        ByteBuffer.allocate = function(capacity, littleEndian) {
            return new ByteBuffer(capacity, littleEndian);
        };

        /**
         * Converts a node.js <= 0.8 Buffer to an ArrayBuffer.
         * @param {!Buffer} b Buffer to convert
         * @returns {?ArrayBuffer} Converted buffer
         * @inner
         */
        function b2ab(b) {
            var ab = new ArrayBuffer(b.length),
                view = new Uint8Array(ab);
            for (var i=0, k=b.length; i < k; ++i) view[i] = b[i];
            return ab;
        }

        /**
         * Wraps an ArrayBuffer, any object containing an ArrayBuffer, a node buffer or a string. Sets the created
         *  ByteBuffer's offset to 0 and its length to the wrapped object's byte length.
         * @param {!ArrayBuffer|!Buffer|!{array: !ArrayBuffer}|!{buffer: !ArrayBuffer}|string} buffer Anything that can
         *  be wrapped
         * @param {(string|boolean)=} enc String encoding if a string is provided (hex, utf8, binary, defaults to base64)
         * @param {boolean=} littleEndian `true` to use little endian multi byte values, defaults to `false` for big
         *  endian.
         * @returns {!ByteBuffer}
         * @throws {Error} If the specified object cannot be wrapped
         * @expose
         */
        ByteBuffer.wrap = function(buffer, enc, littleEndian) {
            if (typeof enc === 'boolean') {
                littleEndian = enc;
                enc = "utf8";
            }
            // Wrap a string
            if (typeof buffer === 'string') {
                switch (enc) {
                    case "base64":
                        return ByteBuffer.decode64(buffer, littleEndian);
                    case "hex":
                        return ByteBuffer.decodeHex(buffer, littleEndian);
                    case "binary":
                        return ByteBuffer.decodeBinary(buffer, littleEndian);
                    default:
                        return new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, littleEndian).writeUTF8String(buffer).flip();
                }
            }
            var b;
            // Wrap Buffer
            if (Buffer && Buffer.isBuffer(buffer)) {
                b = new Uint8Array(buffer).buffer; // noop on node <= 0.8
                buffer = (b === buffer) ? b2ab(buffer) : b;
            }
            // Refuse to wrap anything that's null or not an object
            if (buffer === null || typeof buffer !== 'object') {
                throw(new Error("Cannot wrap null or non-object"));
            }
            // Wrap ByteBuffer by cloning (preserve offsets)
            if (ByteBuffer.isByteBuffer(buffer)) {
                return ByteBuffer.prototype.clone.call(buffer); // Also makes ByteBuffer-like a ByteBuffer
            }
            // Wrap any object that is or contains an ArrayBuffer
            if (!!buffer["array"]) {
                buffer = buffer["array"];
            } else if (!!buffer["buffer"]) {
                buffer = buffer["buffer"];
            }
            if (!(buffer instanceof ArrayBuffer)) {
                throw(new Error("Cannot wrap buffer of type "+typeof(buffer)+", "+buffer.constructor.name));
            }
            b = new ByteBuffer(0, littleEndian, true);
            b.array = buffer;
            b.view = b.array.byteLength > 0 ? new DataView(b.array) : null;
            b.offset = 0;
            b.length = buffer.byteLength;
            return b;
        };

        /**
         * Switches little endian byte order.
         * @param {boolean=} littleEndian Defaults to `true`, otherwise uses big endian
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.LE = function(littleEndian) {
            this.littleEndian = typeof littleEndian !== 'undefined' ? !!littleEndian : true;
            return this;
        };

        /**
         * Switches big endian byte order.
         * @param {boolean=} bigEndian Defaults to `true`, otherwise uses little endian
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.BE = function(bigEndian) {
            this.littleEndian = typeof bigEndian !== 'undefined' ? !bigEndian : false;
            return this;
        };

        /**
         * Resizes the ByteBuffer to the given capacity. Will do nothing if already that large or larger.
         * @param {number} capacity New capacity
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.resize = function(capacity) {
            if (capacity < 1) return false;
            if (this.array === null) { // Silently recreate
                this.array = new ArrayBuffer(capacity);
                this.view = new DataView(this.array);
            }
            if (this.array.byteLength < capacity) {
                var src = this.array;
                var srcView = new Uint8Array(src);
                var dst = new ArrayBuffer(capacity);
                var dstView = new Uint8Array(dst);
                dstView.set(srcView);
                this.array = dst;
                this.view = new DataView(dst);
            }
            return this;
        };

        /**
         * Slices the ByteBuffer. This is independent of the ByteBuffer's actual offsets. Does not compact the underlying
         *  ArrayBuffer (use {@link ByteBuffer#compact} or {@link ByteBuffer.wrap} instead).
         * @param {number=} begin Begin offset, defaults to {@link ByteBuffer#offset}.
         * @param {number=} end End offset, defaults to {@link ByteBuffer#length}.
         * @returns {!ByteBuffer} Clone of this ByteBuffer with slicing applied, backed by the same ArrayBuffer
         * @throws {Error} If the buffer cannot be sliced
         * @expose
         */
        ByteBuffer.prototype.slice = function(begin, end) {
            if (this.array == null) {
                throw(new Error(this+" cannot be sliced: Already destroyed"));
            }
            if (typeof begin === 'undefined') begin = this.offset;
            if (typeof end === 'undefined') end = this.length;
            if (end <= begin) {
                var t = end; end = begin; begin = t;
            }
            if (begin < 0 || begin > this.array.byteLength || end < 1 || end > this.array.byteLength) {
                throw(new Error(this+" cannot be sliced: Index out of bounds (0-"+this.array.byteLength+" -> "+begin+"-"+end+")"));
            }
            var b = this.clone();
            b.offset = begin;
            b.length = end;
            return b;
        };

        /**
         * Makes sure that the specified capacity is available. If the current capacity is exceeded, it will be doubled.
         *  If double the previous capacity is less than the required capacity, the required capacity will be used.
         * @param {number} capacity Required capacity
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.ensureCapacity = function(capacity) {
            if (this.array === null)
                return this.resize(capacity);
            if (this.array.byteLength < capacity)
                return this.resize(this.array.byteLength*2 >= capacity ? this.array.byteLength*2 : capacity);
            return this;
        };

        /**
         * Makes the buffer ready for a new sequence of write or relative read operations. Sets `length=offset` and
         *  `offset=0`. Always make sure to flip a buffer when all relative writing operations are complete.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.flip = function() {
            this.length = this.array == null ? 0 : this.offset;
            this.offset = 0;
            return this;
        };

        /**
         * Marks an offset to be used with {@link ByteBuffer#reset}.
         * @param {number=} offset Offset to mark. Defaults to {@link ByteBuffer#offset}.
         * @returns {!ByteBuffer} this
         * @throws {Error} If the mark cannot be set
         * @see ByteBuffer#reset
         * @expose
         */
        ByteBuffer.prototype.mark = function(offset) {
            if (this.array == null) {
                throw(new Error(this+" cannot be marked: Already destroyed"));
            }
            offset = typeof offset !== 'undefined' ? parseInt(offset, 10) : this.offset;
            if (offset < 0 || offset > this.array.byteLength) {
                throw(new Error(this+" cannot be marked: Offset to mark is less than 0 or bigger than the capacity ("+this.array.byteLength+"): "+offset));
            }
            this.markedOffset = offset;
            return this;
        };

        /**
         * Resets the ByteBuffer. If an offset has been marked through {@link ByteBuffer#mark} before, the offset will
         *  be set to the marked offset and the marked offset will be discarded. Length will not be altered. If there is
         *  no marked offset, sets `offset=0` and `length=0`.
         * @returns {!ByteBuffer} this
         * @see ByteBuffer#mark
         * @expose
         */
        ByteBuffer.prototype.reset = function() {
            if (this.array === null) {
                throw(new Error(this+" cannot be reset: Already destroyed"));
            }
            if (this.markedOffset >= 0) {
                this.offset = this.markedOffset;
                this.markedOffset = -1;
            } else {
                this.offset = 0;
                this.length = 0;
            }
            return this;
        };

        /**
         * Clones this ByteBuffer. The returned cloned ByteBuffer shares the same backing array but will have its own
         *  offsets.
         * @returns {!ByteBuffer} Clone
         * @expose
         */
        ByteBuffer.prototype.clone = function() {
            var b = new ByteBuffer(-1, this.littleEndian, /* no init, undocumented */ true);
            b.array = this.array;
            b.view = this.view;
            b.offset = this.offset;
            b.markedOffset = this.markedOffset;
            b.length = this.length;
            return b;
        };

        /**
         * Copies this ByteBuffer. The copy has its own backing array and uses the same offsets as this one.
         * @returns {!ByteBuffer} Copy
         * @expose
         */
        ByteBuffer.prototype.copy = function() {
            if (this.array == null) {
                return this.clone();
            }
            var b = new ByteBuffer(this.array.byteLength, this.littleEndian);
            var src = new Uint8Array(this.array);
            var dst = new Uint8Array(b.array);
            dst.set(src);
            b.offset = this.offset;
            b.markedOffset = this.markedOffset;
            b.length = this.length;
            return b;
        };

        /**
         * Gets the number of remaining readable bytes. Contents are the bytes between offset and length, so this
         *  returns `length-offset`.
         * @returns {number} Remaining readable bytes. May be negative if `offset>length`.
         * @expose
         */
        ByteBuffer.prototype.remaining = function() {
            if (this.array === null) return 0;
            return this.length - this.offset;
        };

        /**
         * Gets the capacity of the backing buffer. This is independent from {@link ByteBuffer#length} and returns the
         *  size of the entire backing array.
         * @returns {number} Capacity of the backing array or 0 if destroyed
         * @expose
         */
        ByteBuffer.prototype.capacity = function() {
            return this.array != null ? this.array.byteLength : 0;
        };

        /**
         * Compacts the ByteBuffer to be backed by an ArrayBuffer of its actual length. Will set `offset=0` and
         *  `length=capacity`.
         * @returns {!ByteBuffer} this
         * @throws {Error} If the buffer cannot be compacted
         * @expose
         */
        ByteBuffer.prototype.compact = function() {
            if (this.array == null) {
                throw(new Error(this+" cannot be compacted: Already destroyed"));
            }
            if (this.offset > this.length) {
                this.flip();
            }
            if (this.offset === this.length) {
                this.array = new ArrayBuffer(0);
                this.view = null; // A DataView on a zero-length AB would throw
                return this;
            }
            if (this.offset === 0 && this.length === this.array.byteLength) {
                return this; // Already compacted
            }
            var srcView = new Uint8Array(this.array);
            var dst = new ArrayBuffer(this.length-this.offset);
            var dstView = new Uint8Array(dst);
            dstView.set(srcView.subarray(this.offset, this.length));
            this.array = dst;
            if (this.markedOffset >= this.offset) {
                this.markedOffset -= this.offset;
            } else {
                this.markedOffset = -1;
            }
            this.offset = 0;
            this.length = this.array.byteLength;
            return this;
        };

        /**
         * Manually destroys the ByteBuffer, releasing references to the backing array. Manually destroying a ByteBuffer
         *  is usually not required but may be useful in limited memory environments. Most successive operations will
         *  rise an error until {@link ByteBuffer#resize} or {@link ByteBuffer#ensureCapacity} is called to reinitialize
         *  the backing array.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.destroy = function() {
            if (this.array !== null) {
                this.array = null;
                this.view = null;
                this.offset = 0;
                this.markedOffset = -1;
                this.length = 0;
            }
            return this;
        };

        /**
         * Reverses the backing array and adapts offset and length to retain the same relative position on the reversed
         *  data in inverse order. Example: "00<01 02>03 04".reverse() = "04 03<02 01>00". Also clears the marked
         *  offset.
         * @returns {!ByteBuffer} this
         * @throws {Error} If the buffer is already destroyed
         * @expose
         */
        ByteBuffer.prototype.reverse = function() {
            if (this.array === null) {
                throw(new Error(this+" cannot be reversed: Already destroyed"));
            }
            Array.prototype.reverse.call(new Uint8Array(this.array));
            var o = this.offset;
            this.offset = this.array.byteLength - this.length;
            this.markedOffset = -1;
            this.length = this.array.byteLength - o;
            this.view = new DataView(this.array);
            return this;
        };

        /**
         * Appends another ByteBuffer to this one. Appends only the portion between offset and length of the specified
         *  ByteBuffer and overwrites any contents behind the specified offset up to the number of bytes contained in
         *  the specified ByteBuffer. Offset and length of the specified ByteBuffer will remain the same.
         * @param {!*} src ByteBuffer or any object that can be wrapped to append
         * @param {number=} offset Offset to append at. Defaults to {@link ByteBuffer#offset}.
         * @returns {!ByteBuffer} this
         * @throws {Error} If the specified buffer is already destroyed
         * @expose
         */
        ByteBuffer.prototype.append = function(src, offset) {
            if (!(src instanceof ByteBuffer)) {
                src = ByteBuffer.wrap(src);
            }
            if (src.array === null) {
                throw(new Error(src+" cannot be appended to "+this+": Already destroyed"));
            }
            var n = src.length - src.offset;
            if (n == 0) return this; // Nothing to append
            if (n < 0) {
                src = src.clone().flip();
                n = src.length - src.offset;
            }
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=n)-n;
            this.ensureCapacity(offset+n); // Reinitializes if required
            var srcView = new Uint8Array(src.array);
            var dstView = new Uint8Array(this.array);
            dstView.set(srcView.subarray(src.offset, src.length), offset);
            return this;
        };

        /**
         * Prepends another ByteBuffer to this one. Prepends only the portion between offset and length of the specified
         *  ByteBuffer and overwrites any contents before the specified offsets up to the number of bytes contained in
         *  the specified ByteBuffer. Offset and length of the specified ByteBuffer will remain the same.
         * @param {!*} src ByteBuffer or any object that can be wrapped to prepend
         * @param {number=} offset Offset to prepend at. Defaults to {@link ByteBuffer#offset}.
         * @returns {!ByteBuffer} this
         * @throws {Error} If the specified buffer is already destroyed
         * @expose
         */
        ByteBuffer.prototype.prepend = function(src, offset) {
            if (!(src instanceof ByteBuffer)) {
                src = ByteBuffer.wrap(src);
            }
            if (src.array === null) {
                throw(src+" cannot be prepended to "+this+": Already destroyed");
            }
            var n = src.length - src.offset;
            if (n == 0) return this; // Nothing to prepend
            if (n < 0) {
                src = src.clone().flip();
                n = src.length - src.offset;
            }
            var modify = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var diff = n-offset;
            if (diff > 0) {
                // Doesn't fit, so maybe resize and move the contents that are already contained
                this.ensureCapacity(this.length+diff);
                this.append(this, n);
                this.offset += diff;
                this.length += diff;
                this.append(src, 0);
            } else {
                this.append(src, offset-n);
            }
            if (modify) {
                this.offset -= n;
            }
            return this;
        };

        /**
         * Writes an 8bit signed integer.
         * @param {number} value Value
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if
         *  omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeInt8 = function(value, offset) {
            offset = typeof offset != 'undefined' ? offset : (this.offset+=1)-1;
            this.ensureCapacity(offset+1);
            this.view.setInt8(offset, value);
            return this;
        };

        /**
         * Reads an 8bit signed integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readInt8 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=1)-1;
            if (offset >= this.array.byteLength) {
                throw(new Error("Cannot read int8 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getInt8(offset);
        };

        /**
         * Writes a byte. This is an alias of {ByteBuffer#writeInt8}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeByte = ByteBuffer.prototype.writeInt8;

        /**
         * Reads a byte. This is an alias of {@link ByteBuffer#readInt8}.
         * @function
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readByte = ByteBuffer.prototype.readInt8;

        /**
         * Writes an 8bit unsigned integer.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeUint8 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=1)-1;
            this.ensureCapacity(offset+1);
            this.view.setUint8(offset, value);
            return this;
        };

        /**
         * Reads an 8bit unsigned integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readUint8 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=1)-1;
            if (offset+1 > this.array.byteLength) {
                throw(new Error("Cannot read uint8 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getUint8(offset);
        };

        /**
         * Writes a 16bit signed integer.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeInt16 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=2)-2;
            this.ensureCapacity(offset+2);
            this.view.setInt16(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 16bit signed integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readInt16 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=2)-2;
            if (offset+2 > this.array.byteLength) {
                throw(new Error("Cannot read int16 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getInt16(offset, this.littleEndian);
        };

        /**
         * Writes a short value. This is an alias of {@link ByteBuffer#writeInt16}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeShort = ByteBuffer.prototype.writeInt16;

        /**
         * Reads a short value. This is an alias of {@link ByteBuffer#readInt16}.
         * @function
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readShort = ByteBuffer.prototype.readInt16;

        /**
         * Writes a 16bit unsigned integer.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeUint16 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=2)-2;
            this.ensureCapacity(offset+2);
            this.view.setUint16(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 16bit unsigned integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readUint16 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=2)-2;
            if (offset+2 > this.array.byteLength) {
                throw(new Error("Cannot read int16 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getUint16(offset, this.littleEndian);
        };

        /**
         * Writes a 32bit signed integer.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeInt32 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=4)-4;
            this.ensureCapacity(offset+4);
            this.view.setInt32(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 32bit signed integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readInt32 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=4)-4;
            if (offset+4 > this.array.byteLength) {
                throw(new Error("Cannot read int32 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getInt32(offset, this.littleEndian);
        };

        /**
         * Writes an integer. This is an alias of {@link ByteBuffer#writeInt32}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeInt = ByteBuffer.prototype.writeInt32;

        /**
         * Reads an integer. This is an alias of {@link ByteBuffer#readInt32}.
         * @function
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readInt = ByteBuffer.prototype.readInt32;

        /**
         * Writes a 32bit unsigned integer.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeUint32 = function(value, offset) {
            offset = typeof offset != 'undefined' ? offset : (this.offset+=4)-4;
            this.ensureCapacity(offset+4);
            this.view.setUint32(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 32bit unsigned integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readUint32 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=4)-4;
            if (offset+4 > this.array.byteLength) {
                throw(new Error("Cannot read uint32 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getUint32(offset, this.littleEndian);
        };

        /**
         * Writes a 32bit float.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeFloat32 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=4)-4;
            this.ensureCapacity(offset+4);
            this.view.setFloat32(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 32bit float.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readFloat32 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=4)-4;
            if (this.array === null || offset+4 > this.array.byteLength) {
                throw(new Error("Cannot read float32 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getFloat32(offset, this.littleEndian);
        };

        /**
         * Writes a float. This is an alias of {@link ByteBuffer#writeFloat32}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeFloat = ByteBuffer.prototype.writeFloat32;

        /**
         * Reads a float. This is an alias of {@link ByteBuffer#readFloat32}.
         * @function
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readFloat = ByteBuffer.prototype.readFloat32;

        /**
         * Writes a 64bit float.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeFloat64 = function(value, offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
            this.ensureCapacity(offset+8);
            this.view.setFloat64(offset, value, this.littleEndian);
            return this;
        };

        /**
         * Reads a 64bit float.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readFloat64 = function(offset) {
            offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
            if (this.array === null || offset+8 > this.array.byteLength) {
                throw(new Error("Cannot read float64 from "+this+" at "+offset+": Capacity overflow"));
            }
            return this.view.getFloat64(offset, this.littleEndian);
        };

        /**
         * Writes a double. This is an alias of {@link ByteBuffer#writeFloat64}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer} this
         * @expose
         */
        ByteBuffer.prototype.writeDouble = ByteBuffer.prototype.writeFloat64;

        /**
         * Reads a double. This is an alias of {@link ByteBuffer#readFloat64}.
         * @function
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number}
         * @throws {Error} If offset is out of bounds
         * @expose
         */
        ByteBuffer.prototype.readDouble = ByteBuffer.prototype.readFloat64;

        // Available with Long.js only
        if (Long) {

            /**
             * Writes a 64bit integer. Requires Long.js.
             * @function
             * @param {number|!Long} value Value to write
             * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!ByteBuffer} this
             * @expose
             */
            ByteBuffer.prototype.writeInt64 = function(value, offset) {
                offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
                if (!(typeof value === 'object' && value instanceof Long)) value = Long.fromNumber(value, false);
                this.ensureCapacity(offset+8);
                if (this.littleEndian) {
                    this.view.setInt32(offset, value.getLowBits(), true);
                    this.view.setInt32(offset+4, value.getHighBits(), true);
                } else {
                    this.view.setInt32(offset, value.getHighBits(), false);
                    this.view.setInt32(offset+4, value.getLowBits(), false);
                }
                return this;
            };

            /**
             * Reads a 64bit integer. Requires Long.js.
             * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!Long}
             * @throws {Error} If offset is out of bounds
             * @expose
             */
            ByteBuffer.prototype.readInt64 = function(offset) {
                offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
                if (this.array === null || offset+8 > this.array.byteLength) {
                    this.offset -= 8;
                    throw(new Error("Cannot read int64 from "+this+" at "+offset+": Capacity overflow"));
                }
                var value;
                if (this.littleEndian) {
                    value = Long.fromBits(this.view.getInt32(offset, true), this.view.getInt32(offset+4, true), false);
                } else {
                    value = Long.fromBits(this.view.getInt32(offset+4, false), this.view.getInt32(offset, false), false);
                }
                return value;
            };

            /**
             * Writes a 64bit unsigned integer. Requires Long.js.
             * @function
             * @param {number|!Long} value Value to write
             * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!ByteBuffer} this
             * @expose
             */
            ByteBuffer.prototype.writeUint64 = function(value, offset) {
                offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
                if (!(typeof value === 'object' && value instanceof Long)) value = Long.fromNumber(value, true);
                this.ensureCapacity(offset+8);
                if (this.littleEndian) {
                    this.view.setUint32(offset, value.getLowBitsUnsigned(), true);
                    this.view.setUint32(offset+4, value.getHighBitsUnsigned(), true);
                } else {
                    this.view.setUint32(offset, value.getHighBitsUnsigned(), false);
                    this.view.setUint32(offset+4, value.getLowBitsUnsigned(), false);
                }
                return this;
            };

            /**
             * Reads a 64bit unsigned integer. Requires Long.js.
             * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!Long}
             * @throws {Error} If offset is out of bounds
             * @expose
             */
            ByteBuffer.prototype.readUint64 = function(offset) {
                offset = typeof offset !== 'undefined' ? offset : (this.offset+=8)-8;
                if (this.array === null || offset+8 > this.array.byteLength) {
                    this.offset -= 8;
                    throw(new Error("Cannot read int64 from "+this+" at "+offset+": Capacity overflow"));
                }
                var value;
                if (this.littleEndian) {
                    value = Long.fromBits(this.view.getUint32(offset, true), this.view.getUint32(offset+4, true), true);
                } else {
                    value = Long.fromBits(this.view.getUint32(offset+4, false), this.view.getUint32(offset, false), true);
                }
                return value;
            };

            /**
             * Writes a long. This is an alias of {@link ByteBuffer#writeInt64}.
             * @function
             * @param {number|!Long} value Value to write
             * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!ByteBuffer} this
             * @expose
             */
            ByteBuffer.prototype.writeLong = ByteBuffer.prototype.writeInt64;

            /**
             * Reads a long. This is an alias of {@link ByteBuffer#readInt64}.
             * @function
             * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!Long}
             * @throws {Error} If offset is out of bounds
             * @expose
             */
            ByteBuffer.prototype.readLong = ByteBuffer.prototype.readInt64;

        }

        /**
         * Maximum number of bytes used by 32bit base 128 variable-length integer.
         * @type {number}
         * @const
         * @expose
         */
        ByteBuffer.MAX_VARINT32_BYTES = 5;

        /**
         * Writes a 32bit base 128 variable-length integer as used in protobuf.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeVarint32 = function(value, offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            // ref: http://code.google.com/searchframe#WTeibokF6gE/trunk/src/google/protobuf/io/coded_stream.cc
            value = value >>> 0;
            this.ensureCapacity(offset+ByteBuffer.calculateVarint32(value));
            var dst = this.view,
                size = 0;
            dst.setUint8(offset, value | 0x80);
            if (value >= (1 << 7)) {
                dst.setUint8(offset+1, (value >> 7) | 0x80);
                if (value >= (1 << 14)) {
                    dst.setUint8(offset+2, (value >> 14) | 0x80);
                    if (value >= (1 << 21)) {
                        dst.setUint8(offset+3, (value >> 21) | 0x80);
                        if (value >= (1 << 28)) {
                            dst.setUint8(offset+4, (value >> 28) & 0x7F);
                            size = 5;
                        } else {
                            dst.setUint8(offset+3, dst.getUint8(offset+3) & 0x7F);
                            size = 4;
                        }
                    } else {
                        dst.setUint8(offset+2, dst.getUint8(offset+2) & 0x7F);
                        size = 3;
                    }
                } else {
                    dst.setUint8(offset+1, dst.getUint8(offset+1) & 0x7F);
                    size = 2;
                }
            } else {
                dst.setUint8(offset, dst.getUint8(offset) & 0x7F);
                size = 1;
            }
            if (advance) {
                this.offset += size;
                return this;
            } else {
                return size;
            }
        };

        /**
         * Reads a 32bit base 128 variable-length integer as used in protobuf.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number|!{value: number, length: number}} The value read if offset is omitted, else the value read
         *  and the actual number of bytes read.
         * @throws {Error} If it's not a valid varint
         * @expose
         */
        ByteBuffer.prototype.readVarint32 = function(offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            // ref: src/google/protobuf/io/coded_stream.cc

            var count = 0, b,
                src = this.view;
            var value = 0 >>> 0;
            do {
                b = src.getUint8(offset+count);
                if (count < ByteBuffer.MAX_VARINT32_BYTES) {
                    value |= ((b&0x7F)<<(7*count)) >>> 0;
                }
                ++count;
            } while (b & 0x80);
            value = value | 0; // Make sure to discard the higher order bits
            if (advance) {
                this.offset += count;
                return value;
            } else {
                return {
                    "value": value,
                    "length": count
                };
            }
        };

        /**
         * Writes a zigzag encoded 32bit base 128 encoded variable-length integer as used in protobuf.
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeZigZagVarint32 = function(value, offset) {
            return this.writeVarint32(ByteBuffer.zigZagEncode32(value), offset);
        };

        /**
         * Reads a zigzag encoded 32bit base 128 variable-length integer as used in protobuf.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {number|!{value: number, length: number}} The value read if offset is omitted, else the value read
         *  and the actual number of bytes read.
         * @throws {Error} If it's not a valid varint
         * @expose
         */
        ByteBuffer.prototype.readZigZagVarint32 = function(offset) {
            var dec = this.readVarint32(offset);
            if (typeof dec === 'object') {
                dec['value'] = ByteBuffer.zigZagDecode32(dec['value']);
                return dec;
            }
            return ByteBuffer.zigZagDecode32(dec);
        };

        /**
         * Maximum number of bytes used by a 64bit base 128 variable-length integer.
         * @type {number}
         * @const
         * @expose
         */
        ByteBuffer.MAX_VARINT64_BYTES = 10;

        /**
         * @type {number}
         * @const
         * @inner
         */
        var TWO_PWR_7_DBL = 1 << 7;

        /**
         * @type {number}
         * @const
         * @inner
         */
        var TWO_PWR_14_DBL = TWO_PWR_7_DBL * TWO_PWR_7_DBL;

        /**
         * @type {number}
         * @const
         * @inner
         */
        var TWO_PWR_21_DBL = TWO_PWR_7_DBL * TWO_PWR_14_DBL;

        /**
         * @type {number}
         * @const
         * @inner
         */
        var TWO_PWR_28_DBL = TWO_PWR_14_DBL * TWO_PWR_14_DBL;

        // Available with Long.js only
        if (Long) {

            /**
             * Writes a 64bit base 128 variable-length integer as used in protobuf.
             * @param {number|Long} value Value to write
             * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
             * @expose
             */
            ByteBuffer.prototype.writeVarint64 = function(value, offset) {
                var advance = typeof offset === 'undefined';
                offset = typeof offset !== 'undefined' ? offset : this.offset;
                if (!(typeof value === 'object' && value instanceof Long)) value = Long.fromNumber(value, false);
    
                var part0 = value.toInt() >>> 0,
                    part1 = value.shiftRightUnsigned(28).toInt() >>> 0,
                    part2 = value.shiftRightUnsigned(56).toInt() >>> 0,
                    size = ByteBuffer.calculateVarint64(value);
    
                this.ensureCapacity(offset+size);
                var dst = this.view;
                switch (size) {
                    case 10: dst.setUint8(offset+9, (part2 >>>  7) | 0x80);
                    case 9 : dst.setUint8(offset+8, (part2       ) | 0x80);
                    case 8 : dst.setUint8(offset+7, (part1 >>> 21) | 0x80);
                    case 7 : dst.setUint8(offset+6, (part1 >>> 14) | 0x80);
                    case 6 : dst.setUint8(offset+5, (part1 >>>  7) | 0x80);
                    case 5 : dst.setUint8(offset+4, (part1       ) | 0x80);
                    case 4 : dst.setUint8(offset+3, (part0 >>> 21) | 0x80);
                    case 3 : dst.setUint8(offset+2, (part0 >>> 14) | 0x80);
                    case 2 : dst.setUint8(offset+1, (part0 >>>  7) | 0x80);
                    case 1 : dst.setUint8(offset+0, (part0       ) | 0x80);
                }
                dst.setUint8(offset+size-1, dst.getUint8(offset+size-1) & 0x7F);
                if (advance) {
                    this.offset += size;
                    return this;
                } else {
                    return size;
                }
            };
    
            /**
             * Reads a 32bit base 128 variable-length integer as used in protobuf. Requires Long.js.
             * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
             * @returns {!Long|!{value: Long, length: number}} The value read if offset is omitted, else the value read and
             *  the actual number of bytes read.
             * @throws {Error} If it's not a valid varint
             * @expose
             */
            ByteBuffer.prototype.readVarint64 = function(offset) {
                var advance = typeof offset === 'undefined';
                offset = typeof offset !== 'undefined' ? offset : this.offset;
                var start = offset;
                // ref: src/google/protobuf/io/coded_stream.cc
    
                var src = this.view,
                    part0, part1 = 0, part2 = 0, b;
                b = src.getUint8(offset++); part0  = (b & 0x7F)      ; if (b & 0x80) {
                b = src.getUint8(offset++); part0 |= (b & 0x7F) <<  7; if (b & 0x80) {
                b = src.getUint8(offset++); part0 |= (b & 0x7F) << 14; if (b & 0x80) {
                b = src.getUint8(offset++); part0 |= (b & 0x7F) << 21; if (b & 0x80) {
                b = src.getUint8(offset++); part1  = (b & 0x7F)      ; if (b & 0x80) {
                b = src.getUint8(offset++); part1 |= (b & 0x7F) <<  7; if (b & 0x80) {
                b = src.getUint8(offset++); part1 |= (b & 0x7F) << 14; if (b & 0x80) {
                b = src.getUint8(offset++); part1 |= (b & 0x7F) << 21; if (b & 0x80) {
                b = src.getUint8(offset++); part2  = (b & 0x7F)      ; if (b & 0x80) {
                b = src.getUint8(offset++); part2 |= (b & 0x7F) <<  7; if (b & 0x80) {
                throw(new Error("Data must be corrupt: Buffer overrun")); }}}}}}}}}}
                
                var value = Long.from28Bits(part0, part1, part2, false);
                if (advance) {
                    this.offset = offset;
                    return value;
                } else {
                    return {
                        "value": value,
                        "length": offset-start
                    };
                }
            };
    
            /**
             * Writes a zigzag encoded 64bit base 128 encoded variable-length integer as used in protobuf.
             * @param {number} value Value to write
             * @param {number=} offset Offset to write to. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
             * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
             * @expose
             */
            ByteBuffer.prototype.writeZigZagVarint64 = function(value, offset) {
                return this.writeVarint64(ByteBuffer.zigZagEncode64(value), offset);
            };
    
            /**
             * Reads a zigzag encoded 64bit base 128 variable-length integer as used in protobuf.
             * @param {number=} offset Offset to read from. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
             * @returns {Long|!{value: Long, length: number}} The value read if offset is omitted, else the value read and the actual number of bytes read.
             * @throws {Error} If it's not a valid varint
             * @expose
             */
            ByteBuffer.prototype.readZigZagVarint64 = function(offset) {
                var dec = this.readVarint64(offset);
                if (typeof dec === 'object' && !(dec instanceof Long)) {
                    dec['value'] = ByteBuffer.zigZagDecode64(dec['value']);
                    return dec;
                }
                return ByteBuffer.zigZagDecode64(dec);
            };
                
         }

        /**
         * Writes a base 128 variable-length integer as used in protobuf. This is an alias of {@link ByteBuffer#writeVarint32}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeVarint = ByteBuffer.prototype.writeVarint32;

        /**
         * Reads a base 128 variable-length integer as used in protobuf. This is an alias of {@link ByteBuffer#readVarint32}.
         * @function
         * @param {number=} offset Offset to read from. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
         * @returns {number|{value: number, length: number}} The value read if offset is omitted, else the value read and the actual number of bytes read.
         * @expose
         */
        ByteBuffer.prototype.readVarint = ByteBuffer.prototype.readVarint32;

        /**
         * Writes a zigzag encoded base 128 encoded variable-length integer as used in protobuf. This is an alias of {@link ByteBuffer#writeZigZagVarint32}.
         * @function
         * @param {number} value Value to write
         * @param {number=} offset Offset to write to. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeZigZagVarint = ByteBuffer.prototype.writeZigZagVarint32;

        /**
         * Reads a zigzag encoded base 128 variable-length integer as used in protobuf. This is an alias of {@link ByteBuffer#readZigZagVarint32}.
         * @function
         * @param {number=} offset Offset to read from. Defaults to {@link ByteBuffer#offset} which will be modified only if omitted.
         * @returns {number|{value: number, length: number}} The value read if offset is omitted, else the value read and the actual number of bytes read.
         * @throws {Error} If it's not a valid varint
         * @expose
         */
        ByteBuffer.prototype.readZigZagVarint = ByteBuffer.prototype.readZigZagVarint32;

        /**
         * Calculates the actual number of bytes required to encode a 32bit base 128 variable-length integer.
         * @param {number} value Value to encode
         * @returns {number} Number of bytes required. Capped to {@link ByteBuffer.MAX_VARINT32_BYTES}
         * @expose
         */
        ByteBuffer.calculateVarint32 = function(value) {
            // ref: src/google/protobuf/io/coded_stream.cc
            value = value >>> 0;
            if (value < TWO_PWR_7_DBL) {
                return 1;
            } else if (value < TWO_PWR_14_DBL) {
                return 2;
            } else if (value < TWO_PWR_21_DBL) {
                return 3;
            } else if (value < TWO_PWR_28_DBL) {
                return 4;
            } else {
                return 5;
            }
        };
        
        // Available with Long.js only
        if (Long) {
    
            /**
             * Calculates the actual number of bytes required to encode a 64bit base 128 variable-length integer.
             * @param {number|!Long} value Value to encode
             * @returns {number} Number of bytes required. Capped to {@link ByteBuffer.MAX_VARINT64_BYTES}
             * @expose
             */
            ByteBuffer.calculateVarint64 = function(value) {
                // ref: src/google/protobuf/io/coded_stream.cc
                if (!(typeof value === 'object' && value instanceof Long)) value = Long.fromNumber(value, false);
    
                var part0 = value.toInt() >>> 0,
                    part1 = value.shiftRightUnsigned(28).toInt() >>> 0,
                    part2 = value.shiftRightUnsigned(56).toInt() >>> 0;
    
                if (part2 == 0) {
                    if (part1 == 0) {
                        if (part0 < TWO_PWR_14_DBL) {
                            return part0 < TWO_PWR_7_DBL ? 1 : 2;
                        } else {
                            return part0 < TWO_PWR_21_DBL ? 3 : 4;
                        }
                    } else {
                        if (part1 < TWO_PWR_14_DBL) {
                            return part1 < TWO_PWR_7_DBL ? 5 : 6;
                        } else {
                            return part1 < TWO_PWR_21_DBL ? 7 : 8;
                        }
                    }
                } else {
                    return part2 < TWO_PWR_7_DBL ? 9 : 10;
                }
            };
            
        }

        /**
         * Encodes a signed 32bit integer so that it can be effectively used with varint encoding.
         * @param {number} n Signed 32bit integer
         * @returns {number} Unsigned zigzag encoded 32bit integer
         * @expose
         */
        ByteBuffer.zigZagEncode32 = function(n) {
            // ref: src/google/protobuf/wire_format_lite.h
            return (((n |= 0) << 1) ^ (n >> 31)) >>> 0;
        };

        /**
         * Decodes a zigzag encoded signed 32bit integer.
         * @param {number} n Unsigned zigzag encoded 32bit integer
         * @returns {number} Signed 32bit integer
         * @expose
         */
        ByteBuffer.zigZagDecode32 = function(n) {
            // ref: src/google/protobuf/wire_format_lite.h
            return ((n >>> 1) ^ -(n & 1)) | 0;
        };
        
        // Available with Long.js only
        if (Long) {
    
            /**
             * Encodes a signed 64bit integer so that it can be effectively used with varint encoding.
             * @param {number|!Long} n Signed long
             * @returns {!Long} Unsigned zigzag encoded long
             * @expose
             */
            ByteBuffer.zigZagEncode64 = function(n) {
                // ref: src/google/protobuf/wire_format_lite.h
                if (typeof n === 'object' && n instanceof Long) {
                    if (n.unsigned) n = n.toSigned();
                } else {
                    n = Long.fromNumber(n, false);
                }
                return n.shiftLeft(1).xor(n.shiftRight(63)).toUnsigned();
            };
    
            /**
             * Decodes a zigzag encoded signed 64bit integer.
             * @param {!Long|number} n Unsigned zigzag encoded long or JavaScript number
             * @returns {!Long} Signed long
             * @throws {Error} If long support is not available
             * @expose
             */
            ByteBuffer.zigZagDecode64 = function(n) {
                // ref: src/google/protobuf/wire_format_lite.h
                if (typeof n === 'object' && n instanceof Long) {
                    if (!n.unsigned) n = n.toUnsigned();
                } else {
                    n = Long.fromNumber(n, true);
                }
                return n.shiftRightUnsigned(1).xor(n.and(Long.ONE).toSigned().negate()).toSigned();
            };
            
        }

        /**
         * Decodes a single UTF8 character from the specified ByteBuffer. The ByteBuffer's offsets are not modified.
         * @param {!ByteBuffer} src
         * @param {number} offset Offset to read from
         * @returns {!{char: number, length: number}} Decoded char code and the actual number of bytes read
         * @throws {Error} If the character cannot be decoded or there is a capacity overflow
         * @expose
         */
        ByteBuffer.decodeUTF8Char = function(src, offset) {
            var a = src.readUint8(offset), b, c, d, e, f, start = offset, charCode;
            // ref: http://en.wikipedia.org/wiki/UTF-8#Description
            // It's quite huge but should be pretty fast.
            if ((a&0x80)==0) {
                charCode = a;
                offset += 1;
            } else if ((a&0xE0)==0xC0) {
                b = src.readUint8(offset+1);
                charCode = ((a&0x1F)<<6) | (b&0x3F);
                offset += 2;
            } else if ((a&0xF0)==0xE0) {
                b = src.readUint8(offset+1);
                c = src.readUint8(offset+2);
                charCode = ((a&0x0F)<<12) | ((b&0x3F)<<6) | (c&0x3F);
                offset += 3;
            } else if ((a&0xF8)==0xF0) {
                b = src.readUint8(offset+1);
                c = src.readUint8(offset+2);
                d = src.readUint8(offset+3);
                charCode = ((a&0x07)<<18) | ((b&0x3F)<<12) | ((c&0x3F)<<6) | (d&0x3F);
                offset += 4;
            } else if ((a&0xFC)==0xF8) {
                b = src.readUint8(offset+1);
                c = src.readUint8(offset+2);
                d = src.readUint8(offset+3);
                e = src.readUint8(offset+4);
                charCode = ((a&0x03)<<24) | ((b&0x3F)<<18) | ((c&0x3F)<<12) | ((d&0x3F)<<6) | (e&0x3F);
                offset += 5;
            } else if ((a&0xFE)==0xFC) {
                b = src.readUint8(offset+1);
                c = src.readUint8(offset+2);
                d = src.readUint8(offset+3);
                e = src.readUint8(offset+4);
                f = src.readUint8(offset+5);
                charCode = ((a&0x01)<<30) | ((b&0x3F)<<24) | ((c&0x3F)<<18) | ((d&0x3F)<<12) | ((e&0x3F)<<6) | (f&0x3F);
                offset += 6;
            } else {
                throw(new Error("Cannot decode UTF8 character at offset "+offset+": charCode (0x"+a.toString(16)+") is invalid"));
            }
            return {
                "char": charCode ,
                "length": offset-start
            };
        };

        /**
         * Encodes a single UTF8 character to the specified ByteBuffer. The ByteBuffer's offsets are not modified.
         * @param {number} charCode Character to encode as char code
         * @param {!ByteBuffer} dst ByteBuffer to encode to
         * @param {number} offset Offset to write to
         * @returns {number} Actual number of bytes written
         * @throws {Error} If the character cannot be encoded
         * @expose
         */
        ByteBuffer.encodeUTF8Char = function(charCode, dst, offset) {
            var start = offset;
            // ref: http://en.wikipedia.org/wiki/UTF-8#Description
            // It's quite huge but should be pretty fast.
            if (charCode < 0) {
                throw(new Error("Cannot encode UTF8 character: charCode ("+charCode+") is negative"));
            }
            if (charCode < 0x80) {
                dst.writeUint8(charCode&0x7F, offset);
                offset += 1;
            } else if (charCode < 0x800) {
                dst.writeUint8(((charCode>>6)&0x1F)|0xC0, offset)
                    .writeUint8((charCode&0x3F)|0x80, offset+1);
                offset += 2;
            } else if (charCode < 0x10000) {
                dst.writeUint8(((charCode>>12)&0x0F)|0xE0, offset)
                    .writeUint8(((charCode>>6)&0x3F)|0x80, offset+1)
                    .writeUint8((charCode&0x3F)|0x80, offset+2);
                offset += 3;
            } else if (charCode < 0x200000) {
                dst.writeUint8(((charCode>>18)&0x07)|0xF0, offset)
                    .writeUint8(((charCode>>12)&0x3F)|0x80, offset+1)
                    .writeUint8(((charCode>>6)&0x3F)|0x80, offset+2)
                    .writeUint8((charCode&0x3F)|0x80, offset+3);
                offset += 4;
            } else if (charCode < 0x4000000) {
                dst.writeUint8(((charCode>>24)&0x03)|0xF8, offset)
                    .writeUint8(((charCode>>18)&0x3F)|0x80, offset+1)
                    .writeUint8(((charCode>>12)&0x3F)|0x80, offset+2)
                    .writeUint8(((charCode>>6)&0x3F)|0x80, offset+3)
                    .writeUint8((charCode&0x3F)|0x80, offset+4);
                offset += 5;
            } else if (charCode < 0x80000000) {
                dst.writeUint8(((charCode>>30)&0x01)|0xFC, offset)
                    .writeUint8(((charCode>>24)&0x3F)|0x80, offset+1)
                    .writeUint8(((charCode>>18)&0x3F)|0x80, offset+2)
                    .writeUint8(((charCode>>12)&0x3F)|0x80, offset+3)
                    .writeUint8(((charCode>>6)&0x3F)|0x80, offset+4)
                    .writeUint8((charCode&0x3F)|0x80, offset+5);
                offset += 6;
            } else {
                throw(new Error("Cannot encode UTF8 character: charCode (0x"+charCode.toString(16)+") is too large (>= 0x80000000)"));
            }
            return offset-start;
        };

        /**
         * Calculates the actual number of bytes required to encode the specified char code.
         * @param {number} charCode Character to encode as char code
         * @returns {number} Number of bytes required to encode the specified char code
         * @throws {Error} If the character cannot be calculated (too large)
         * @expose
         */
        ByteBuffer.calculateUTF8Char = function(charCode) {
            if (charCode < 0) {
                throw(new Error("Cannot calculate length of UTF8 character: charCode ("+charCode+") is negative"));
            }
            if (charCode < 0x80) {
                return 1;
            } else if (charCode < 0x800) {
                return 2;
            } else if (charCode < 0x10000) {
                return 3;
            } else if (charCode < 0x200000) {
                return 4;
            } else if (charCode < 0x4000000) {
                return 5;
            } else if (charCode < 0x80000000) {
                return 6;
            } else {
                throw(new Error("Cannot calculate length of UTF8 character: charCode (0x"+charCode.toString(16)+") is too large (>= 0x80000000)"));
            }
        };

        /**
         * Calculates the number of bytes required to store an UTF8 encoded string.
         * @param {string} str String to calculate
         * @returns {number} Number of bytes required
         */
        ByteBuffer.calculateUTF8String = function(str) {
            str = ""+str;
            var bytes = 0;
            for (var i=0, k=str.length; i<k; ++i) {
                // Does not throw since JS strings are already UTF8 encoded
                bytes += ByteBuffer.calculateUTF8Char(str.charCodeAt(i));
            }
            return bytes;
        };

        /**
         * Base64 alphabet.
         * @type {string}
         * @inner
         */
        var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        B64 = B64+""; // Prevent CC from inlining this for less code size

        /**
         * Encodes a ByteBuffer's contents to a base64 string.
         * @param {!ByteBuffer} bb ByteBuffer to encode. Will be cloned and flipped if length < offset.
         * @returns {string} Base64 encoded string
         * @throws {Error} If the argument is not a valid ByteBuffer
         * @expose
         */
        ByteBuffer.encode64 = function(bb) {
            // ref: http://phpjs.org/functions/base64_encode/
             if (!(bb instanceof ByteBuffer)) {
                bb = ByteBuffer.wrap(bb);
            } else if (bb.length < bb.offset) {
                 bb = bb.clone().flip();
             }
            var o1, o2, o3, h1, h2, h3, h4, bits, i = bb.offset,
                oi = 0,
                out = [];
            do {
                o1 = bb.readUint8(i++);
                o2 = bb.length > i ? bb.readUint8(i++) : 0;
                o3 = bb.length > i ? bb.readUint8(i++) : 0;
                bits = o1 << 16 | o2 << 8 | o3;
                h1 = bits >> 18 & 0x3f;
                h2 = bits >> 12 & 0x3f;
                h3 = bits >> 6 & 0x3f;
                h4 = bits & 0x3f;
                out[oi++] = B64.charAt(h1) + B64.charAt(h2) + B64.charAt(h3) + B64.charAt(h4);
            } while (i < bb.length);
            var enc = out.join(''),
                r = (bb.length - bb.offset) % 3;
            return (r ? enc.slice(0, r - 3) : enc) + '==='.slice(r || 3);
        };

        /**
         * Decodes a base64 encoded string to a ByteBuffer.
         * @param {string} str Base64 encoded string
         * @param {boolean=} littleEndian `true` to use little endian byte order, defaults to `false` for big endian.
         * @returns {!ByteBuffer} ByteBuffer
         * @throws {Error} If the argument is not a valid base64 encoded string
         * @expose
         */
        ByteBuffer.decode64 = function(str, littleEndian) {
            // ref: http://phpjs.org/functions/base64_decode/
            if (typeof str !== 'string') {
                throw(new Error("Illegal argument: Not a string"));
            }
            var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
                out = new ByteBuffer(Math.ceil(str.length / 3), littleEndian);
            do {
                h1 = B64.indexOf(str.charAt(i++));
                h2 = B64.indexOf(str.charAt(i++));
                h3 = B64.indexOf(str.charAt(i++));
                h4 = B64.indexOf(str.charAt(i++));
                if (h1 < 0 || h2 < 0 || h3 < 0 || h4 < 0) {
                    throw(new Error("Illegal argument: Not a valid base64 encoded string"));
                }
                bits = h1 << 18 | h2 << 12 | h3 << 6 | h4;
                o1 = bits >> 16 & 0xff;
                o2 = bits >> 8 & 0xff;
                o3 = bits & 0xff;
                if (h3 == 64) {
                    out.writeUint8(o1);
                } else if (h4 == 64) {
                    out.writeUint8(o1)
                        .writeUint8(o2);
                } else {
                    out.writeUint8(o1)
                        .writeUint8(o2)
                        .writeUint8(o3);
                }
            } while (i < str.length);
            return out.flip();
        };

        /**
         * Encodes a ByteBuffer to a hex encoded string.
         * @param {!ByteBuffer} bb ByteBuffer to encode. Will be cloned and flipped if length < offset.
         * @returns {string} Hex encoded string
         * @throws {Error} If the argument is not a valid ByteBuffer
         * @expose
         */
        ByteBuffer.encodeHex = function(bb) {
            if (!(bb instanceof ByteBuffer)) {
                bb = ByteBuffer.wrap(bb);
            } else if (bb.length < bb.offset) {
                bb = bb.clone().flip();
            }
            if (bb.array === null) return "";
            var val, out = [];
            for (var i=bb.offset, k=bb.length; i<k; ++i) {
                val = bb.view.getUint8(i).toString(16).toUpperCase();
                if (val.length < 2) val = "0"+val;
                out.push(val);
            }
            return out.join('');
        };

        /**
         * Decodes a hex encoded string to a ByteBuffer.
         * @param {string} str Hex encoded string
         * @param {boolean=} littleEndian `true` to use little endian byte order, defaults to `false` for big endian.
         * @returns {!ByteBuffer} ByteBuffer
         * @throws {Error} If the argument is not a valid hex encoded string
         * @expose
         */
        ByteBuffer.decodeHex = function(str, littleEndian) {
            if (typeof str !== 'string') {
                throw(new Error("Illegal argument: Not a string"));
            }
            if (str.length % 2 !== 0) {
                throw(new Error("Illegal argument: Not a hex encoded string"));
            }
            var o,
                out = new ByteBuffer(str.length/2, littleEndian);
            for (var i=0, k=str.length; i<k; i+=2) {
                out.writeUint8(parseInt(str.substring(i, i+2), 16));
            }
            return out.flip();
        };

        // NOTE on binary strings: Binary strings as used here have nothing to do with frequently asked questions about
        // conversion between ArrayBuffer and String. What we do here is what libraries like node-forge do to simulate a
        // byte buffer: Conversion between 8 bit unsigned integers and the low 8 bit UTF8/UCS2 characters. This is not
        // perfect as it effectively uses 16 bit per character in memory to store the 8 bit values, but that's not our
        // concern as we just want it to be compatible. It's always better to use ArrayBuffer/Buffer (!) while base64
        // and hex should be slightly worse regarding memory consumption and encoding speed.

        /**
         * Encodes a ByteBuffer to a binary string. A binary string in this case is a string composed of 8bit values
         *  as characters with a char code between 0 and 255 inclusive.
         * @param {!ByteBuffer} bb ByteBuffer to encode. Will be cloned and flipped if length < offset.
         * @returns {string} Binary string
         * @throws {Error} If the argument is not a valid ByteBuffer
         * @expose
         */
        ByteBuffer.encodeBinary = function(bb) {
            if (!(bb instanceof ByteBuffer)) {
                bb = ByteBuffer.wrap(bb);
            } else if (bb.length < bb.offset) {
                bb = bb.clone().flip();
            }
            var out = [], view = bb.view;
            for (var i=bb.offset, k=bb.length; i<k; ++i) {
                out.push(String.fromCharCode(view.getUint8(i)));
            }
            return out.join('');
        };

        /**
         * Decodes a binary string to a ByteBuffer. A binary string in this case is a string composed of 8bit values
         *  as characters with a char code between 0 and 255 inclusive.
         * @param {string} str Binary string
         * @param {boolean=} littleEndian `true` to use little endian byte order, defaults to `false` for big endian.
         * @returns {!ByteBuffer} ByteBuffer
         * @throws {Error} If the argument is not a valid binary string
         * @expose
         */
        ByteBuffer.decodeBinary = function(str, littleEndian) {
            if (typeof str !== 'string') {
                throw(new Error("Illegal argument: Not a string"));
            }
            var k=str.length,
                dst = new ArrayBuffer(k),
                view = new DataView(dst),
                val;
            for (var i=0; i<k; ++i) {
                if ((val = str.charCodeAt(i)) > 255) throw(new Error("Illegal argument: Not a binary string (char code "+val+")"));
                view.setUint8(i, val);
            }
            var bb = new ByteBuffer(k, littleEndian, true);
            bb.array = dst;
            bb.view = view;
            bb.length = k;
            return bb;
        };

        /**
         * Writes an UTF8 string.
         * @param {string} str String to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeUTF8String = function(str, offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var start = offset;
            var encLen = ByteBuffer.calculateUTF8String(str); // See [1]
            this.ensureCapacity(offset+encLen);
            for (var i=0, j=str.length; i<j; ++i) {
                // [1] Does not throw since JS strings are already UTF8 encoded
                offset += ByteBuffer.encodeUTF8Char(str.charCodeAt(i), this, offset);
            }
            if (advance) {
                this.offset = offset;
                return this;
            } else {
                return offset-start;
            }
        };

        /**
         * Reads an UTF8 string.
         * @param {number} chars Number of characters to read
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
         *  read and the actual number of bytes read.
         * @throws {Error} If the string cannot be decoded
         * @expose
         */
        ByteBuffer.prototype.readUTF8String = function(chars, offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var dec, result = "", start = offset;
            for (var i=0; i<chars; ++i) {
                dec = ByteBuffer.decodeUTF8Char(this, offset);
                offset += dec["length"];
                result += String.fromCharCode(dec["char"]);
            }
            if (advance) {
                this.offset = offset;
                return result;
            } else {
                return {
                    "string": result,
                    "length": offset-start
                }
            }
        };

        /**
         * Reads an UTF8 string with the specified byte length.
         * @param {number} length Byte length
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
         *  read and the actual number of bytes read.
         * @expose
         * @throws {Error} If the length did not match or the string cannot be decoded
         */
        ByteBuffer.prototype.readUTF8StringBytes = function(length, offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var dec, result = "", start = offset;
            length = offset + length; // Limit
            while (offset < length) {
                dec = ByteBuffer.decodeUTF8Char(this, offset);
                offset += dec["length"];
                result += String.fromCharCode(dec["char"]);
            }
            if (offset != length) {
                throw(new Error("Actual string length differs from the specified: "+((offset>length ? "+" : "")+offset-length)+" bytes"));
            }
            if (advance) {
                this.offset = offset;
                return result;
            } else {
                return {
                    "string": result,
                    "length": offset-start
                }
            }
        };

        /**
         * Writes a string with prepended number of characters, which is also encoded as an UTF8 character..
         * @param {string} str String to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
         * @expose
         */
        ByteBuffer.prototype.writeLString = function(str, offset) {
            str = ""+str;
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var encLen = ByteBuffer.encodeUTF8Char(str.length, this, offset);
            encLen += this.writeUTF8String(str, offset+encLen);
            if (advance) {
                this.offset += encLen;
                return this;
            } else {
                return encLen;
            }
        };

        /**
         * Reads a string with a prepended number of characters, which is also encoded as an UTF8 character.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {string|{string: string, length: number}} The string read if offset is omitted, else the string read
         *  and the actual number of bytes read.
         * @throws {Error} If the string cannot be decoded
         * @expose
         */
        ByteBuffer.prototype.readLString = function(offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var lenDec = ByteBuffer.decodeUTF8Char(this, offset),
                dec = this.readUTF8String(lenDec["char"], offset+lenDec["length"]);
            if (advance) {
                this.offset += lenDec["length"]+dec["length"];
                return dec["string"];
            } else {
                return {
                    "string": dec["string"],
                    "length": lenDec["length"]+dec["length"]
                };
            }
        };

        /**
         * Writes a string with prepended number of characters, which is encoded as a 32bit base 128 variable-length
         *  integer.
         * @param {string} str String to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written
         * @expose
         */
        ByteBuffer.prototype.writeVString = function(str, offset) {
            str = ""+str;
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var encLen = this.writeVarint32(ByteBuffer.calculateUTF8String(str), offset);
            encLen += this.writeUTF8String(str, offset+encLen);
            if (advance) {
                this.offset += encLen;
                return this;
            } else {
                return encLen;
            }
        };

        /**
         * Reads a string with prepended number of characters, which is encoded as a 32bit base 128 variable-length 
         *  integer.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
         *  read and the actual number of bytes read.
         * @throws {Error} If the string cannot be decoded or if it is not preceeded by a valid varint
         * @expose
         */
        ByteBuffer.prototype.readVString = function(offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var lenDec = this.readVarint32(offset);
            var dec = this.readUTF8StringBytes(lenDec["value"], offset+lenDec["length"]);
            if (advance) {
                this.offset += lenDec["length"]+dec["length"];
                return dec["string"];
            } else {
                return {
                    "string": dec["string"],
                    "length": lenDec["length"]+dec["length"]
                };
            }
        };

        /**
         * Writes a string followed by a NULL character (Uint8). Beware: The source string must not contain NULL
         *  characters unless this is actually intended. This is not checked. If you have the option it is recommended
         *  to use {@link ByteBuffer#writeLString} or {@link ByteBuffer#writeVString} with the corresponding reading
         *  methods instead.
         * @param {string} str String to write
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written
         * @expose
         */
        ByteBuffer.prototype.writeCString = function(str, offset) {
            str = ""+str;
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var encLen = this.writeUTF8String(str, offset);
            this.writeUint8(0, offset+encLen);
            if (advance) {
                this.offset += encLen+1;
                return this;
            } else {
                return encLen+1;
            }
        };

        /**
         * Reads a string followed by a NULL character (Uint8).
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
         *  read and the actual number of bytes read.
         * @throws {Error} If the string cannot be decoded
         * @expose
         */
        ByteBuffer.prototype.readCString = function(offset) {
            var advance = typeof offset === 'undefined';
            offset = typeof offset !== 'undefined' ? offset : this.offset;
            var dec, result = "", start = offset;
            do {
                dec = ByteBuffer.decodeUTF8Char(this, offset);
                offset += dec["length"];
                if (dec["char"] != 0) result += String.fromCharCode(dec["char"]);
            } while (dec["char"] != 0);
            if (advance) {
                this.offset = offset;
                return result;
            } else {
                return {
                    "string": result,
                    "length": offset-start
                };
            }
        };

        /**
         * Serializes and writes a JSON payload.
         * @param {*} data Data payload to serialize
         * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @param {function(*)=} stringify Stringify implementation to use. Defaults to {@link JSON.stringify}.
         * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number if bytes written
         * @expose
         */
        ByteBuffer.prototype.writeJSON = function(data, offset, stringify) {
            stringify = typeof stringify === 'function' ? stringify : JSON.stringify;
            return this.writeLString(stringify(data), offset);
        };

        /**
         * Reads a JSON payload and unserializes it.
         * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} if omitted.
         * @param {function(string)=} parse Parse implementation to use. Defaults to {@link JSON.parse}.
         * @returns {!*|!{data: *, length: number}} Data payload if offset is omitted, else the data payload and the
         *  actual number of bytes read
         * @throws {Error} If the data cannot be decoded
         * @expose
         */
        ByteBuffer.prototype.readJSON = function(offset, parse) {
            parse = typeof parse === 'function' ? parse : JSON.parse;
            var result = this.readLString(offset);
            if (typeof result === 'string') {
                return parse(result);
            } else {
                return {
                    "data": parse(result["string"]),
                    "length":  result["length"]
                };
            }
        };

        /**
         * Returns a textual two columns (hex, ascii) representation of this ByteBuffer's backing array.
         * @param {number=} wrap Wrap length. Defaults to 16.
         * @returns {string} Hex representation as of " 00<01 02>03... ASCII DATA" with marked offsets
         * @expose
         */
        ByteBuffer.prototype.toColumns = function(wrap) {
            if (this.array === null) return "DESTROYED";
            wrap = typeof wrap !== 'undefined' ? parseInt(wrap, 10) : 16;
            if (wrap < 1) wrap = 16;

            // Left colum: hex with offsets
            var out = "",
                lines = [],
                val,
                view = this.view;
            if (this.offset == 0 && this.length == 0) {
                out += "|";
            } else if (this.length == 0) {
                out += ">";
            } else if (this.offset == 0) {
                out += "<";
            } else {
                out += " ";
            }
            for (var i=0, k=this.array.byteLength; i<k; ++i) {
                if (i>0 && i%wrap == 0) {
                    while (out.length < 3*wrap+1) out += "   "; // Make it equal to maybe show something on the right
                    lines.push(out);
                    out = " ";
                }
                val =  view.getUint8(i).toString(16).toUpperCase();
                if (val.length < 2) val = "0"+val;
                out += val;
                if (i+1 == this.offset && i+1 == this.length) {
                    out += "|";
                } else if (i+1 == this.offset) {
                    out += "<";
                } else if (i+1 == this.length) {
                    out += ">";
                } else {
                    out += " ";
                }
            }
            if (out != " ") {
                lines.push(out);
            }
            // Make it equal
            for (i=0, k=lines.length; i<k; ++i) {
                while (lines[i].length < 3*wrap+1) lines[i] += "   "; // Make it equal to maybe show something on the right
            }

            // Right column: ASCII, using dots for (usually) non-printable characters
            var n = 0;
            out = "";
            for (i=0, k=this.array.byteLength; i<k; ++i) {
                if (i>0 && i%wrap == 0) {
                    lines[n] += " "+out;
                    out = ""; n++;
                }
                val = view.getUint8(i);
                out += val > 32 && val < 127 ? String.fromCharCode(val) : ".";
            }
            if (out != "") {
                lines[n] += " "+out;
            }
            return lines.join("\n");
        };

        /**
         * Prints debug information about this ByteBuffer's contents.
         * @param {function(string)=} out Output function to call, defaults to console.log
         * @expose
         */
        ByteBuffer.prototype.printDebug = function(out) {
            if (typeof out !== 'function') out = console.log.bind(console);
            out(
                (this.array != null ? "ByteBuffer(offset="+this.offset+",markedOffset="+this.markedOffset+",length="+this.length+",capacity="+this.array.byteLength+")" : "ByteBuffer(DESTROYED)")+"\n"+
                    "-------------------------------------------------------------------\n"+
                    this.toColumns()+"\n"
            );
        };

        /**
         * Returns the ByteBuffer's contents between offset and length as a hex string.
         * @param {boolean=} debug `true` to return the entire backing array with marked offsets, defaults to `false`
         * @returns {string} Hex string or debug string
         * @expose
         */
        ByteBuffer.prototype.toHex = function(debug) {
            var out = "",
                val,
                view = this.view,
                i, k;
            if (!debug) {
                return ByteBuffer.encodeHex(this);
            } else {
                if (this.array === null) return "DESTROYED";
                if (this.offset == 0 && this.length == 0) {
                    out += "|";
                } else if (this.length == 0) {
                    out += ">";
                } else if (this.offset == 0) {
                    out += "<";
                } else {
                    out += " ";
                }
                for (i=0, k=this.array.byteLength; i<k; ++i) {
                    val =  view.getUint8(i).toString(16).toUpperCase();
                    if (val.length < 2) val = "0"+val;
                    out += val;
                    if (i+1 === this.offset && i+1 === this.length) {
                        out += "|";
                    } else if (i+1 == this.offset) {
                        out += "<";
                    } else if (i+1 == this.length) {
                        out += ">";
                    } else {
                        out += " ";
                    }
                }
                return out;
            }
        };

        /**
         * Returns the ByteBuffer's contents between offset and length as a binary string. A binary string in this case
         *  is a string composed of 8bit values as characters with a char code between 0 and 255 inclusive.
         * @returns {string} Binary string
         * @expose
         */
        ByteBuffer.prototype.toBinary = function() {
            return ByteBuffer.encodeBinary(this);
        };

        /**
         * Returns the base64 encoded representation of the ByteBuffer's contents.
         * @returns {string} Base 64 encoded string
         * @expose
         */
        ByteBuffer.prototype.toBase64 = function() {
            if (this.array === null || this.offset >= this.length) return "";
            return ByteBuffer.encode64(this);
        };

        /**
         * Returns the ByteBuffer's contents as an UTF8 encoded string.
         * @returns {string}
         * @expose
         */
        ByteBuffer.prototype.toUTF8 = function() {
            if (this.array === null || this.offset >= this.length) return "";
            return this.readUTF8StringBytes(this.length - this.offset, this.offset)["string"];
        };

        /**
         * Converts the ByteBuffer to a string.
         * @param {string=} enc Output encoding. Returns an informative string representation by default but also allows
         *  direct conversion to "utf8", "hex", "base64" and "binary" encoding. "debug" returns a hex representation with
         *  marked offsets.
         * @returns {string} String representation
         * @expose
         */
        ByteBuffer.prototype.toString = function(enc) {
            enc = enc || "";
            switch (enc) {
                case "utf8":
                    return this.toUTF8();
                case "base64":
                    return this.toBase64();
                case "hex":
                    return this.toHex();
                case "binary":
                    return this.toBinary();
                case "debug":
                    return this.toHex(true);
                default:
                    if (this.array === null) {
                        return "ByteBuffer(DESTROYED)";
                    }
                    return "ByteBuffer(offset="+this.offset+",markedOffset="+this.markedOffset+",length="+this.length+",capacity="+this.array.byteLength+")";
            }
        };

        /**
         * Returns an ArrayBuffer compacted to contain this ByteBuffer's actual contents. Will transparently
         *  {@link ByteBuffer#flip} the ByteBuffer if its offset is larger than its length. Will return a reference to
         *  the unmodified backing buffer if offset=0 and length=capacity unless forceCopy is set to true.
         * @param {boolean=} forceCopy `true` forces the creation of a copy, defaults to `false`
         * @returns {?ArrayBuffer} Compacted ArrayBuffer or null if already destroyed
         * @expose
         */
        ByteBuffer.prototype.toArrayBuffer = function(forceCopy) {
            if (this.array === null) return null;
            var b = this.clone();
            if (b.offset > b.length) {
                b.flip();
            }
            var copied = false;
            if (b.offset > 0 || b.length < b.array.byteLength) {
                b.compact(); // Will always create a new backing buffer because of the above condition
                copied = true;
            }
            return forceCopy && !copied ? b.copy().array : b.array;
        };
        
        // Available with node.js only
        if (Buffer) {
    
            /**
             * Returns a node Buffer compacted to contain this ByteBuffer's actual contents. Will transparently
             *  {@link ByteBuffer#flip} the ByteBuffer if its offset is larger than its length. Will also copy all data (not
             *  a reference).
             * @returns {?Buffer} Compacted node Buffer or null if already destroyed
             * @expose
             */
            ByteBuffer.prototype.toBuffer = function() {
                if (this.array === null) return null;
                var offset = this.offset, length = this.length;
                if (offset > length) {
                    var temp = offset;
                    offset = length;
                    length = temp;
                }
                return new Buffer(new Uint8Array(this.array).subarray(offset, length));
            };
            
        }

        return ByteBuffer;
    }
    
    // Enable module loading if available
    if (typeof module !== 'undefined' && module["exports"]) { // CommonJS
        module["exports"] = loadByteBuffer(require("long"));
    } else if (typeof define !== 'undefined' && define["amd"]) { // AMD
        define("ByteBuffer", ["Math/Long"], function(Long) { return loadByteBuffer(Long); });
    } else { // Shim
        if (!global["dcodeIO"]) global["dcodeIO"] = {};
        global["dcodeIO"]["ByteBuffer"] = loadByteBuffer(global["dcodeIO"]["Long"]);
    }

})(this);

},{"buffer":21,"long":40}],39:[function(require,module,exports){
/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>
 Copyright 2009 The Closure Library Authors. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS-IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
/**
 * @license Long.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
 * Released under the Apache License, Version 2.0
 * Derived from goog.math.Long from the Closure Library
 * see: https://github.com/dcodeIO/Long.js for details
 */
(function(global) {
    "use strict";

    /**
     * Constructs a 64-bit two's-complement integer, given its low and high 32-bit
     * values as *signed* integers.  See the from* functions below for more
     * convenient ways of constructing Longs.
     *
     * The internal representation of a long is the two given signed, 32-bit values.
     * We use 32-bit pieces because these are the size of integers on which
     * Javascript performs bit-operations.  For operations like addition and
     * multiplication, we split each number into 16-bit pieces, which can easily be
     * multiplied within Javascript's floating-point representation without overflow
     * or change in sign.
     *
     * In the algorithms below, we frequently reduce the negative case to the
     * positive case by negating the input(s) and then post-processing the result.
     * Note that we must ALWAYS check specially whether those values are MIN_VALUE
     * (-2^63) because -MIN_VALUE == MIN_VALUE (since 2^63 cannot be represented as
     * a positive number, it overflows back into a negative).  Not handling this
     * case would often result in infinite recursion.
     * 
     * @exports Long
     * @class A Long class for representing a 64-bit two's-complement integer value.
     * @param {number|!{low: number, high: number, unsigned: boolean}} low The low (signed) 32 bits of the long.
     *  Optionally accepts a Long-like object as the first parameter.
     * @param {number=} high The high (signed) 32 bits of the long.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to `false` (signed).
     * @constructor
     */
    var Long = function(low, high, unsigned) {
        if (low && typeof low === 'object') {
            high = low.high;
            unsigned = low.unsigned;
            low = low.low;
        }
        
        /**
         * The low 32 bits as a signed value.
         * @type {number}
         * @expose
         */
        this.low = low | 0;

        /**
         * The high 32 bits as a signed value.
         * @type {number}
         * @expose
         */
        this.high = high | 0;

        /**
         * Whether unsigned or not.
         * @type {boolean}
         * @expose
         */
        this.unsigned = !!unsigned;
    };

    // NOTE: Common constant values ZERO, ONE, NEG_ONE, etc. are defined below the from* methods on which they depend.

    // NOTE: The following cache variables are used internally only and are therefore not exposed as properties of the
    // Long class.
    
    /**
     * A cache of the Long representations of small integer values.
     * @type {!Object}
     */
    var INT_CACHE = {};

    /**
     * A cache of the Long representations of small unsigned integer values.
     * @type {!Object}
     */
    var UINT_CACHE = {};

    /**
     * Returns a Long representing the given (32-bit) integer value.
     * @param {number} value The 32-bit integer in question.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromInt = function(value, unsigned) {
        var obj, cachedObj;
        if (!unsigned) {
            value = value | 0;
            if (-128 <= value && value < 128) {
                cachedObj = INT_CACHE[value];
                if (cachedObj) return cachedObj;
            }
            obj = new Long(value, value < 0 ? -1 : 0, false);
            if (-128 <= value && value < 128) {
                INT_CACHE[value] = obj;
            }
            return obj;
        } else {
            value = value >>> 0;
            if (0 <= value && value < 256) {
                cachedObj = UINT_CACHE[value];
                if (cachedObj) return cachedObj;
            }
            obj = new Long(value, (value | 0) < 0 ? -1 : 0, true);
            if (0 <= value && value < 256) {
                UINT_CACHE[value] = obj;
            }
            return obj;
        }
    };

    /**
     * Returns a Long representing the given value, provided that it is a finite
     * number.  Otherwise, zero is returned.
     * @param {number} value The number in question.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromNumber = function(value, unsigned) {
        unsigned = !!unsigned;
        if (isNaN(value) || !isFinite(value)) {
            return Long.ZERO;
        } else if (!unsigned && value <= -TWO_PWR_63_DBL) {
            return Long.MIN_SIGNED_VALUE;
        } else if (!unsigned && value + 1 >= TWO_PWR_63_DBL) {
            return Long.MAX_SIGNED_VALUE;
        } else if (unsigned && value >= TWO_PWR_64_DBL) {
            return Long.MAX_UNSIGNED_VALUE;
        } else if (value < 0) {
            return Long.fromNumber(-value, unsigned).negate();
        } else {
            return new Long((value % TWO_PWR_32_DBL) | 0, (value / TWO_PWR_32_DBL) | 0, unsigned);
        }
    };

    /**
     * Returns a Long representing the 64bit integer that comes by concatenating the given low and high bits. Each is
     *  assumed to use 32 bits.
     * @param {number} lowBits The low 32 bits.
     * @param {number} highBits The high 32 bits.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromBits = function(lowBits, highBits, unsigned) {
        return new Long(lowBits, highBits, unsigned);
    };

    /**
     * Returns a Long representing the 64bit integer that comes by concatenating the given low, middle and high bits.
     * Each is assumed to use 28 bits.
     * @param {number} part0 The low 28 bits
     * @param {number} part1 The middle 28 bits
     * @param {number} part2 The high 28 (8) bits
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long}
     * @expose
     */
    Long.from28Bits = function(part0, part1, part2, unsigned) {
        // 00000000000000000000000000001111 11111111111111111111111122222222 2222222222222
        // LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH
        return Long.fromBits(part0 | (part1 << 28), (part1 >>> 4) | (part2) << 24, unsigned);
    };

    /**
     * Returns a Long representation of the given string, written using the given radix.
     * @param {string} str The textual representation of the Long.
     * @param {(boolean|number)=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @param {number=} radix The radix in which the text is written.
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromString = function(str, unsigned, radix) {
        if (str.length === 0)
            throw Error('number format error: empty string');
        if (str === "NaN" || str === "Infinity" || str === "+Infinity" || str === "-Infinity")
            return Long.ZERO;
        if (typeof unsigned === 'number') { // For goog.math.Long compatibility
            radix = unsigned;
            unsigned = false;
        }
        radix = radix || 10;
        if (radix < 2 || 36 < radix)
            throw Error('radix out of range: ' + radix);

        var p;
        if ((p = str.indexOf('-')) > 0)
            throw Error('number format error: interior "-" character: ' + str);
        else if (p === 0)
            return Long.fromString(str.substring(1), unsigned, radix).negate();

        // Do several (8) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = Long.fromNumber(Math.pow(radix, 8));

        var result = Long.ZERO;
        for (var i = 0; i < str.length; i += 8) {
            var size = Math.min(8, str.length - i);
            var value = parseInt(str.substring(i, i + size), radix);
            if (size < 8) {
                var power = Long.fromNumber(Math.pow(radix, size));
                result = result.multiply(power).add(Long.fromNumber(value));
            } else {
                result = result.multiply(radixToPower);
                result = result.add(Long.fromNumber(value));
            }
        }
        result.unsigned = unsigned;
        return result;
    };

    // NOTE: the compiler should inline these constant values below and then remove these variables, so there should be
    // no runtime penalty for these.
    
    // NOTE: The following constant values are used internally only and are therefore not exposed as properties of the
    // Long class.

    /**
     * @type {number}
     */
    var TWO_PWR_16_DBL = 1 << 16;

    /**
     * @type {number}
     */
    var TWO_PWR_24_DBL = 1 << 24;

    /**
     * @type {number}
     */
    var TWO_PWR_32_DBL = TWO_PWR_16_DBL * TWO_PWR_16_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_31_DBL = TWO_PWR_32_DBL / 2;

    /**
     * @type {number}
     */
    var TWO_PWR_48_DBL = TWO_PWR_32_DBL * TWO_PWR_16_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_64_DBL = TWO_PWR_32_DBL * TWO_PWR_32_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_63_DBL = TWO_PWR_64_DBL / 2;

    /**
     * @type {!Long}
     */
    var TWO_PWR_24 = Long.fromInt(1 << 24);

    /**
     * @type {!Long}
     * @expose
     */
    Long.ZERO = Long.fromInt(0);

    /**
     * @type {!Long}
     * @expose
     */
    Long.UZERO = Long.fromInt(0, true);

    /**
     * @type {!Long}
     * @expose
     */
    Long.ONE = Long.fromInt(1);

    /**
     * @type {!Long}
     * @expose
     */
    Long.UONE = Long.fromInt(1, true);

    /**
     * @type {!Long}
     * @expose
     */
    Long.NEG_ONE = Long.fromInt(-1);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MAX_SIGNED_VALUE = Long.fromBits(0xFFFFFFFF | 0, 0x7FFFFFFF | 0, false);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MAX_UNSIGNED_VALUE = Long.fromBits(0xFFFFFFFF | 0, 0xFFFFFFFF | 0, true);

    /**
     * Alias of {@link Long.MAX_SIGNED_VALUE} for goog.math.Long compatibility.
     * @type {!Long}
     * @expose
     */
    Long.MAX_VALUE = Long.MAX_SIGNED_VALUE;

    /**
     * @type {!Long}
     * @expose
     */
    Long.MIN_SIGNED_VALUE = Long.fromBits(0, 0x80000000 | 0, false);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MIN_UNSIGNED_VALUE = Long.fromBits(0, 0, true);

    /**
     * Alias of {@link Long.MIN_SIGNED_VALUE}  for goog.math.Long compatibility.
     * @type {!Long}
     * @expose
     */
    Long.MIN_VALUE = Long.MIN_SIGNED_VALUE;

    /**
     * @return {number} The value, assuming it is a 32-bit integer.
     * @expose
     */
    Long.prototype.toInt = function() {
        return this.unsigned ? this.low >>> 0 : this.low;
    };

    /**
     * @return {number} The closest floating-point representation to this value.
     * @expose
     */
    Long.prototype.toNumber = function() {
        if (this.unsigned) {
            return ((this.high >>> 0) * TWO_PWR_32_DBL) + (this.low >>> 0);
        }
        return this.high * TWO_PWR_32_DBL + (this.low >>> 0);
    };

    /**
     * @param {number=} radix The radix in which the text should be written.
     * @return {string} The textual representation of this value.
     * @override
     * @expose
     */
    Long.prototype.toString = function(radix) {
        radix = radix || 10;
        if (radix < 2 || 36 < radix) {
            throw(new Error('radix out of range: ' + radix));
        }
        if (this.isZero()) {
            return '0';
        }
        var rem;
        if (this.isNegative()) { // Unsigned Longs are never negative
            if (this.equals(Long.MIN_SIGNED_VALUE)) {
                // We need to change the Long value before it can be negated, so we remove
                // the bottom-most digit in this base and then recurse to do the rest.
                var radixLong = Long.fromNumber(radix);
                var div = this.div(radixLong);
                rem = div.multiply(radixLong).subtract(this);
                return div.toString(radix) + rem.toInt().toString(radix);
            } else {
                return '-' + this.negate().toString(radix);
            }
        }

        // Do several (6) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = Long.fromNumber(Math.pow(radix, 6), this.unsigned);
        rem = this;
        var result = '';
        while (true) {
            var remDiv = rem.div(radixToPower);
            var intval = rem.subtract(remDiv.multiply(radixToPower)).toInt() >>> 0;
            var digits = intval.toString(radix);
            rem = remDiv;
            if (rem.isZero()) {
                return digits + result;
            } else {
                while (digits.length < 6) {
                    digits = '0' + digits;
                }
                result = '' + digits + result;
            }
        }
    };

    /**
     * @return {number} The high 32 bits as a signed value.
     * @expose
     */
    Long.prototype.getHighBits = function() {
        return this.high;
    };

    /**
     * @return {number} The high 32 bits as an unsigned value.
     * @expose
     */
    Long.prototype.getHighBitsUnsigned = function() {
        return this.high >>> 0;
    };

    /**
     * @return {number} The low 32 bits as a signed value.
     * @expose
     */
    Long.prototype.getLowBits = function() {
        return this.low;
    };

    /**
     * @return {number} The low 32 bits as an unsigned value.
     * @expose
     */
    Long.prototype.getLowBitsUnsigned = function() {
        return this.low >>> 0;
    };

    /**
     * @return {number} Returns the number of bits needed to represent the absolute
     *     value of this Long.
     * @expose
     */
    Long.prototype.getNumBitsAbs = function() {
        if (this.isNegative()) { // Unsigned Longs are never negative
            if (this.equals(Long.MIN_SIGNED_VALUE)) {
                return 64;
            } else {
                return this.negate().getNumBitsAbs();
            }
        } else {
            var val = this.high != 0 ? this.high : this.low;
            for (var bit = 31; bit > 0; bit--) {
                if ((val & (1 << bit)) != 0) {
                    break;
                }
            }
            return this.high != 0 ? bit + 33 : bit + 1;
        }
    };

    /**
     * @return {boolean} Whether this value is zero.
     * @expose
     */
    Long.prototype.isZero = function() {
        return this.high == 0 && this.low == 0;
    };

    /**
     * @return {boolean} Whether this value is negative.
     * @expose
     */
    Long.prototype.isNegative = function() {
        return !this.unsigned && this.high < 0;
    };

    /**
     * @return {boolean} Whether this value is odd.
     * @expose
     */
    Long.prototype.isOdd = function() {
        return (this.low & 1) == 1;
    };

    /**
     * @return {boolean} Whether this value is even.
     */
    Long.prototype.isEven = function() {
        return (this.low & 1) == 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long equals the other.
     * @expose
     */
    Long.prototype.equals = function(other) {
        if (this.unsigned != other.unsigned && (this.high >>> 31) != (other.high >>> 31)) return false;
        return (this.high == other.high) && (this.low == other.low);
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long does not equal the other.
     * @expose
     */
    Long.prototype.notEquals = function(other) {
        return !this.equals(other);
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is less than the other.
     * @expose
     */
    Long.prototype.lessThan = function(other) {
        return this.compare(other) < 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is less than or equal to the other.
     * @expose
     */
    Long.prototype.lessThanOrEqual = function(other) {
        return this.compare(other) <= 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is greater than the other.
     * @expose
     */
    Long.prototype.greaterThan = function(other) {
        return this.compare(other) > 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is greater than or equal to the other.
     * @expose
     */
    Long.prototype.greaterThanOrEqual = function(other) {
        return this.compare(other) >= 0;
    };

    /**
     * Compares this Long with the given one.
     * @param {Long} other Long to compare against.
     * @return {number} 0 if they are the same, 1 if the this is greater, and -1
     *     if the given one is greater.
     * @expose
     */
    Long.prototype.compare = function(other) {
        if (this.equals(other)) {
            return 0;
        }
        var thisNeg = this.isNegative();
        var otherNeg = other.isNegative();
        if (thisNeg && !otherNeg) return -1;
        if (!thisNeg && otherNeg) return 1;
        if (!this.unsigned) {
            // At this point the signs are the same
            return this.subtract(other).isNegative() ? -1 : 1;
        } else {
            // Both are positive if at least one is unsigned
            return (other.high >>> 0) > (this.high >>> 0) || (other.high == this.high && (other.low >>> 0) > (this.low >>> 0)) ? -1 : 1;
        }
    };

    /**
     * @return {!Long} The negation of this value.
     * @expose
     */
    Long.prototype.negate = function() {
        if (!this.unsigned && this.equals(Long.MIN_SIGNED_VALUE)) {
            return Long.MIN_SIGNED_VALUE;
        }
        return this.not().add(Long.ONE);
    };

    /**
     * Returns the sum of this and the given Long.
     * @param {Long} other Long to add to this one.
     * @return {!Long} The sum of this and the given Long.
     * @expose
     */
    Long.prototype.add = function(other) {
        // Divide each number into 4 chunks of 16 bits, and then sum the chunks.
        
        var a48 = this.high >>> 16;
        var a32 = this.high & 0xFFFF;
        var a16 = this.low >>> 16;
        var a00 = this.low & 0xFFFF;

        var b48 = other.high >>> 16;
        var b32 = other.high & 0xFFFF;
        var b16 = other.low >>> 16;
        var b00 = other.low & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 + b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 + b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 + b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 + b48;
        c48 &= 0xFFFF;
        return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32, this.unsigned);
    };

    /**
     * Returns the difference of this and the given Long.
     * @param {Long} other Long to subtract from this.
     * @return {!Long} The difference of this and the given Long.
     * @expose
     */
    Long.prototype.subtract = function(other) {
        return this.add(other.negate());
    };

    /**
     * Returns the product of this and the given long.
     * @param {Long} other Long to multiply with this.
     * @return {!Long} The product of this and the other.
     * @expose
     */
    Long.prototype.multiply = function(other) {
        if (this.isZero()) {
            return Long.ZERO;
        } else if (other.isZero()) {
            return Long.ZERO;
        }

        if (this.equals(Long.MIN_VALUE)) {
            return other.isOdd() ? Long.MIN_VALUE : Long.ZERO;
        } else if (other.equals(Long.MIN_VALUE)) {
            return this.isOdd() ? Long.MIN_VALUE : Long.ZERO;
        }

        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().multiply(other.negate());
            } else {
                return this.negate().multiply(other).negate();
            }
        } else if (other.isNegative()) {
            return this.multiply(other.negate()).negate();
        }
        // If both longs are small, use float multiplication
        if (this.lessThan(TWO_PWR_24) &&
            other.lessThan(TWO_PWR_24)) {
            return Long.fromNumber(this.toNumber() * other.toNumber(), this.unsigned);
        }

        // Divide each long into 4 chunks of 16 bits, and then add up 4x4 products.
        // We can skip products that would overflow.
        
        var a48 = this.high >>> 16;
        var a32 = this.high & 0xFFFF;
        var a16 = this.low >>> 16;
        var a00 = this.low & 0xFFFF;

        var b48 = other.high >>> 16;
        var b32 = other.high & 0xFFFF;
        var b16 = other.low >>> 16;
        var b00 = other.low & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 * b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 * b00;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c16 += a00 * b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 * b00;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a16 * b16;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a00 * b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
        c48 &= 0xFFFF;
        return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32, this.unsigned);
    };

    /**
     * Returns this Long divided by the given one.
     * @param {Long} other Long by which to divide.
     * @return {!Long} This Long divided by the given one.
     * @expose
     */
    Long.prototype.div = function(other) {
        if (other.isZero()) {
            throw(new Error('division by zero'));
        } else if (this.isZero()) {
            return this.unsigned ? Long.UZERO : Long.ZERO;
        }
        var approx, rem, res;
        if (this.equals(Long.MIN_SIGNED_VALUE)) {
            if (other.equals(Long.ONE) || other.equals(Long.NEG_ONE)) {
                return Long.MIN_SIGNED_VALUE;  // recall that -MIN_VALUE == MIN_VALUE
            } else if (other.equals(Long.MIN_SIGNED_VALUE)) {
                return Long.ONE;
            } else {
                // At this point, we have |other| >= 2, so |this/other| < |MIN_VALUE|.
                var halfThis = this.shiftRight(1);
                approx = halfThis.div(other).shiftLeft(1);
                if (approx.equals(Long.ZERO)) {
                    return other.isNegative() ? Long.ONE : Long.NEG_ONE;
                } else {
                    rem = this.subtract(other.multiply(approx));
                    res = approx.add(rem.div(other));
                    return res;
                }
            }
        } else if (other.equals(Long.MIN_SIGNED_VALUE)) {
            return this.unsigned ? Long.UZERO : Long.ZERO;
        }
        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().div(other.negate());
            } else {
                return this.negate().div(other).negate();
            }
        } else if (other.isNegative()) {
            return this.div(other.negate()).negate();
        }
        
        // Repeat the following until the remainder is less than other:  find a
        // floating-point that approximates remainder / other *from below*, add this
        // into the result, and subtract it from the remainder.  It is critical that
        // the approximate value is less than or equal to the real value so that the
        // remainder never becomes negative.
        res = Long.ZERO;
        rem = this;
        while (rem.greaterThanOrEqual(other)) {
            // Approximate the result of division. This may be a little greater or
            // smaller than the actual value.
            approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));

            // We will tweak the approximate result by changing it in the 48-th digit or
            // the smallest non-fractional digit, whichever is larger.
            var log2 = Math.ceil(Math.log(approx) / Math.LN2);
            var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);

            // Decrease the approximation until it is smaller than the remainder.  Note
            // that if it is too large, the product overflows and is negative.
            var approxRes = Long.fromNumber(approx);
            var approxRem = approxRes.multiply(other);
            while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
                approx -= delta;
                approxRes = Long.fromNumber(approx, this.unsigned);
                approxRem = approxRes.multiply(other);
            }

            // We know the answer can't be zero... and actually, zero would cause
            // infinite recursion since we would make no progress.
            if (approxRes.isZero()) {
                approxRes = Long.ONE;
            }

            res = res.add(approxRes);
            rem = rem.subtract(approxRem);
        }
        return res;
    };

    /**
     * Returns this Long modulo the given one.
     * @param {Long} other Long by which to mod.
     * @return {!Long} This Long modulo the given one.
     * @expose
     */
    Long.prototype.modulo = function(other) {
        return this.subtract(this.div(other).multiply(other));
    };

    /**
     * @return {!Long} The bitwise-NOT of this value.
     * @expose
     */
    Long.prototype.not = function() {
        return Long.fromBits(~this.low, ~this.high, this.unsigned);
    };

    /**
     * Returns the bitwise-AND of this Long and the given one.
     * @param {Long} other The Long with which to AND.
     * @return {!Long} The bitwise-AND of this and the other.
     * @expose
     */
    Long.prototype.and = function(other) {
        return Long.fromBits(this.low & other.low, this.high & other.high, this.unsigned);
    };

    /**
     * Returns the bitwise-OR of this Long and the given one.
     * @param {Long} other The Long with which to OR.
     * @return {!Long} The bitwise-OR of this and the other.
     * @expose
     */
    Long.prototype.or = function(other) {
        return Long.fromBits(this.low | other.low, this.high | other.high, this.unsigned);
    };

    /**
     * Returns the bitwise-XOR of this Long and the given one.
     * @param {Long} other The Long with which to XOR.
     * @return {!Long} The bitwise-XOR of this and the other.
     * @expose
     */
    Long.prototype.xor = function(other) {
        return Long.fromBits(this.low ^ other.low, this.high ^ other.high, this.unsigned);
    };

    /**
     * Returns this Long with bits shifted to the left by the given amount.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the left by the given amount.
     * @expose
     */
    Long.prototype.shiftLeft = function(numBits) {
        if ((numBits &= 63) === 0)
            return this;
        else if (numBits < 32)
            return Long.fromBits(this.low << numBits, (this.high << numBits) | (this.low >>> (32 - numBits)), this.unsigned);
        else
            return Long.fromBits(0, this.low << (numBits - 32), this.unsigned);
    };

    /**
     * Returns this Long with bits shifted to the right by the given amount.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the right by the given amount.
     * @expose
     */
    Long.prototype.shiftRight = function(numBits) {
        if ((numBits &= 63) === 0)
            return this;
        else if (numBits < 32)
            return Long.fromBits((this.low >>> numBits) | (this.high << (32 - numBits)), this.high >> numBits, this.unsigned);
        else
            return Long.fromBits(this.high >> (numBits - 32), this.high >= 0 ? 0 : -1, this.unsigned);
    };

    /**
     * Returns this Long with bits shifted to the right by the given amount, with
     * the new top bits matching the current sign bit.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the right by the given amount, with
     *     zeros placed into the new leading bits.
     * @expose
     */
    Long.prototype.shiftRightUnsigned = function(numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var high = this.high;
            if (numBits < 32) {
                var low = this.low;
                return Long.fromBits((low >>> numBits) | (high << (32 - numBits)), high >>> numBits, this.unsigned);
            } else if (numBits == 32) {
                return Long.fromBits(high, 0, this.unsigned);
            } else {
                return Long.fromBits(high >>> (numBits - 32), 0, this.unsigned);
            }
        }
    };

    /**
     * @return {!Long} Signed long
     * @expose
     */
    Long.prototype.toSigned = function() {
        var l = this.clone();
        l.unsigned = false;
        return l;
    };

    /**
     * @return {!Long} Unsigned long
     * @expose
     */
    Long.prototype.toUnsigned = function() {
        var l = this.clone();
        l.unsigned = true;
        return l;
    };
    
    /**
     * @return {Long} Cloned instance with the same low/high bits and unsigned flag.
     * @expose
     */
    Long.prototype.clone = function() {
        return new Long(this.low, this.high, this.unsigned);
    };

    // Enable module loading if available
    if (typeof module != 'undefined' && module["exports"]) { // CommonJS
        module["exports"] = Long;
    } else if (typeof define != 'undefined' && define["amd"]) { // AMD
        define("Math/Long", [], function() { return Long; });
    } else { // Shim
        if (!global["dcodeIO"]) {
            global["dcodeIO"] = {};
        }
        global["dcodeIO"]["Long"] = Long;
    }

})(this);

},{}],40:[function(require,module,exports){
/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>
 Copyright 2009 The Closure Library Authors. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS-IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

module.exports = require("./dist/Long.js");

},{"./dist/Long.js":39}],"zdmJ4e":[function(require,module,exports){
var Stream = require("stream")
var writeMethods = ["write", "end", "destroy"]
var readMethods = ["resume", "pause"]
var readEvents = ["data", "close"]
var slice = Array.prototype.slice

module.exports = duplex

function forEach (arr, fn) {
    if (arr.forEach) {
        return arr.forEach(fn)
    }

    for (var i = 0; i < arr.length; i++) {
        fn(arr[i], i)
    }
}

function duplex(writer, reader) {
    var stream = new Stream()
    var ended = false

    forEach(writeMethods, proxyWriter)

    forEach(readMethods, proxyReader)

    forEach(readEvents, proxyStream)

    reader.on("end", handleEnd)

    writer.on("drain", function() {
      stream.emit("drain")
    })

    writer.on("error", reemit)
    reader.on("error", reemit)

    stream.writable = writer.writable
    stream.readable = reader.readable

    return stream

    function proxyWriter(methodName) {
        stream[methodName] = method

        function method() {
            return writer[methodName].apply(writer, arguments)
        }
    }

    function proxyReader(methodName) {
        stream[methodName] = method

        function method() {
            stream.emit(methodName)
            var func = reader[methodName]
            if (func) {
                return func.apply(reader, arguments)
            }
            reader.emit(methodName)
        }
    }

    function proxyStream(methodName) {
        reader.on(methodName, reemit)

        function reemit() {
            var args = slice.call(arguments)
            args.unshift(methodName)
            stream.emit.apply(stream, args)
        }
    }

    function handleEnd() {
        if (ended) {
            return
        }
        ended = true
        var args = slice.call(arguments)
        args.unshift("end")
        stream.emit.apply(stream, args)
    }

    function reemit(err) {
        stream.emit("error", err)
    }
}

},{"stream":29}],"duplexer":[function(require,module,exports){
module.exports=require('zdmJ4e');
},{}],43:[function(require,module,exports){
"use strict";
var Promise = require("./promise/promise").Promise;
var polyfill = require("./promise/polyfill").polyfill;
exports.Promise = Promise;
exports.polyfill = polyfill;
},{"./promise/polyfill":47,"./promise/promise":48}],44:[function(require,module,exports){
"use strict";
/* global toString */

var isArray = require("./utils").isArray;
var isFunction = require("./utils").isFunction;

/**
  Returns a promise that is fulfilled when all the given promises have been
  fulfilled, or rejected if any of them become rejected. The return promise
  is fulfilled with an array that gives all the values in the order they were
  passed in the `promises` array argument.

  Example:

  ```javascript
  var promise1 = RSVP.resolve(1);
  var promise2 = RSVP.resolve(2);
  var promise3 = RSVP.resolve(3);
  var promises = [ promise1, promise2, promise3 ];

  RSVP.all(promises).then(function(array){
    // The array here would be [ 1, 2, 3 ];
  });
  ```

  If any of the `promises` given to `RSVP.all` are rejected, the first promise
  that is rejected will be given as an argument to the returned promises's
  rejection handler. For example:

  Example:

  ```javascript
  var promise1 = RSVP.resolve(1);
  var promise2 = RSVP.reject(new Error("2"));
  var promise3 = RSVP.reject(new Error("3"));
  var promises = [ promise1, promise2, promise3 ];

  RSVP.all(promises).then(function(array){
    // Code here never runs because there are rejected promises!
  }, function(error) {
    // error.message === "2"
  });
  ```

  @method all
  @for RSVP
  @param {Array} promises
  @param {String} label
  @return {Promise} promise that is fulfilled when all `promises` have been
  fulfilled, or rejected if any of them become rejected.
*/
function all(promises) {
  /*jshint validthis:true */
  var Promise = this;

  if (!isArray(promises)) {
    throw new TypeError('You must pass an array to all.');
  }

  return new Promise(function(resolve, reject) {
    var results = [], remaining = promises.length,
    promise;

    if (remaining === 0) {
      resolve([]);
    }

    function resolver(index) {
      return function(value) {
        resolveAll(index, value);
      };
    }

    function resolveAll(index, value) {
      results[index] = value;
      if (--remaining === 0) {
        resolve(results);
      }
    }

    for (var i = 0; i < promises.length; i++) {
      promise = promises[i];

      if (promise && isFunction(promise.then)) {
        promise.then(resolver(i), reject);
      } else {
        resolveAll(i, promise);
      }
    }
  });
}

exports.all = all;
},{"./utils":52}],45:[function(require,module,exports){
(function (process,global){
"use strict";
var browserGlobal = (typeof window !== 'undefined') ? window : {};
var BrowserMutationObserver = browserGlobal.MutationObserver || browserGlobal.WebKitMutationObserver;
var local = (typeof global !== 'undefined') ? global : (this === undefined? window:this);

// node
function useNextTick() {
  return function() {
    process.nextTick(flush);
  };
}

function useMutationObserver() {
  var iterations = 0;
  var observer = new BrowserMutationObserver(flush);
  var node = document.createTextNode('');
  observer.observe(node, { characterData: true });

  return function() {
    node.data = (iterations = ++iterations % 2);
  };
}

function useSetTimeout() {
  return function() {
    local.setTimeout(flush, 1);
  };
}

var queue = [];
function flush() {
  for (var i = 0; i < queue.length; i++) {
    var tuple = queue[i];
    var callback = tuple[0], arg = tuple[1];
    callback(arg);
  }
  queue = [];
}

var scheduleFlush;

// Decide what async method to use to triggering processing of queued callbacks:
if (typeof process !== 'undefined' && {}.toString.call(process) === '[object process]') {
  scheduleFlush = useNextTick();
} else if (BrowserMutationObserver) {
  scheduleFlush = useMutationObserver();
} else {
  scheduleFlush = useSetTimeout();
}

function asap(callback, arg) {
  var length = queue.push([callback, arg]);
  if (length === 1) {
    // If length is 1, that means that we need to schedule an async flush.
    // If additional callbacks are queued before the queue is flushed, they
    // will be processed by this flush that we are scheduling.
    scheduleFlush();
  }
}

exports.asap = asap;
}).call(this,require("FWaASH"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"FWaASH":27}],46:[function(require,module,exports){
"use strict";
var config = {
  instrument: false
};

function configure(name, value) {
  if (arguments.length === 2) {
    config[name] = value;
  } else {
    return config[name];
  }
}

exports.config = config;
exports.configure = configure;
},{}],47:[function(require,module,exports){
(function (global){
"use strict";
/*global self*/
var RSVPPromise = require("./promise").Promise;
var isFunction = require("./utils").isFunction;

function polyfill() {
  var local;

  if (typeof global !== 'undefined') {
    local = global;
  } else if (typeof window !== 'undefined' && window.document) {
    local = window;
  } else {
    local = self;
  }

  var es6PromiseSupport = 
    "Promise" in local &&
    // Some of these methods are missing from
    // Firefox/Chrome experimental implementations
    "resolve" in local.Promise &&
    "reject" in local.Promise &&
    "all" in local.Promise &&
    "race" in local.Promise &&
    // Older version of the spec had a resolver object
    // as the arg rather than a function
    (function() {
      var resolve;
      new local.Promise(function(r) { resolve = r; });
      return isFunction(resolve);
    }());

  if (!es6PromiseSupport) {
    local.Promise = RSVPPromise;
  }
}

exports.polyfill = polyfill;
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./promise":48,"./utils":52}],48:[function(require,module,exports){
"use strict";
var config = require("./config").config;
var configure = require("./config").configure;
var objectOrFunction = require("./utils").objectOrFunction;
var isFunction = require("./utils").isFunction;
var now = require("./utils").now;
var all = require("./all").all;
var race = require("./race").race;
var staticResolve = require("./resolve").resolve;
var staticReject = require("./reject").reject;
var asap = require("./asap").asap;

var counter = 0;

config.async = asap; // default async is asap;

function Promise(resolver) {
  if (!isFunction(resolver)) {
    throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
  }

  if (!(this instanceof Promise)) {
    throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
  }

  this._subscribers = [];

  invokeResolver(resolver, this);
}

function invokeResolver(resolver, promise) {
  function resolvePromise(value) {
    resolve(promise, value);
  }

  function rejectPromise(reason) {
    reject(promise, reason);
  }

  try {
    resolver(resolvePromise, rejectPromise);
  } catch(e) {
    rejectPromise(e);
  }
}

function invokeCallback(settled, promise, callback, detail) {
  var hasCallback = isFunction(callback),
      value, error, succeeded, failed;

  if (hasCallback) {
    try {
      value = callback(detail);
      succeeded = true;
    } catch(e) {
      failed = true;
      error = e;
    }
  } else {
    value = detail;
    succeeded = true;
  }

  if (handleThenable(promise, value)) {
    return;
  } else if (hasCallback && succeeded) {
    resolve(promise, value);
  } else if (failed) {
    reject(promise, error);
  } else if (settled === FULFILLED) {
    resolve(promise, value);
  } else if (settled === REJECTED) {
    reject(promise, value);
  }
}

var PENDING   = void 0;
var SEALED    = 0;
var FULFILLED = 1;
var REJECTED  = 2;

function subscribe(parent, child, onFulfillment, onRejection) {
  var subscribers = parent._subscribers;
  var length = subscribers.length;

  subscribers[length] = child;
  subscribers[length + FULFILLED] = onFulfillment;
  subscribers[length + REJECTED]  = onRejection;
}

function publish(promise, settled) {
  var child, callback, subscribers = promise._subscribers, detail = promise._detail;

  for (var i = 0; i < subscribers.length; i += 3) {
    child = subscribers[i];
    callback = subscribers[i + settled];

    invokeCallback(settled, child, callback, detail);
  }

  promise._subscribers = null;
}

Promise.prototype = {
  constructor: Promise,

  _state: undefined,
  _detail: undefined,
  _subscribers: undefined,

  then: function(onFulfillment, onRejection) {
    var promise = this;

    var thenPromise = new this.constructor(function() {});

    if (this._state) {
      var callbacks = arguments;
      config.async(function invokePromiseCallback() {
        invokeCallback(promise._state, thenPromise, callbacks[promise._state - 1], promise._detail);
      });
    } else {
      subscribe(this, thenPromise, onFulfillment, onRejection);
    }

    return thenPromise;
  },

  'catch': function(onRejection) {
    return this.then(null, onRejection);
  }
};

Promise.all = all;
Promise.race = race;
Promise.resolve = staticResolve;
Promise.reject = staticReject;

function handleThenable(promise, value) {
  var then = null,
  resolved;

  try {
    if (promise === value) {
      throw new TypeError("A promises callback cannot return that same promise.");
    }

    if (objectOrFunction(value)) {
      then = value.then;

      if (isFunction(then)) {
        then.call(value, function(val) {
          if (resolved) { return true; }
          resolved = true;

          if (value !== val) {
            resolve(promise, val);
          } else {
            fulfill(promise, val);
          }
        }, function(val) {
          if (resolved) { return true; }
          resolved = true;

          reject(promise, val);
        });

        return true;
      }
    }
  } catch (error) {
    if (resolved) { return true; }
    reject(promise, error);
    return true;
  }

  return false;
}

function resolve(promise, value) {
  if (promise === value) {
    fulfill(promise, value);
  } else if (!handleThenable(promise, value)) {
    fulfill(promise, value);
  }
}

function fulfill(promise, value) {
  if (promise._state !== PENDING) { return; }
  promise._state = SEALED;
  promise._detail = value;

  config.async(publishFulfillment, promise);
}

function reject(promise, reason) {
  if (promise._state !== PENDING) { return; }
  promise._state = SEALED;
  promise._detail = reason;

  config.async(publishRejection, promise);
}

function publishFulfillment(promise) {
  publish(promise, promise._state = FULFILLED);
}

function publishRejection(promise) {
  publish(promise, promise._state = REJECTED);
}

exports.Promise = Promise;
},{"./all":44,"./asap":45,"./config":46,"./race":49,"./reject":50,"./resolve":51,"./utils":52}],49:[function(require,module,exports){
"use strict";
/* global toString */
var isArray = require("./utils").isArray;

/**
  `RSVP.race` allows you to watch a series of promises and act as soon as the
  first promise given to the `promises` argument fulfills or rejects.

  Example:

  ```javascript
  var promise1 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      resolve("promise 1");
    }, 200);
  });

  var promise2 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      resolve("promise 2");
    }, 100);
  });

  RSVP.race([promise1, promise2]).then(function(result){
    // result === "promise 2" because it was resolved before promise1
    // was resolved.
  });
  ```

  `RSVP.race` is deterministic in that only the state of the first completed
  promise matters. For example, even if other promises given to the `promises`
  array argument are resolved, but the first completed promise has become
  rejected before the other promises became fulfilled, the returned promise
  will become rejected:

  ```javascript
  var promise1 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      resolve("promise 1");
    }, 200);
  });

  var promise2 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      reject(new Error("promise 2"));
    }, 100);
  });

  RSVP.race([promise1, promise2]).then(function(result){
    // Code here never runs because there are rejected promises!
  }, function(reason){
    // reason.message === "promise2" because promise 2 became rejected before
    // promise 1 became fulfilled
  });
  ```

  @method race
  @for RSVP
  @param {Array} promises array of promises to observe
  @param {String} label optional string for describing the promise returned.
  Useful for tooling.
  @return {Promise} a promise that becomes fulfilled with the value the first
  completed promises is resolved with if the first completed promise was
  fulfilled, or rejected with the reason that the first completed promise
  was rejected with.
*/
function race(promises) {
  /*jshint validthis:true */
  var Promise = this;

  if (!isArray(promises)) {
    throw new TypeError('You must pass an array to race.');
  }
  return new Promise(function(resolve, reject) {
    var results = [], promise;

    for (var i = 0; i < promises.length; i++) {
      promise = promises[i];

      if (promise && typeof promise.then === 'function') {
        promise.then(resolve, reject);
      } else {
        resolve(promise);
      }
    }
  });
}

exports.race = race;
},{"./utils":52}],50:[function(require,module,exports){
"use strict";
/**
  `RSVP.reject` returns a promise that will become rejected with the passed
  `reason`. `RSVP.reject` is essentially shorthand for the following:

  ```javascript
  var promise = new RSVP.Promise(function(resolve, reject){
    reject(new Error('WHOOPS'));
  });

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  var promise = RSVP.reject(new Error('WHOOPS'));

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  @method reject
  @for RSVP
  @param {Any} reason value that the returned promise will be rejected with.
  @param {String} label optional string for identifying the returned promise.
  Useful for tooling.
  @return {Promise} a promise that will become rejected with the given
  `reason`.
*/
function reject(reason) {
  /*jshint validthis:true */
  var Promise = this;

  return new Promise(function (resolve, reject) {
    reject(reason);
  });
}

exports.reject = reject;
},{}],51:[function(require,module,exports){
"use strict";
function resolve(value) {
  /*jshint validthis:true */
  if (value && typeof value === 'object' && value.constructor === this) {
    return value;
  }

  var Promise = this;

  return new Promise(function(resolve) {
    resolve(value);
  });
}

exports.resolve = resolve;
},{}],52:[function(require,module,exports){
"use strict";
function objectOrFunction(x) {
  return isFunction(x) || (typeof x === "object" && x !== null);
}

function isFunction(x) {
  return typeof x === "function";
}

function isArray(x) {
  return Object.prototype.toString.call(x) === "[object Array]";
}

// Date.now is not available in browsers < IE9
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now#Compatibility
var now = Date.now || function() { return new Date().getTime(); };


exports.objectOrFunction = objectOrFunction;
exports.isFunction = isFunction;
exports.isArray = isArray;
exports.now = now;
},{}],53:[function(require,module,exports){
(function (process){
// Approach:
//
// 1. Get the minimatch set
// 2. For each pattern in the set, PROCESS(pattern)
// 3. Store matches per-set, then uniq them
//
// PROCESS(pattern)
// Get the first [n] items from pattern that are all strings
// Join these together.  This is PREFIX.
//   If there is no more remaining, then stat(PREFIX) and
//   add to matches if it succeeds.  END.
// readdir(PREFIX) as ENTRIES
//   If fails, END
//   If pattern[n] is GLOBSTAR
//     // handle the case where the globstar match is empty
//     // by pruning it out, and testing the resulting pattern
//     PROCESS(pattern[0..n] + pattern[n+1 .. $])
//     // handle other cases.
//     for ENTRY in ENTRIES (not dotfiles)
//       // attach globstar + tail onto the entry
//       PROCESS(pattern[0..n] + ENTRY + pattern[n .. $])
//
//   else // not globstar
//     for ENTRY in ENTRIES (not dotfiles, unless pattern[n] is dot)
//       Test ENTRY against pattern[n]
//       If fails, continue
//       If passes, PROCESS(pattern[0..n] + item + pattern[n+1 .. $])
//
// Caveat:
//   Cache all stats and readdirs results to minimize syscall.  Since all
//   we ever care about is existence and directory-ness, we can just keep
//   `true` for files, and [children,...] for directories, or `false` for
//   things that don't exist.



module.exports = glob

var fs = require("fs")
, minimatch = require("minimatch")
, Minimatch = minimatch.Minimatch
, inherits = require("inherits")
, EE = require("events").EventEmitter
, path = require("path")
, isDir = {}
, assert = require("assert").ok

function glob (pattern, options, cb) {
  if (typeof options === "function") cb = options, options = {}
  if (!options) options = {}

  if (typeof options === "number") {
    deprecated()
    return
  }

  var g = new Glob(pattern, options, cb)
  return g.sync ? g.found : g
}

glob.fnmatch = deprecated

function deprecated () {
  throw new Error("glob's interface has changed. Please see the docs.")
}

glob.sync = globSync
function globSync (pattern, options) {
  if (typeof options === "number") {
    deprecated()
    return
  }

  options = options || {}
  options.sync = true
  return glob(pattern, options)
}

this._processingEmitQueue = false

glob.Glob = Glob
inherits(Glob, EE)
function Glob (pattern, options, cb) {
  if (!(this instanceof Glob)) {
    return new Glob(pattern, options, cb)
  }

  if (typeof options === "function") {
    cb = options
    options = null
  }

  if (typeof cb === "function") {
    this.on("error", cb)
    this.on("end", function (matches) {
      cb(null, matches)
    })
  }

  options = options || {}

  this._endEmitted = false
  this.EOF = {}
  this._emitQueue = []

  this.paused = false
  this._processingEmitQueue = false

  this.maxDepth = options.maxDepth || 1000
  this.maxLength = options.maxLength || Infinity
  this.cache = options.cache || {}
  this.statCache = options.statCache || {}

  this.changedCwd = false
  var cwd = process.cwd()
  if (!options.hasOwnProperty("cwd")) this.cwd = cwd
  else {
    this.cwd = options.cwd
    this.changedCwd = path.resolve(options.cwd) !== cwd
  }

  this.root = options.root || path.resolve(this.cwd, "/")
  this.root = path.resolve(this.root)
  if (process.platform === "win32")
    this.root = this.root.replace(/\\/g, "/")

  this.nomount = !!options.nomount

  if (!pattern) {
    throw new Error("must provide pattern")
  }

  // base-matching: just use globstar for that.
  if (options.matchBase && -1 === pattern.indexOf("/")) {
    if (options.noglobstar) {
      throw new Error("base matching requires globstar")
    }
    pattern = "**/" + pattern
  }

  this.strict = options.strict !== false
  this.dot = !!options.dot
  this.mark = !!options.mark
  this.sync = !!options.sync
  this.nounique = !!options.nounique
  this.nonull = !!options.nonull
  this.nosort = !!options.nosort
  this.nocase = !!options.nocase
  this.stat = !!options.stat

  this.debug = !!options.debug || !!options.globDebug
  if (this.debug)
    this.log = console.error

  this.silent = !!options.silent

  var mm = this.minimatch = new Minimatch(pattern, options)
  this.options = mm.options
  pattern = this.pattern = mm.pattern

  this.error = null
  this.aborted = false

  // list of all the patterns that ** has resolved do, so
  // we can avoid visiting multiple times.
  this._globstars = {}

  EE.call(this)

  // process each pattern in the minimatch set
  var n = this.minimatch.set.length

  // The matches are stored as {<filename>: true,...} so that
  // duplicates are automagically pruned.
  // Later, we do an Object.keys() on these.
  // Keep them as a list so we can fill in when nonull is set.
  this.matches = new Array(n)

  this.minimatch.set.forEach(iterator.bind(this))
  function iterator (pattern, i, set) {
    this._process(pattern, 0, i, function (er) {
      if (er) this.emit("error", er)
      if (-- n <= 0) this._finish()
    })
  }
}

Glob.prototype.log = function () {}

Glob.prototype._finish = function () {
  assert(this instanceof Glob)

  var nou = this.nounique
  , all = nou ? [] : {}

  for (var i = 0, l = this.matches.length; i < l; i ++) {
    var matches = this.matches[i]
    this.log("matches[%d] =", i, matches)
    // do like the shell, and spit out the literal glob
    if (!matches) {
      if (this.nonull) {
        var literal = this.minimatch.globSet[i]
        if (nou) all.push(literal)
        else all[literal] = true
      }
    } else {
      // had matches
      var m = Object.keys(matches)
      if (nou) all.push.apply(all, m)
      else m.forEach(function (m) {
        all[m] = true
      })
    }
  }

  if (!nou) all = Object.keys(all)

  if (!this.nosort) {
    all = all.sort(this.nocase ? alphasorti : alphasort)
  }

  if (this.mark) {
    // at *some* point we statted all of these
    all = all.map(this._mark, this)
  }

  this.log("emitting end", all)

  this.EOF = this.found = all
  this.emitMatch(this.EOF)
}

function alphasorti (a, b) {
  a = a.toLowerCase()
  b = b.toLowerCase()
  return alphasort(a, b)
}

function alphasort (a, b) {
  return a > b ? 1 : a < b ? -1 : 0
}

Glob.prototype._mark = function (p) {
  var c = this.cache[p]
  var m = p
  if (c) {
    var isDir = c === 2 || Array.isArray(c)
    var slash = p.slice(-1) === '/'

    if (isDir && !slash)
      m += '/'
    else if (!isDir && slash)
      m = m.slice(0, -1)

    if (m !== p) {
      this.statCache[m] = this.statCache[p]
      this.cache[m] = this.cache[p]
    }
  }

  return m
}

Glob.prototype.abort = function () {
  this.aborted = true
  this.emit("abort")
}

Glob.prototype.pause = function () {
  if (this.paused) return
  if (this.sync)
    this.emit("error", new Error("Can't pause/resume sync glob"))
  this.paused = true
  this.emit("pause")
}

Glob.prototype.resume = function () {
  if (!this.paused) return
  if (this.sync)
    this.emit("error", new Error("Can't pause/resume sync glob"))
  this.paused = false
  this.emit("resume")
  this._processEmitQueue()
  //process.nextTick(this.emit.bind(this, "resume"))
}

Glob.prototype.emitMatch = function (m) {
  this.log('emitMatch', m)
  this._emitQueue.push(m)
  this._processEmitQueue()
}

Glob.prototype._processEmitQueue = function (m) {
  this.log("pEQ paused=%j processing=%j m=%j", this.paused,
           this._processingEmitQueue, m)
  var done = false
  while (!this._processingEmitQueue &&
         !this.paused) {
    this._processingEmitQueue = true
    var m = this._emitQueue.shift()
    this.log(">processEmitQueue", m === this.EOF ? ":EOF:" : m)
    if (!m) {
      this.log(">processEmitQueue, falsey m")
      this._processingEmitQueue = false
      break
    }

    if (m === this.EOF || !(this.mark && !this.stat)) {
      this.log("peq: unmarked, or eof")
      next.call(this, 0, false)
    } else if (this.statCache[m]) {
      var sc = this.statCache[m]
      var exists
      if (sc)
        exists = sc.isDirectory() ? 2 : 1
      this.log("peq: stat cached")
      next.call(this, exists, exists === 2)
    } else {
      this.log("peq: _stat, then next")
      this._stat(m, next)
    }

    function next(exists, isDir) {
      this.log("next", m, exists, isDir)
      var ev = m === this.EOF ? "end" : "match"

      // "end" can only happen once.
      assert(!this._endEmitted)
      if (ev === "end")
        this._endEmitted = true

      if (exists) {
        // Doesn't mean it necessarily doesn't exist, it's possible
        // we just didn't check because we don't care that much, or
        // this is EOF anyway.
        if (isDir && !m.match(/\/$/)) {
          m = m + "/"
        } else if (!isDir && m.match(/\/$/)) {
          m = m.replace(/\/+$/, "")
        }
      }
      this.log("emit", ev, m)
      this.emit(ev, m)
      this._processingEmitQueue = false
      if (done && m !== this.EOF && !this.paused)
        this._processEmitQueue()
    }
  }
  done = true
}

Glob.prototype._process = function (pattern, depth, index, cb_) {
  assert(this instanceof Glob)

  var cb = function cb (er, res) {
    assert(this instanceof Glob)
    if (this.paused) {
      if (!this._processQueue) {
        this._processQueue = []
        this.once("resume", function () {
          var q = this._processQueue
          this._processQueue = null
          q.forEach(function (cb) { cb() })
        })
      }
      this._processQueue.push(cb_.bind(this, er, res))
    } else {
      cb_.call(this, er, res)
    }
  }.bind(this)

  if (this.aborted) return cb()

  if (depth > this.maxDepth) return cb()

  // Get the first [n] parts of pattern that are all strings.
  var n = 0
  while (typeof pattern[n] === "string") {
    n ++
  }
  // now n is the index of the first one that is *not* a string.

  // see if there's anything else
  var prefix
  switch (n) {
    // if not, then this is rather simple
    case pattern.length:
      prefix = pattern.join("/")
      this._stat(prefix, function (exists, isDir) {
        // either it's there, or it isn't.
        // nothing more to do, either way.
        if (exists) {
          if (prefix && isAbsolute(prefix) && !this.nomount) {
            if (prefix.charAt(0) === "/") {
              prefix = path.join(this.root, prefix)
            } else {
              prefix = path.resolve(this.root, prefix)
            }
          }

          if (process.platform === "win32")
            prefix = prefix.replace(/\\/g, "/")

          this.matches[index] = this.matches[index] || {}
          this.matches[index][prefix] = true
          this.emitMatch(prefix)
        }
        return cb()
      })
      return

    case 0:
      // pattern *starts* with some non-trivial item.
      // going to readdir(cwd), but not include the prefix in matches.
      prefix = null
      break

    default:
      // pattern has some string bits in the front.
      // whatever it starts with, whether that's "absolute" like /foo/bar,
      // or "relative" like "../baz"
      prefix = pattern.slice(0, n)
      prefix = prefix.join("/")
      break
  }

  // get the list of entries.
  var read
  if (prefix === null) read = "."
  else if (isAbsolute(prefix) || isAbsolute(pattern.join("/"))) {
    if (!prefix || !isAbsolute(prefix)) {
      prefix = path.join("/", prefix)
    }
    read = prefix = path.resolve(prefix)

    // if (process.platform === "win32")
    //   read = prefix = prefix.replace(/^[a-zA-Z]:|\\/g, "/")

    this.log('absolute: ', prefix, this.root, pattern, read)
  } else {
    read = prefix
  }

  this.log('readdir(%j)', read, this.cwd, this.root)

  return this._readdir(read, function (er, entries) {
    if (er) {
      // not a directory!
      // this means that, whatever else comes after this, it can never match
      return cb()
    }

    // globstar is special
    if (pattern[n] === minimatch.GLOBSTAR) {
      // test without the globstar, and with every child both below
      // and replacing the globstar.
      var s = [ pattern.slice(0, n).concat(pattern.slice(n + 1)) ]
      entries.forEach(function (e) {
        if (e.charAt(0) === "." && !this.dot) return
        // instead of the globstar
        s.push(pattern.slice(0, n).concat(e).concat(pattern.slice(n + 1)))
        // below the globstar
        s.push(pattern.slice(0, n).concat(e).concat(pattern.slice(n)))
      }, this)

      s = s.filter(function (pattern) {
        var key = gsKey(pattern)
        var seen = !this._globstars[key]
        this._globstars[key] = true
        return seen
      }, this)

      if (!s.length)
        return cb()

      // now asyncForEach over this
      var l = s.length
      , errState = null
      s.forEach(function (gsPattern) {
        this._process(gsPattern, depth + 1, index, function (er) {
          if (errState) return
          if (er) return cb(errState = er)
          if (--l <= 0) return cb()
        })
      }, this)

      return
    }

    // not a globstar
    // It will only match dot entries if it starts with a dot, or if
    // dot is set.  Stuff like @(.foo|.bar) isn't allowed.
    var pn = pattern[n]
    var rawGlob = pattern[n]._glob
    , dotOk = this.dot || rawGlob.charAt(0) === "."

    entries = entries.filter(function (e) {
      return (e.charAt(0) !== "." || dotOk) &&
             e.match(pattern[n])
    })

    // If n === pattern.length - 1, then there's no need for the extra stat
    // *unless* the user has specified "mark" or "stat" explicitly.
    // We know that they exist, since the readdir returned them.
    if (n === pattern.length - 1 &&
        !this.mark &&
        !this.stat) {
      entries.forEach(function (e) {
        if (prefix) {
          if (prefix !== "/") e = prefix + "/" + e
          else e = prefix + e
        }
        if (e.charAt(0) === "/" && !this.nomount) {
          e = path.join(this.root, e)
        }

        if (process.platform === "win32")
          e = e.replace(/\\/g, "/")

        this.matches[index] = this.matches[index] || {}
        this.matches[index][e] = true
        this.emitMatch(e)
      }, this)
      return cb.call(this)
    }


    // now test all the remaining entries as stand-ins for that part
    // of the pattern.
    var l = entries.length
    , errState = null
    if (l === 0) return cb() // no matches possible
    entries.forEach(function (e) {
      var p = pattern.slice(0, n).concat(e).concat(pattern.slice(n + 1))
      this._process(p, depth + 1, index, function (er) {
        if (errState) return
        if (er) return cb(errState = er)
        if (--l === 0) return cb.call(this)
      })
    }, this)
  })

}

function gsKey (pattern) {
  return '**' + pattern.map(function (p) {
    return (p === minimatch.GLOBSTAR) ? '**' : (''+p)
  }).join('/')
}

Glob.prototype._stat = function (f, cb) {
  assert(this instanceof Glob)
  var abs = f
  if (f.charAt(0) === "/") {
    abs = path.join(this.root, f)
  } else if (this.changedCwd) {
    abs = path.resolve(this.cwd, f)
  }

  if (f.length > this.maxLength) {
    var er = new Error("Path name too long")
    er.code = "ENAMETOOLONG"
    er.path = f
    return this._afterStat(f, abs, cb, er)
  }

  this.log('stat', [this.cwd, f, '=', abs])

  if (!this.stat && this.cache.hasOwnProperty(f)) {
    var exists = this.cache[f]
    , isDir = exists && (Array.isArray(exists) || exists === 2)
    if (this.sync) return cb.call(this, !!exists, isDir)
    return process.nextTick(cb.bind(this, !!exists, isDir))
  }

  var stat = this.statCache[abs]
  if (this.sync || stat) {
    var er
    try {
      stat = fs.statSync(abs)
    } catch (e) {
      er = e
    }
    this._afterStat(f, abs, cb, er, stat)
  } else {
    fs.stat(abs, this._afterStat.bind(this, f, abs, cb))
  }
}

Glob.prototype._afterStat = function (f, abs, cb, er, stat) {
  var exists
  assert(this instanceof Glob)

  if (abs.slice(-1) === "/" && stat && !stat.isDirectory()) {
    this.log("should be ENOTDIR, fake it")

    er = new Error("ENOTDIR, not a directory '" + abs + "'")
    er.path = abs
    er.code = "ENOTDIR"
    stat = null
  }

  var emit = !this.statCache[abs]
  this.statCache[abs] = stat

  if (er || !stat) {
    exists = false
  } else {
    exists = stat.isDirectory() ? 2 : 1
    if (emit)
      this.emit('stat', f, stat)
  }
  this.cache[f] = this.cache[f] || exists
  cb.call(this, !!exists, exists === 2)
}

Glob.prototype._readdir = function (f, cb) {
  assert(this instanceof Glob)
  var abs = f
  if (f.charAt(0) === "/") {
    abs = path.join(this.root, f)
  } else if (isAbsolute(f)) {
    abs = f
  } else if (this.changedCwd) {
    abs = path.resolve(this.cwd, f)
  }

  if (f.length > this.maxLength) {
    var er = new Error("Path name too long")
    er.code = "ENAMETOOLONG"
    er.path = f
    return this._afterReaddir(f, abs, cb, er)
  }

  this.log('readdir', [this.cwd, f, abs])
  if (this.cache.hasOwnProperty(f)) {
    var c = this.cache[f]
    if (Array.isArray(c)) {
      if (this.sync) return cb.call(this, null, c)
      return process.nextTick(cb.bind(this, null, c))
    }

    if (!c || c === 1) {
      // either ENOENT or ENOTDIR
      var code = c ? "ENOTDIR" : "ENOENT"
      , er = new Error((c ? "Not a directory" : "Not found") + ": " + f)
      er.path = f
      er.code = code
      this.log(f, er)
      if (this.sync) return cb.call(this, er)
      return process.nextTick(cb.bind(this, er))
    }

    // at this point, c === 2, meaning it's a dir, but we haven't
    // had to read it yet, or c === true, meaning it's *something*
    // but we don't have any idea what.  Need to read it, either way.
  }

  if (this.sync) {
    var er, entries
    try {
      entries = fs.readdirSync(abs)
    } catch (e) {
      er = e
    }
    return this._afterReaddir(f, abs, cb, er, entries)
  }

  fs.readdir(abs, this._afterReaddir.bind(this, f, abs, cb))
}

Glob.prototype._afterReaddir = function (f, abs, cb, er, entries) {
  assert(this instanceof Glob)
  if (entries && !er) {
    this.cache[f] = entries
    // if we haven't asked to stat everything for suresies, then just
    // assume that everything in there exists, so we can avoid
    // having to stat it a second time.  This also gets us one step
    // further into ELOOP territory.
    if (!this.mark && !this.stat) {
      entries.forEach(function (e) {
        if (f === "/") e = f + e
        else e = f + "/" + e
        this.cache[e] = true
      }, this)
    }

    return cb.call(this, er, entries)
  }

  // now handle errors, and cache the information
  if (er) switch (er.code) {
    case "ENOTDIR": // totally normal. means it *does* exist.
      this.cache[f] = 1
      return cb.call(this, er)
    case "ENOENT": // not terribly unusual
    case "ELOOP":
    case "ENAMETOOLONG":
    case "UNKNOWN":
      this.cache[f] = false
      return cb.call(this, er)
    default: // some unusual error.  Treat as failure.
      this.cache[f] = false
      if (this.strict) this.emit("error", er)
      if (!this.silent) console.error("glob error", er)
      return cb.call(this, er)
  }
}

var isAbsolute = process.platform === "win32" ? absWin : absUnix

function absWin (p) {
  if (absUnix(p)) return true
  // pull off the device/UNC bit from a windows path.
  // from node's lib/path.js
  var splitDeviceRe =
      /^([a-zA-Z]:|[\\\/]{2}[^\\\/]+[\\\/]+[^\\\/]+)?([\\\/])?([\s\S]*?)$/
    , result = splitDeviceRe.exec(p)
    , device = result[1] || ''
    , isUnc = device && device.charAt(1) !== ':'
    , isAbsolute = !!result[2] || isUnc // UNC paths are always absolute

  return isAbsolute
}

function absUnix (p) {
  return p.charAt(0) === "/" || p === ""
}

}).call(this,require("FWaASH"))
},{"FWaASH":27,"assert":18,"events":24,"fs":17,"inherits":54,"minimatch":55,"path":26}],54:[function(require,module,exports){
module.exports=require(25)
},{}],55:[function(require,module,exports){
(function (process){
;(function (require, exports, module, platform) {

if (module) module.exports = minimatch
else exports.minimatch = minimatch

if (!require) {
  require = function (id) {
    switch (id) {
      case "sigmund": return function sigmund (obj) {
        return JSON.stringify(obj)
      }
      case "path": return { basename: function (f) {
        f = f.split(/[\/\\]/)
        var e = f.pop()
        if (!e) e = f.pop()
        return e
      }}
      case "lru-cache": return function LRUCache () {
        // not quite an LRU, but still space-limited.
        var cache = {}
        var cnt = 0
        this.set = function (k, v) {
          cnt ++
          if (cnt >= 100) cache = {}
          cache[k] = v
        }
        this.get = function (k) { return cache[k] }
      }
    }
  }
}

minimatch.Minimatch = Minimatch

var LRU = require("lru-cache")
  , cache = minimatch.cache = new LRU({max: 100})
  , GLOBSTAR = minimatch.GLOBSTAR = Minimatch.GLOBSTAR = {}
  , sigmund = require("sigmund")

var path = require("path")
  // any single thing other than /
  // don't need to escape / when using new RegExp()
  , qmark = "[^/]"

  // * => any number of characters
  , star = qmark + "*?"

  // ** when dots are allowed.  Anything goes, except .. and .
  // not (^ or / followed by one or two dots followed by $ or /),
  // followed by anything, any number of times.
  , twoStarDot = "(?:(?!(?:\\\/|^)(?:\\.{1,2})($|\\\/)).)*?"

  // not a ^ or / followed by a dot,
  // followed by anything, any number of times.
  , twoStarNoDot = "(?:(?!(?:\\\/|^)\\.).)*?"

  // characters that need to be escaped in RegExp.
  , reSpecials = charSet("().*{}+?[]^$\\!")

// "abc" -> { a:true, b:true, c:true }
function charSet (s) {
  return s.split("").reduce(function (set, c) {
    set[c] = true
    return set
  }, {})
}

// normalizes slashes.
var slashSplit = /\/+/

minimatch.filter = filter
function filter (pattern, options) {
  options = options || {}
  return function (p, i, list) {
    return minimatch(p, pattern, options)
  }
}

function ext (a, b) {
  a = a || {}
  b = b || {}
  var t = {}
  Object.keys(b).forEach(function (k) {
    t[k] = b[k]
  })
  Object.keys(a).forEach(function (k) {
    t[k] = a[k]
  })
  return t
}

minimatch.defaults = function (def) {
  if (!def || !Object.keys(def).length) return minimatch

  var orig = minimatch

  var m = function minimatch (p, pattern, options) {
    return orig.minimatch(p, pattern, ext(def, options))
  }

  m.Minimatch = function Minimatch (pattern, options) {
    return new orig.Minimatch(pattern, ext(def, options))
  }

  return m
}

Minimatch.defaults = function (def) {
  if (!def || !Object.keys(def).length) return Minimatch
  return minimatch.defaults(def).Minimatch
}


function minimatch (p, pattern, options) {
  if (typeof pattern !== "string") {
    throw new TypeError("glob pattern string required")
  }

  if (!options) options = {}

  // shortcut: comments match nothing.
  if (!options.nocomment && pattern.charAt(0) === "#") {
    return false
  }

  // "" only matches ""
  if (pattern.trim() === "") return p === ""

  return new Minimatch(pattern, options).match(p)
}

function Minimatch (pattern, options) {
  if (!(this instanceof Minimatch)) {
    return new Minimatch(pattern, options, cache)
  }

  if (typeof pattern !== "string") {
    throw new TypeError("glob pattern string required")
  }

  if (!options) options = {}
  pattern = pattern.trim()

  // windows: need to use /, not \
  // On other platforms, \ is a valid (albeit bad) filename char.
  if (platform === "win32") {
    pattern = pattern.split("\\").join("/")
  }

  // lru storage.
  // these things aren't particularly big, but walking down the string
  // and turning it into a regexp can get pretty costly.
  var cacheKey = pattern + "\n" + sigmund(options)
  var cached = minimatch.cache.get(cacheKey)
  if (cached) return cached
  minimatch.cache.set(cacheKey, this)

  this.options = options
  this.set = []
  this.pattern = pattern
  this.regexp = null
  this.negate = false
  this.comment = false
  this.empty = false

  // make the set of regexps etc.
  this.make()
}

Minimatch.prototype.debug = function() {}

Minimatch.prototype.make = make
function make () {
  // don't do it more than once.
  if (this._made) return

  var pattern = this.pattern
  var options = this.options

  // empty patterns and comments match nothing.
  if (!options.nocomment && pattern.charAt(0) === "#") {
    this.comment = true
    return
  }
  if (!pattern) {
    this.empty = true
    return
  }

  // step 1: figure out negation, etc.
  this.parseNegate()

  // step 2: expand braces
  var set = this.globSet = this.braceExpand()

  if (options.debug) this.debug = console.error

  this.debug(this.pattern, set)

  // step 3: now we have a set, so turn each one into a series of path-portion
  // matching patterns.
  // These will be regexps, except in the case of "**", which is
  // set to the GLOBSTAR object for globstar behavior,
  // and will not contain any / characters
  set = this.globParts = set.map(function (s) {
    return s.split(slashSplit)
  })

  this.debug(this.pattern, set)

  // glob --> regexps
  set = set.map(function (s, si, set) {
    return s.map(this.parse, this)
  }, this)

  this.debug(this.pattern, set)

  // filter out everything that didn't compile properly.
  set = set.filter(function (s) {
    return -1 === s.indexOf(false)
  })

  this.debug(this.pattern, set)

  this.set = set
}

Minimatch.prototype.parseNegate = parseNegate
function parseNegate () {
  var pattern = this.pattern
    , negate = false
    , options = this.options
    , negateOffset = 0

  if (options.nonegate) return

  for ( var i = 0, l = pattern.length
      ; i < l && pattern.charAt(i) === "!"
      ; i ++) {
    negate = !negate
    negateOffset ++
  }

  if (negateOffset) this.pattern = pattern.substr(negateOffset)
  this.negate = negate
}

// Brace expansion:
// a{b,c}d -> abd acd
// a{b,}c -> abc ac
// a{0..3}d -> a0d a1d a2d a3d
// a{b,c{d,e}f}g -> abg acdfg acefg
// a{b,c}d{e,f}g -> abdeg acdeg abdeg abdfg
//
// Invalid sets are not expanded.
// a{2..}b -> a{2..}b
// a{b}c -> a{b}c
minimatch.braceExpand = function (pattern, options) {
  return new Minimatch(pattern, options).braceExpand()
}

Minimatch.prototype.braceExpand = braceExpand
function braceExpand (pattern, options) {
  options = options || this.options
  pattern = typeof pattern === "undefined"
    ? this.pattern : pattern

  if (typeof pattern === "undefined") {
    throw new Error("undefined pattern")
  }

  if (options.nobrace ||
      !pattern.match(/\{.*\}/)) {
    // shortcut. no need to expand.
    return [pattern]
  }

  var escaping = false

  // examples and comments refer to this crazy pattern:
  // a{b,c{d,e},{f,g}h}x{y,z}
  // expected:
  // abxy
  // abxz
  // acdxy
  // acdxz
  // acexy
  // acexz
  // afhxy
  // afhxz
  // aghxy
  // aghxz

  // everything before the first \{ is just a prefix.
  // So, we pluck that off, and work with the rest,
  // and then prepend it to everything we find.
  if (pattern.charAt(0) !== "{") {
    this.debug(pattern)
    var prefix = null
    for (var i = 0, l = pattern.length; i < l; i ++) {
      var c = pattern.charAt(i)
      this.debug(i, c)
      if (c === "\\") {
        escaping = !escaping
      } else if (c === "{" && !escaping) {
        prefix = pattern.substr(0, i)
        break
      }
    }

    // actually no sets, all { were escaped.
    if (prefix === null) {
      this.debug("no sets")
      return [pattern]
    }

   var tail = braceExpand.call(this, pattern.substr(i), options)
    return tail.map(function (t) {
      return prefix + t
    })
  }

  // now we have something like:
  // {b,c{d,e},{f,g}h}x{y,z}
  // walk through the set, expanding each part, until
  // the set ends.  then, we'll expand the suffix.
  // If the set only has a single member, then'll put the {} back

  // first, handle numeric sets, since they're easier
  var numset = pattern.match(/^\{(-?[0-9]+)\.\.(-?[0-9]+)\}/)
  if (numset) {
    this.debug("numset", numset[1], numset[2])
    var suf = braceExpand.call(this, pattern.substr(numset[0].length), options)
      , start = +numset[1]
      , end = +numset[2]
      , inc = start > end ? -1 : 1
      , set = []
    for (var i = start; i != (end + inc); i += inc) {
      // append all the suffixes
      for (var ii = 0, ll = suf.length; ii < ll; ii ++) {
        set.push(i + suf[ii])
      }
    }
    return set
  }

  // ok, walk through the set
  // We hope, somewhat optimistically, that there
  // will be a } at the end.
  // If the closing brace isn't found, then the pattern is
  // interpreted as braceExpand("\\" + pattern) so that
  // the leading \{ will be interpreted literally.
  var i = 1 // skip the \{
    , depth = 1
    , set = []
    , member = ""
    , sawEnd = false
    , escaping = false

  function addMember () {
    set.push(member)
    member = ""
  }

  this.debug("Entering for")
  FOR: for (i = 1, l = pattern.length; i < l; i ++) {
    var c = pattern.charAt(i)
    this.debug("", i, c)

    if (escaping) {
      escaping = false
      member += "\\" + c
    } else {
      switch (c) {
        case "\\":
          escaping = true
          continue

        case "{":
          depth ++
          member += "{"
          continue

        case "}":
          depth --
          // if this closes the actual set, then we're done
          if (depth === 0) {
            addMember()
            // pluck off the close-brace
            i ++
            break FOR
          } else {
            member += c
            continue
          }

        case ",":
          if (depth === 1) {
            addMember()
          } else {
            member += c
          }
          continue

        default:
          member += c
          continue
      } // switch
    } // else
  } // for

  // now we've either finished the set, and the suffix is
  // pattern.substr(i), or we have *not* closed the set,
  // and need to escape the leading brace
  if (depth !== 0) {
    this.debug("didn't close", pattern)
    return braceExpand.call(this, "\\" + pattern, options)
  }

  // x{y,z} -> ["xy", "xz"]
  this.debug("set", set)
  this.debug("suffix", pattern.substr(i))
  var suf = braceExpand.call(this, pattern.substr(i), options)
  // ["b", "c{d,e}","{f,g}h"] ->
  //   [["b"], ["cd", "ce"], ["fh", "gh"]]
  var addBraces = set.length === 1
  this.debug("set pre-expanded", set)
  set = set.map(function (p) {
    return braceExpand.call(this, p, options)
  }, this)
  this.debug("set expanded", set)


  // [["b"], ["cd", "ce"], ["fh", "gh"]] ->
  //   ["b", "cd", "ce", "fh", "gh"]
  set = set.reduce(function (l, r) {
    return l.concat(r)
  })

  if (addBraces) {
    set = set.map(function (s) {
      return "{" + s + "}"
    })
  }

  // now attach the suffixes.
  var ret = []
  for (var i = 0, l = set.length; i < l; i ++) {
    for (var ii = 0, ll = suf.length; ii < ll; ii ++) {
      ret.push(set[i] + suf[ii])
    }
  }
  return ret
}

// parse a component of the expanded set.
// At this point, no pattern may contain "/" in it
// so we're going to return a 2d array, where each entry is the full
// pattern, split on '/', and then turned into a regular expression.
// A regexp is made at the end which joins each array with an
// escaped /, and another full one which joins each regexp with |.
//
// Following the lead of Bash 4.1, note that "**" only has special meaning
// when it is the *only* thing in a path portion.  Otherwise, any series
// of * is equivalent to a single *.  Globstar behavior is enabled by
// default, and can be disabled by setting options.noglobstar.
Minimatch.prototype.parse = parse
var SUBPARSE = {}
function parse (pattern, isSub) {
  var options = this.options

  // shortcuts
  if (!options.noglobstar && pattern === "**") return GLOBSTAR
  if (pattern === "") return ""

  var re = ""
    , hasMagic = !!options.nocase
    , escaping = false
    // ? => one single character
    , patternListStack = []
    , plType
    , stateChar
    , inClass = false
    , reClassStart = -1
    , classStart = -1
    // . and .. never match anything that doesn't start with .,
    // even when options.dot is set.
    , patternStart = pattern.charAt(0) === "." ? "" // anything
      // not (start or / followed by . or .. followed by / or end)
      : options.dot ? "(?!(?:^|\\\/)\\.{1,2}(?:$|\\\/))"
      : "(?!\\.)"
    , self = this

  function clearStateChar () {
    if (stateChar) {
      // we had some state-tracking character
      // that wasn't consumed by this pass.
      switch (stateChar) {
        case "*":
          re += star
          hasMagic = true
          break
        case "?":
          re += qmark
          hasMagic = true
          break
        default:
          re += "\\"+stateChar
          break
      }
      self.debug('clearStateChar %j %j', stateChar, re)
      stateChar = false
    }
  }

  for ( var i = 0, len = pattern.length, c
      ; (i < len) && (c = pattern.charAt(i))
      ; i ++ ) {

    this.debug("%s\t%s %s %j", pattern, i, re, c)

    // skip over any that are escaped.
    if (escaping && reSpecials[c]) {
      re += "\\" + c
      escaping = false
      continue
    }

    SWITCH: switch (c) {
      case "/":
        // completely not allowed, even escaped.
        // Should already be path-split by now.
        return false

      case "\\":
        clearStateChar()
        escaping = true
        continue

      // the various stateChar values
      // for the "extglob" stuff.
      case "?":
      case "*":
      case "+":
      case "@":
      case "!":
        this.debug("%s\t%s %s %j <-- stateChar", pattern, i, re, c)

        // all of those are literals inside a class, except that
        // the glob [!a] means [^a] in regexp
        if (inClass) {
          this.debug('  in class')
          if (c === "!" && i === classStart + 1) c = "^"
          re += c
          continue
        }

        // if we already have a stateChar, then it means
        // that there was something like ** or +? in there.
        // Handle the stateChar, then proceed with this one.
        self.debug('call clearStateChar %j', stateChar)
        clearStateChar()
        stateChar = c
        // if extglob is disabled, then +(asdf|foo) isn't a thing.
        // just clear the statechar *now*, rather than even diving into
        // the patternList stuff.
        if (options.noext) clearStateChar()
        continue

      case "(":
        if (inClass) {
          re += "("
          continue
        }

        if (!stateChar) {
          re += "\\("
          continue
        }

        plType = stateChar
        patternListStack.push({ type: plType
                              , start: i - 1
                              , reStart: re.length })
        // negation is (?:(?!js)[^/]*)
        re += stateChar === "!" ? "(?:(?!" : "(?:"
        this.debug('plType %j %j', stateChar, re)
        stateChar = false
        continue

      case ")":
        if (inClass || !patternListStack.length) {
          re += "\\)"
          continue
        }

        clearStateChar()
        hasMagic = true
        re += ")"
        plType = patternListStack.pop().type
        // negation is (?:(?!js)[^/]*)
        // The others are (?:<pattern>)<type>
        switch (plType) {
          case "!":
            re += "[^/]*?)"
            break
          case "?":
          case "+":
          case "*": re += plType
          case "@": break // the default anyway
        }
        continue

      case "|":
        if (inClass || !patternListStack.length || escaping) {
          re += "\\|"
          escaping = false
          continue
        }

        clearStateChar()
        re += "|"
        continue

      // these are mostly the same in regexp and glob
      case "[":
        // swallow any state-tracking char before the [
        clearStateChar()

        if (inClass) {
          re += "\\" + c
          continue
        }

        inClass = true
        classStart = i
        reClassStart = re.length
        re += c
        continue

      case "]":
        //  a right bracket shall lose its special
        //  meaning and represent itself in
        //  a bracket expression if it occurs
        //  first in the list.  -- POSIX.2 2.8.3.2
        if (i === classStart + 1 || !inClass) {
          re += "\\" + c
          escaping = false
          continue
        }

        // finish up the class.
        hasMagic = true
        inClass = false
        re += c
        continue

      default:
        // swallow any state char that wasn't consumed
        clearStateChar()

        if (escaping) {
          // no need
          escaping = false
        } else if (reSpecials[c]
                   && !(c === "^" && inClass)) {
          re += "\\"
        }

        re += c

    } // switch
  } // for


  // handle the case where we left a class open.
  // "[abc" is valid, equivalent to "\[abc"
  if (inClass) {
    // split where the last [ was, and escape it
    // this is a huge pita.  We now have to re-walk
    // the contents of the would-be class to re-translate
    // any characters that were passed through as-is
    var cs = pattern.substr(classStart + 1)
      , sp = this.parse(cs, SUBPARSE)
    re = re.substr(0, reClassStart) + "\\[" + sp[0]
    hasMagic = hasMagic || sp[1]
  }

  // handle the case where we had a +( thing at the *end*
  // of the pattern.
  // each pattern list stack adds 3 chars, and we need to go through
  // and escape any | chars that were passed through as-is for the regexp.
  // Go through and escape them, taking care not to double-escape any
  // | chars that were already escaped.
  var pl
  while (pl = patternListStack.pop()) {
    var tail = re.slice(pl.reStart + 3)
    // maybe some even number of \, then maybe 1 \, followed by a |
    tail = tail.replace(/((?:\\{2})*)(\\?)\|/g, function (_, $1, $2) {
      if (!$2) {
        // the | isn't already escaped, so escape it.
        $2 = "\\"
      }

      // need to escape all those slashes *again*, without escaping the
      // one that we need for escaping the | character.  As it works out,
      // escaping an even number of slashes can be done by simply repeating
      // it exactly after itself.  That's why this trick works.
      //
      // I am sorry that you have to see this.
      return $1 + $1 + $2 + "|"
    })

    this.debug("tail=%j\n   %s", tail, tail)
    var t = pl.type === "*" ? star
          : pl.type === "?" ? qmark
          : "\\" + pl.type

    hasMagic = true
    re = re.slice(0, pl.reStart)
       + t + "\\("
       + tail
  }

  // handle trailing things that only matter at the very end.
  clearStateChar()
  if (escaping) {
    // trailing \\
    re += "\\\\"
  }

  // only need to apply the nodot start if the re starts with
  // something that could conceivably capture a dot
  var addPatternStart = false
  switch (re.charAt(0)) {
    case ".":
    case "[":
    case "(": addPatternStart = true
  }

  // if the re is not "" at this point, then we need to make sure
  // it doesn't match against an empty path part.
  // Otherwise a/* will match a/, which it should not.
  if (re !== "" && hasMagic) re = "(?=.)" + re

  if (addPatternStart) re = patternStart + re

  // parsing just a piece of a larger pattern.
  if (isSub === SUBPARSE) {
    return [ re, hasMagic ]
  }

  // skip the regexp for non-magical patterns
  // unescape anything in it, though, so that it'll be
  // an exact match against a file etc.
  if (!hasMagic) {
    return globUnescape(pattern)
  }

  var flags = options.nocase ? "i" : ""
    , regExp = new RegExp("^" + re + "$", flags)

  regExp._glob = pattern
  regExp._src = re

  return regExp
}

minimatch.makeRe = function (pattern, options) {
  return new Minimatch(pattern, options || {}).makeRe()
}

Minimatch.prototype.makeRe = makeRe
function makeRe () {
  if (this.regexp || this.regexp === false) return this.regexp

  // at this point, this.set is a 2d array of partial
  // pattern strings, or "**".
  //
  // It's better to use .match().  This function shouldn't
  // be used, really, but it's pretty convenient sometimes,
  // when you just want to work with a regex.
  var set = this.set

  if (!set.length) return this.regexp = false
  var options = this.options

  var twoStar = options.noglobstar ? star
      : options.dot ? twoStarDot
      : twoStarNoDot
    , flags = options.nocase ? "i" : ""

  var re = set.map(function (pattern) {
    return pattern.map(function (p) {
      return (p === GLOBSTAR) ? twoStar
           : (typeof p === "string") ? regExpEscape(p)
           : p._src
    }).join("\\\/")
  }).join("|")

  // must match entire pattern
  // ending in a * or ** will make it less strict.
  re = "^(?:" + re + ")$"

  // can match anything, as long as it's not this.
  if (this.negate) re = "^(?!" + re + ").*$"

  try {
    return this.regexp = new RegExp(re, flags)
  } catch (ex) {
    return this.regexp = false
  }
}

minimatch.match = function (list, pattern, options) {
  options = options || {}
  var mm = new Minimatch(pattern, options)
  list = list.filter(function (f) {
    return mm.match(f)
  })
  if (mm.options.nonull && !list.length) {
    list.push(pattern)
  }
  return list
}

Minimatch.prototype.match = match
function match (f, partial) {
  this.debug("match", f, this.pattern)
  // short-circuit in the case of busted things.
  // comments, etc.
  if (this.comment) return false
  if (this.empty) return f === ""

  if (f === "/" && partial) return true

  var options = this.options

  // windows: need to use /, not \
  // On other platforms, \ is a valid (albeit bad) filename char.
  if (platform === "win32") {
    f = f.split("\\").join("/")
  }

  // treat the test path as a set of pathparts.
  f = f.split(slashSplit)
  this.debug(this.pattern, "split", f)

  // just ONE of the pattern sets in this.set needs to match
  // in order for it to be valid.  If negating, then just one
  // match means that we have failed.
  // Either way, return on the first hit.

  var set = this.set
  this.debug(this.pattern, "set", set)

  // Find the basename of the path by looking for the last non-empty segment
  var filename;
  for (var i = f.length - 1; i >= 0; i--) {
    filename = f[i]
    if (filename) break
  }

  for (var i = 0, l = set.length; i < l; i ++) {
    var pattern = set[i], file = f
    if (options.matchBase && pattern.length === 1) {
      file = [filename]
    }
    var hit = this.matchOne(file, pattern, partial)
    if (hit) {
      if (options.flipNegate) return true
      return !this.negate
    }
  }

  // didn't get any hits.  this is success if it's a negative
  // pattern, failure otherwise.
  if (options.flipNegate) return false
  return this.negate
}

// set partial to true to test if, for example,
// "/a/b" matches the start of "/*/b/*/d"
// Partial means, if you run out of file before you run
// out of pattern, then that's fine, as long as all
// the parts match.
Minimatch.prototype.matchOne = function (file, pattern, partial) {
  var options = this.options

  this.debug("matchOne",
              { "this": this
              , file: file
              , pattern: pattern })

  this.debug("matchOne", file.length, pattern.length)

  for ( var fi = 0
          , pi = 0
          , fl = file.length
          , pl = pattern.length
      ; (fi < fl) && (pi < pl)
      ; fi ++, pi ++ ) {

    this.debug("matchOne loop")
    var p = pattern[pi]
      , f = file[fi]

    this.debug(pattern, p, f)

    // should be impossible.
    // some invalid regexp stuff in the set.
    if (p === false) return false

    if (p === GLOBSTAR) {
      this.debug('GLOBSTAR', [pattern, p, f])

      // "**"
      // a/**/b/**/c would match the following:
      // a/b/x/y/z/c
      // a/x/y/z/b/c
      // a/b/x/b/x/c
      // a/b/c
      // To do this, take the rest of the pattern after
      // the **, and see if it would match the file remainder.
      // If so, return success.
      // If not, the ** "swallows" a segment, and try again.
      // This is recursively awful.
      //
      // a/**/b/**/c matching a/b/x/y/z/c
      // - a matches a
      // - doublestar
      //   - matchOne(b/x/y/z/c, b/**/c)
      //     - b matches b
      //     - doublestar
      //       - matchOne(x/y/z/c, c) -> no
      //       - matchOne(y/z/c, c) -> no
      //       - matchOne(z/c, c) -> no
      //       - matchOne(c, c) yes, hit
      var fr = fi
        , pr = pi + 1
      if (pr === pl) {
        this.debug('** at the end')
        // a ** at the end will just swallow the rest.
        // We have found a match.
        // however, it will not swallow /.x, unless
        // options.dot is set.
        // . and .. are *never* matched by **, for explosively
        // exponential reasons.
        for ( ; fi < fl; fi ++) {
          if (file[fi] === "." || file[fi] === ".." ||
              (!options.dot && file[fi].charAt(0) === ".")) return false
        }
        return true
      }

      // ok, let's see if we can swallow whatever we can.
      WHILE: while (fr < fl) {
        var swallowee = file[fr]

        this.debug('\nglobstar while',
                    file, fr, pattern, pr, swallowee)

        // XXX remove this slice.  Just pass the start index.
        if (this.matchOne(file.slice(fr), pattern.slice(pr), partial)) {
          this.debug('globstar found match!', fr, fl, swallowee)
          // found a match.
          return true
        } else {
          // can't swallow "." or ".." ever.
          // can only swallow ".foo" when explicitly asked.
          if (swallowee === "." || swallowee === ".." ||
              (!options.dot && swallowee.charAt(0) === ".")) {
            this.debug("dot detected!", file, fr, pattern, pr)
            break WHILE
          }

          // ** swallows a segment, and continue.
          this.debug('globstar swallow a segment, and continue')
          fr ++
        }
      }
      // no match was found.
      // However, in partial mode, we can't say this is necessarily over.
      // If there's more *pattern* left, then
      if (partial) {
        // ran out of file
        this.debug("\n>>> no match, partial?", file, fr, pattern, pr)
        if (fr === fl) return true
      }
      return false
    }

    // something other than **
    // non-magic patterns just have to match exactly
    // patterns with magic have been turned into regexps.
    var hit
    if (typeof p === "string") {
      if (options.nocase) {
        hit = f.toLowerCase() === p.toLowerCase()
      } else {
        hit = f === p
      }
      this.debug("string match", p, f, hit)
    } else {
      hit = f.match(p)
      this.debug("pattern match", p, f, hit)
    }

    if (!hit) return false
  }

  // Note: ending in / means that we'll get a final ""
  // at the end of the pattern.  This can only match a
  // corresponding "" at the end of the file.
  // If the file ends in /, then it can only match a
  // a pattern that ends in /, unless the pattern just
  // doesn't have any more for it. But, a/b/ should *not*
  // match "a/b/*", even though "" matches against the
  // [^/]*? pattern, except in partial mode, where it might
  // simply not be reached yet.
  // However, a/b/ should still satisfy a/*

  // now either we fell off the end of the pattern, or we're done.
  if (fi === fl && pi === pl) {
    // ran out of pattern and filename at the same time.
    // an exact hit!
    return true
  } else if (fi === fl) {
    // ran out of file, but still had pattern left.
    // this is ok if we're doing the match as part of
    // a glob fs traversal.
    return partial
  } else if (pi === pl) {
    // ran out of pattern, still have file left.
    // this is only acceptable if we're on the very last
    // empty segment of a file with a trailing slash.
    // a/* should match a/b/
    var emptyFileEnd = (fi === fl - 1) && (file[fi] === "")
    return emptyFileEnd
  }

  // should be unreachable.
  throw new Error("wtf?")
}


// replace stuff like \* with *
function globUnescape (s) {
  return s.replace(/\\(.)/g, "$1")
}


function regExpEscape (s) {
  return s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")
}

})( typeof require === "function" ? require : null,
    this,
    typeof module === "object" ? module : null,
    typeof process === "object" ? process.platform : "win32"
  )

}).call(this,require("FWaASH"))
},{"FWaASH":27,"lru-cache":56,"path":26,"sigmund":57}],56:[function(require,module,exports){
;(function () { // closure for web browsers

if (typeof module === 'object' && module.exports) {
  module.exports = LRUCache
} else {
  // just set the global for non-node platforms.
  this.LRUCache = LRUCache
}

function hOP (obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function naiveLength () { return 1 }

function LRUCache (options) {
  if (!(this instanceof LRUCache))
    return new LRUCache(options)

  if (typeof options === 'number')
    options = { max: options }

  if (!options)
    options = {}

  this._max = options.max
  // Kind of weird to have a default max of Infinity, but oh well.
  if (!this._max || !(typeof this._max === "number") || this._max <= 0 )
    this._max = Infinity

  this._lengthCalculator = options.length || naiveLength
  if (typeof this._lengthCalculator !== "function")
    this._lengthCalculator = naiveLength

  this._allowStale = options.stale || false
  this._maxAge = options.maxAge || null
  this._dispose = options.dispose
  this.reset()
}

// resize the cache when the max changes.
Object.defineProperty(LRUCache.prototype, "max",
  { set : function (mL) {
      if (!mL || !(typeof mL === "number") || mL <= 0 ) mL = Infinity
      this._max = mL
      if (this._length > this._max) trim(this)
    }
  , get : function () { return this._max }
  , enumerable : true
  })

// resize the cache when the lengthCalculator changes.
Object.defineProperty(LRUCache.prototype, "lengthCalculator",
  { set : function (lC) {
      if (typeof lC !== "function") {
        this._lengthCalculator = naiveLength
        this._length = this._itemCount
        for (var key in this._cache) {
          this._cache[key].length = 1
        }
      } else {
        this._lengthCalculator = lC
        this._length = 0
        for (var key in this._cache) {
          this._cache[key].length = this._lengthCalculator(this._cache[key].value)
          this._length += this._cache[key].length
        }
      }

      if (this._length > this._max) trim(this)
    }
  , get : function () { return this._lengthCalculator }
  , enumerable : true
  })

Object.defineProperty(LRUCache.prototype, "length",
  { get : function () { return this._length }
  , enumerable : true
  })


Object.defineProperty(LRUCache.prototype, "itemCount",
  { get : function () { return this._itemCount }
  , enumerable : true
  })

LRUCache.prototype.forEach = function (fn, thisp) {
  thisp = thisp || this
  var i = 0;
  for (var k = this._mru - 1; k >= 0 && i < this._itemCount; k--) if (this._lruList[k]) {
    i++
    var hit = this._lruList[k]
    if (this._maxAge && (Date.now() - hit.now > this._maxAge)) {
      del(this, hit)
      if (!this._allowStale) hit = undefined
    }
    if (hit) {
      fn.call(thisp, hit.value, hit.key, this)
    }
  }
}

LRUCache.prototype.keys = function () {
  var keys = new Array(this._itemCount)
  var i = 0
  for (var k = this._mru - 1; k >= 0 && i < this._itemCount; k--) if (this._lruList[k]) {
    var hit = this._lruList[k]
    keys[i++] = hit.key
  }
  return keys
}

LRUCache.prototype.values = function () {
  var values = new Array(this._itemCount)
  var i = 0
  for (var k = this._mru - 1; k >= 0 && i < this._itemCount; k--) if (this._lruList[k]) {
    var hit = this._lruList[k]
    values[i++] = hit.value
  }
  return values
}

LRUCache.prototype.reset = function () {
  if (this._dispose && this._cache) {
    for (var k in this._cache) {
      this._dispose(k, this._cache[k].value)
    }
  }

  this._cache = Object.create(null) // hash of items by key
  this._lruList = Object.create(null) // list of items in order of use recency
  this._mru = 0 // most recently used
  this._lru = 0 // least recently used
  this._length = 0 // number of items in the list
  this._itemCount = 0
}

// Provided for debugging/dev purposes only. No promises whatsoever that
// this API stays stable.
LRUCache.prototype.dump = function () {
  return this._cache
}

LRUCache.prototype.dumpLru = function () {
  return this._lruList
}

LRUCache.prototype.set = function (key, value) {
  if (hOP(this._cache, key)) {
    // dispose of the old one before overwriting
    if (this._dispose) this._dispose(key, this._cache[key].value)
    if (this._maxAge) this._cache[key].now = Date.now()
    this._cache[key].value = value
    this.get(key)
    return true
  }

  var len = this._lengthCalculator(value)
  var age = this._maxAge ? Date.now() : 0
  var hit = new Entry(key, value, this._mru++, len, age)

  // oversized objects fall out of cache automatically.
  if (hit.length > this._max) {
    if (this._dispose) this._dispose(key, value)
    return false
  }

  this._length += hit.length
  this._lruList[hit.lu] = this._cache[key] = hit
  this._itemCount ++

  if (this._length > this._max) trim(this)
  return true
}

LRUCache.prototype.has = function (key) {
  if (!hOP(this._cache, key)) return false
  var hit = this._cache[key]
  if (this._maxAge && (Date.now() - hit.now > this._maxAge)) {
    return false
  }
  return true
}

LRUCache.prototype.get = function (key) {
  return get(this, key, true)
}

LRUCache.prototype.peek = function (key) {
  return get(this, key, false)
}

LRUCache.prototype.pop = function () {
  var hit = this._lruList[this._lru]
  del(this, hit)
  return hit || null
}

LRUCache.prototype.del = function (key) {
  del(this, this._cache[key])
}

function get (self, key, doUse) {
  var hit = self._cache[key]
  if (hit) {
    if (self._maxAge && (Date.now() - hit.now > self._maxAge)) {
      del(self, hit)
      if (!self._allowStale) hit = undefined
    } else {
      if (doUse) use(self, hit)
    }
    if (hit) hit = hit.value
  }
  return hit
}

function use (self, hit) {
  shiftLU(self, hit)
  hit.lu = self._mru ++
  self._lruList[hit.lu] = hit
}

function trim (self) {
  while (self._lru < self._mru && self._length > self._max)
    del(self, self._lruList[self._lru])
}

function shiftLU (self, hit) {
  delete self._lruList[ hit.lu ]
  while (self._lru < self._mru && !self._lruList[self._lru]) self._lru ++
}

function del (self, hit) {
  if (hit) {
    if (self._dispose) self._dispose(hit.key, hit.value)
    self._length -= hit.length
    self._itemCount --
    delete self._cache[ hit.key ]
    shiftLU(self, hit)
  }
}

// classy, since V8 prefers predictable objects.
function Entry (key, value, lu, length, now) {
  this.key = key
  this.value = value
  this.lu = lu
  this.length = length
  this.now = now
}

})()

},{}],57:[function(require,module,exports){
module.exports = sigmund
function sigmund (subject, maxSessions) {
    maxSessions = maxSessions || 10;
    var notes = [];
    var analysis = '';
    var RE = RegExp;

    function psychoAnalyze (subject, session) {
        if (session > maxSessions) return;

        if (typeof subject === 'function' ||
            typeof subject === 'undefined') {
            return;
        }

        if (typeof subject !== 'object' || !subject ||
            (subject instanceof RE)) {
            analysis += subject;
            return;
        }

        if (notes.indexOf(subject) !== -1 || session === maxSessions) return;

        notes.push(subject);
        analysis += '{';
        Object.keys(subject).forEach(function (issue, _, __) {
            // pseudo-private values.  skip those.
            if (issue.charAt(0) === '_') return;
            var to = typeof subject[issue];
            if (to === 'function' || to === 'undefined') return;
            analysis += issue;
            psychoAnalyze(subject[issue], session + 1);
        });
    }
    psychoAnalyze(subject, 0);
    return analysis;
}

// vim: set softtabstop=4 shiftwidth=4:

},{}],"MIlwAv":[function(require,module,exports){
(function (process){
var Stream = require('stream')

// through
//
// a stream that does nothing but re-emit the input.
// useful for aggregating a series of changing but not ending streams into one stream)

exports = module.exports = through
through.through = through

//create a readable writable stream.

function through (write, end, opts) {
  write = write || function (data) { this.queue(data) }
  end = end || function () { this.queue(null) }

  var ended = false, destroyed = false, buffer = [], _ended = false
  var stream = new Stream()
  stream.readable = stream.writable = true
  stream.paused = false

//  stream.autoPause   = !(opts && opts.autoPause   === false)
  stream.autoDestroy = !(opts && opts.autoDestroy === false)

  stream.write = function (data) {
    write.call(this, data)
    return !stream.paused
  }

  function drain() {
    while(buffer.length && !stream.paused) {
      var data = buffer.shift()
      if(null === data)
        return stream.emit('end')
      else
        stream.emit('data', data)
    }
  }

  stream.queue = stream.push = function (data) {
//    console.error(ended)
    if(_ended) return stream
    if(data == null) _ended = true
    buffer.push(data)
    drain()
    return stream
  }

  //this will be registered as the first 'end' listener
  //must call destroy next tick, to make sure we're after any
  //stream piped from here.
  //this is only a problem if end is not emitted synchronously.
  //a nicer way to do this is to make sure this is the last listener for 'end'

  stream.on('end', function () {
    stream.readable = false
    if(!stream.writable && stream.autoDestroy)
      process.nextTick(function () {
        stream.destroy()
      })
  })

  function _end () {
    stream.writable = false
    end.call(stream)
    if(!stream.readable && stream.autoDestroy)
      stream.destroy()
  }

  stream.end = function (data) {
    if(ended) return
    ended = true
    if(arguments.length) stream.write(data)
    _end() // will emit or queue
    return stream
  }

  stream.destroy = function () {
    if(destroyed) return
    destroyed = true
    ended = true
    buffer.length = 0
    stream.writable = stream.readable = false
    stream.emit('close')
    return stream
  }

  stream.pause = function () {
    if(stream.paused) return
    stream.paused = true
    return stream
  }

  stream.resume = function () {
    if(stream.paused) {
      stream.paused = false
      stream.emit('resume')
    }
    drain()
    //may have become paused again,
    //as drain emits 'data'.
    if(!stream.paused)
      stream.emit('drain')
    return stream
  }
  return stream
}


}).call(this,require("FWaASH"))
},{"FWaASH":27,"stream":29}],"through":[function(require,module,exports){
module.exports=require('MIlwAv');
},{}],60:[function(require,module,exports){
//     Underscore.js 1.5.2
//     http://underscorejs.org
//     (c) 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.5.2';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, length = obj.length; i < length; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      var keys = _.keys(obj);
      for (var i = 0, length = keys.length; i < length; i++) {
        if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    return _.filter(obj, function(value, index, list) {
      return !iterator.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs, first) {
    if (_.isEmpty(attrs)) return first ? void 0 : [];
    return _[first ? 'find' : 'filter'](obj, function(value) {
      for (var key in attrs) {
        if (attrs[key] !== value[key]) return false;
      }
      return true;
    });
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.where(obj, attrs, true);
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity, value: -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed > result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity, value: Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array, using the modern version of the 
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sample **n** random values from an array.
  // If **n** is not specified, returns a single random element from the array.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (arguments.length < 2 || guard) {
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, value, context) {
    var iterator = lookupIterator(value);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, value, context) {
      var result = {};
      var iterator = value == null ? _.identity : lookupIterator(value);
      each(obj, function(value, index) {
        var key = iterator.call(context, value, index, obj);
        behavior(result, key, value);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, key, value) {
    (_.has(result, key) ? result[key] : (result[key] = [])).push(value);
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, key, value) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, key) {
    _.has(result, key) ? result[key]++ : result[key] = 1;
  });

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = iterator == null ? _.identity : lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    return (n == null) || guard ? array[0] : slice.call(array, 0, n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) {
      return array[array.length - 1];
    } else {
      return slice.call(array, Math.max(array.length - n, 0));
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, "length").concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, length = list.length; i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, length = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, length + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < length; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(length);

    while(idx < length) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context.
  _.partial = function(func) {
    var args = slice.call(arguments, 1);
    return function() {
      return func.apply(this, args.concat(slice.call(arguments)));
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error("bindAll must be passed function names");
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : new Date;
      timeout = null;
      result = func.apply(context, args);
    };
    return function() {
      var now = new Date;
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;
    return function() {
      context = this;
      args = arguments;
      timestamp = new Date();
      var later = function() {
        var last = (new Date()) - timestamp;
        if (last < wait) {
          timeout = setTimeout(later, wait - last);
        } else {
          timeout = null;
          if (!immediate) result = func.apply(context, args);
        }
      };
      var callNow = immediate && !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) result = func.apply(context, args);
      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = new Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = new Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

}).call(this);

},{}]},{},[])