require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
      debugger;
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

},{"./compiler/google-protos-defn":5,"./enum":6,"./message":8,"./registry":10,"./service":11,"./util":13,"fs":undefined,"glob":undefined,"path":20,"util":23}],2:[function(require,module,exports){
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

},{"../enum":6,"../protob":9,"../registry":10,"./google-protos-defn":5,"util":23}],3:[function(require,module,exports){
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

},{"../protob":9,"../registry":10,"./google-protos-defn":5,"util":23}],4:[function(require,module,exports){
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

},{"../enum":6,"../protob":9,"../registry":10,"./google-protos-defn":5}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
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

},{"./compiler/google-protos-defn":5,"./registry":10}],7:[function(require,module,exports){
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


},{}],8:[function(require,module,exports){
/**
 * Represents a compiled protobuf message
 * Messages are introspective so you can discover the field definitions at runtime
 * @module protob/message
 */
var MESSAGE = "MESSAGE",
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
  Object.keys(obj).forEach(function(key) { self.setf(obj[key], key); });
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

},{"./compiler/coorcers":2,"./compiler/decoders":3,"./compiler/encoders":4,"./compiler/google-protos-defn":5,"./enum":6,"./protob":9,"./registry":10,"./util":13}],9:[function(require,module,exports){
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

module.exports.Protob = Protob;
module.exports.ByteBuffer = ByteBuffer;
module.exports.registry = require('./registry');
module.exports.Compiler = require('./compiler');

Protob.registry = exports.registry;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./compiler":1,"./registry":10,"./version":14,"bytebuffer":24,"path":20}],10:[function(require,module,exports){
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
  function Registry() {
    this.aliases = {};
  }

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
    return registry[name] || registry[this.aliases[name]];
  };

  /**
   * Alias an object in the registry
   * @param {string} aliasName - The alias you'd like to use
   * @param {string} fullName - The full name of the object
   */
  Registry.prototype.alias = function(aliasName, fullName) {
    if(this.aliases.hasOwnProperty(aliasName)) throw new Error("Alias already exists " + aliasName);
    this.aliases[aliasName] = fullName;
  }

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


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./compiler":1,"./compiler/coorcers":2,"./compiler/encoders":4,"./compiler/google-protos-defn":5,"./google_descriptors":7}],11:[function(require,module,exports){
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

  /**
   * Set up the dispatching handler function.
   * @param {object} req - The request object. This will be coorced into the correct type if it is not already
   * @param {object} [opts] - An options object
   * @param {boolean} [opts.future] - If you want a future back. When true, an instance of the response is returned, and filled out once available. When false, a promise is returned.
   */
  handlerFn = function (req, opts) {
    req = req || {};

    var self = this, // Service instance
        promise = Promise.resolve(),
        asFuture = opts && opts.future,
        returnValue;

    if(asFuture) {
      returnValue = new method.outputType();
      returnValue.isFulfilled = false;
    }

    promise = promise.then(function() {
      req = ensureType(req, method.inputType);
      return fn.call(self, req) || {};
    }).then(function(res) {
      if(asFuture) {
        returnValue.isFulfilled = true;
        returnValue.updateValues(res);
      } else {
        returnValue = ensureType(res, method.outputType);
      }
      return returnValue;
    });

    if(asFuture) {
      returnValue.asPromised = promise;
      return returnValue;
    } else {
      return promise;
    }
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

},{"./compiler/google-protos-defn":5,"./message":8,"./registry":10,"bluebird":27}],12:[function(require,module,exports){
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

},{"./compiler":1,"path":20}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
module.exports = "1.1.2";

},{}],15:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var kMaxLength = 0x3fffffff

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
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

  // Find the length
  var length
  if (type === 'number')
    length = subject > 0 ? subject >>> 0 : 0
  else if (type === 'string') {
    if (encoding === 'base64')
      subject = base64clean(subject)
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) { // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data))
      subject = subject.data
    length = +subject.length > 0 ? Math.floor(+subject.length) : 0
  } else
    throw new TypeError('must start with number, buffer, array or string')

  if (this.length > kMaxLength)
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
      'size: 0x' + kMaxLength.toString(16) + ' bytes')

  var buf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer.TYPED_ARRAY_SUPPORT && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        buf[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        buf[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer.TYPED_ARRAY_SUPPORT && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

Buffer.isBuffer = function (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b))
    throw new TypeError('Arguments must be Buffers')

  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) return -1
  if (y < x) return 1
  return 0
}

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

Buffer.concat = function (list, totalLength) {
  if (!isArray(list)) throw new TypeError('Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
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

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    case 'hex':
      ret = str.length >>> 1
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    default:
      ret = str.length
  }
  return ret
}

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function (encoding, start, end) {
  var loweredCase = false

  start = start >>> 0
  end = end === undefined || end === Infinity ? this.length : end >>> 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase)
          throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.equals = function (b) {
  if(!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max)
      str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  return Buffer.compare(this, b)
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

function hexWrite (buf, string, offset, length) {
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
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(byte)) throw new Error('Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length, 2)
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
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new TypeError('Unknown encoding: ' + encoding)
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
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

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len;
    if (start < 0)
      start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0)
      end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start)
    end = start

  if (Buffer.TYPED_ARRAY_SUPPORT) {
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

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0)
    throw new RangeError('offset is not uint')
  if (offset + ext > length)
    throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
      ((this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3])
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80))
    return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      (this[offset + 3])
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new TypeError('value is out of bounds')
  if (offset + ext > buf.length) throw new TypeError('index out of range')
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new TypeError('value is out of bounds')
  if (offset + ext > buf.length) throw new TypeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
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
  if (end < start) throw new TypeError('sourceEnd < sourceStart')
  if (target_start < 0 || target_start >= target.length)
    throw new TypeError('targetStart out of bounds')
  if (start < 0 || start >= source.length) throw new TypeError('sourceStart out of bounds')
  if (end < 0 || end > source.length) throw new TypeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new TypeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new TypeError('start out of bounds')
  if (end < 0 || end > this.length) throw new TypeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr.constructor = Buffer
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
  arr.equals = BP.equals
  arr.compare = BP.compare
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

var INVALID_BASE64_RE = /[^+\/0-9A-z]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
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
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
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

function blitBuffer (src, dst, offset, length, unitSize) {
  if (unitSize) length -= length % unitSize;
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

},{"base64-js":16,"ieee754":17,"is-array":18}],16:[function(require,module,exports){
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

},{}],17:[function(require,module,exports){
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

},{}],18:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
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

}).call(this,require('_process'))
},{"_process":21}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],23:[function(require,module,exports){
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

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":22,"_process":21,"inherits":19}],24:[function(require,module,exports){
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

},{"buffer":15,"long":26}],25:[function(require,module,exports){
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

},{}],26:[function(require,module,exports){
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

},{"./dist/Long.js":25}],27:[function(require,module,exports){
"use strict";
var Promise = require("./promise/promise").Promise;
var polyfill = require("./promise/polyfill").polyfill;
exports.Promise = Promise;
exports.polyfill = polyfill;
},{"./promise/polyfill":31,"./promise/promise":32}],28:[function(require,module,exports){
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
},{"./utils":36}],29:[function(require,module,exports){
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
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":21}],30:[function(require,module,exports){
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
},{}],31:[function(require,module,exports){
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
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./promise":32,"./utils":36}],32:[function(require,module,exports){
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
},{"./all":28,"./asap":29,"./config":30,"./race":33,"./reject":34,"./resolve":35,"./utils":36}],33:[function(require,module,exports){
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
},{"./utils":36}],34:[function(require,module,exports){
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
},{}],35:[function(require,module,exports){
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
},{}],36:[function(require,module,exports){
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
},{}],"duplexer":[function(require,module,exports){

},{}],"protob":[function(require,module,exports){
exports.Protob    = require('./lib/protob').Protob
exports.Compiler  = require('./lib/compiler').Compiler
exports.Message   = require('./lib/message').Message
exports.Service   = require('./lib/service').Service;
exports.Enum      = require('./lib/enum').Enum;
exports.EnumValue = require('./lib/enum').EnumValue;
exports.stevenInit   = require('./lib/steven_init');

// exports.Compiler.compile(); // compile the base protos

},{"./lib/compiler":1,"./lib/enum":6,"./lib/message":8,"./lib/protob":9,"./lib/service":11,"./lib/steven_init":12}]},{},[]);
