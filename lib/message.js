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
 *    var MyMessage = Protob.v.my.scope.MyMessage;
 *
 *    MyMessage.prototype.helpMe = function() { return 'help'; }
 *
 *    var myMessage = new MyMessage({with: "some", field: "values"});
 *    myMessage.helpMe(); // 'help'
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
 */
Message.afterInitialize = [];

/**
 * When a protocol buffer is compiled from .json A new message class is created by inheriting from Message.
 * The updateDescriptor is then called with the raw descriptor that came from the .json file.
 * This descriptor maps to a google.protobuf.DescriptorProto
 *
 * Update descriptor augments the constructor function with information about
 *
 * <ul>
 *    <li>The Descriptor</li>
 *    <li>The name of the message</li>
 *    <li>The full name including package</li>
 *    <li>Attaches any extensions</li>
 *    <li>Attaches any options</li>
 *    <li>Adds some indecies for looking up field definitions</li>
 *    <li>Updates the reset, encode, decode and finalize methods on the constructor</li>
 *  </ul>
 *
 * You shouldn't call this directly.
 *
 * @param {object} desc - The descriptor. A Javascript version of google.protobuf.DescriptorProto
 * @protected
 */
Message.updateDescriptor = function(desc) {
  var self = this,
      dp = goog.descriptorProto;
  this.descriptor     = desc;
  this.clazz          = desc[dp.NAME];
  this.extensions     = this.extension;
  this.fullName       = this.parent + "." + this.clazz;
  this.extensionRange = desc[dp.EXTENSION_RANGE];
  this.options        = desc[dp.OPTIONS];

  this.reset    = Message.reset;
  this.reset();

  this.finalize = Message.finalize;
  this.decode   = Message.decode;
  this.encode   = Message.encode;
  registry._addFinalize(this.fullName);
};

/**
 * Reset the descriptor
 * @private
 */
Message.reset = function() {
  this.fieldsById   = {};
  this.fieldsByPkg  = {};
  this.orderedFields = this.orderedFields;
};

/**
 * Expands out all descriptors on this message
 * Looks at the type of the message, and attaches the relevant constructor to the descriptor
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

    if(label && label.number) label = label.number;

    field.repeated = LABEL.fetch(label) == LABEL.fetch("LABEL_REPEATED");
    field.required = LABEL.fetch(label) == LABEL.fetch("LABEL_REQUIRED");
    var type = TYPE.fetch(type || type.name);
    field.fieldType = type.name;
    if ( type.name == 'TYPE_MESSAGE' || type.name == 'TYPE_ENUM') {
      var name = typeName.replace(/^\./, '');
      field[fd.TYPE_NAME] = name;
      field.descriptor = registry.lookup(name).descriptor;
      field.concrete   = registry.lookup(name);
    }
    field.expandedForProtob = true;
  });
};

/**
 * Finalizes the message descriptor and message marking it complete
 * @private
 */
Message.finalize = function() {
  var DescriptorProto = registry.lookup('google.protobuf.DescriptorProto'),
      dp = goog.descriptorProto,
      fd = goog.fieldDescriptorProto;

  if(!this.descriptor instanceof DescriptorProto) {
    this.descriptor = new DescriptorProto(this.descriptor);
  }

  var desc = this.descriptor,
      self = this,
      TYPE  = registry.lookup('google.protobuf.FieldDescriptorProto.Type'),
      fields = desc[dp.FIELD];

  this.reset();

  if ( fields && Array.isArray(fields) ) {
    fields.forEach(function(field) {
      var number = field[fd.NUMBER],
          name = field[fd.NAME],
          label = field[fd.LABEL],
          extendee = field[fd.EXTENDEE];

      self.fieldsById[number] = field;

      if(extendee) {
        self.fieldsByPkg[field.pkg] = self.fieldsByPkg[field.pkg] || [];
        if(self.fieldsByPkg[field.pkg].indexOf(field) < 0) self.fieldsByPkg[field.pkg].push(field);
      } else {
        self.fieldsByPkg[undefined] = self.fieldsByPkg[undefined] || [];
        if(self.fieldsByPkg[undefined].indexOf(field) < 0) self.fieldsByPkg[undefined].push(field);
      }
    });

    this.orderedFields = fields.sort(function(a, b) { 
      var _a = a[fd.NUMBER],
          _b = b[fd.NUMBER];
      if ( _a < _b) {
        return -1;
      } else if (_a > _b) {
        return 1;
      } else {
        return 0;
      }

    });
  }

  this.type = TYPE.fetch("TYPE_MESSAGE");
  this.descriptor.concrete = this;
  expandDescriptors(this.descriptor);
};

/**
 * coorces the field into the correct type.
 * @param {object} field - The finalized field descriptor
 * @param {*} value - The value that the field should have
 * @param {object} opts - An options hash passed down to the coorcers
 * @private
 * @throws Error - When there is an incorect type this will throw.
 * @return {*} - An object compatible with the protocol buffer definition for this field
 */
function encodeField(field, value, opts) {
  var self = this,
      TYPE  = registry.lookup('google.protobuf.FieldDescriptorProto.Type'),
      dp = goog.descriptorProto,
      fd = goog.fieldDescriptorProto,
      val;

  if ( field.fieldType == "TYPE_ENUM" ){
    var typeName = field[fd.TYPE_NAME].replace(/^\./, '');
    val = coorcers[field.fieldType](field[fd.NAME], registry.lookup(typeName)).call(self, value, opts);
  } else if ( field.fieldType == "TYPE_MESSAGE" ) {
    val = coorcers[field.fieldType](field[fd.NAME], field).call(self, value, opts);
  } else {
    val = coorcers[field.fieldType](field[fd.NAME]).call(self, value, opts);
  }
  return val;
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

    if(label == fd.label.LABEL_REPEATED) {
      this[id] = [];
      if(!value) return;
      if(!Array.isArray(value)) value = [value];

      value.forEach(function(val) {
        self[id].push(encodeField.call(self, field, val, {}));
      });

    } else {
      this[id] = encodeField.call(this, field, value, {});
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

  if(!field) return undefined;
  return this.hasOwnProperty(field[fd.NUMBER]);
}

/**
 * fetch the field definition for a field
 * @private
 */
Message.prototype.getProtoField = function(nameOrNumber, pkg) {
  var constructor = this.constructor,
      fd = goog.fieldDescriptorProto,
      field;

  if(constructor.fieldsById[nameOrNumber]) return constructor.fieldsById[nameOrNumber];

  if(pkg) {
    if(!constructor.fieldsByPkg[pkg]) throw new Error('Package ' + pkg + ' not found for ' + this.constructor.fullName);
    field = constructor.fieldsByPkg[pkg].filter(function(f) {
      return f[fd.NUMBER] == nameOrNumber || f[fd.NAME] == nameOrNumber;
    })[0];
  } else {
    field = constructor.orderedFields.filter(function(f) { return f[fd.NAME] == nameOrNumber })[0];
  }
  return field;
}

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

  var fields = this.constructor.descriptor[dp.FIELD] || [];

  for(var i=0; i<fields.length; i++){
    if(this.isFieldSet(fields[i][fd.NUMBER])) continue;
    if(fields[i][fd.DEFAULT_VALUE] == undefined) continue;
    this.setf(fields[i][fd.DEFAULT_VALUE], fields[i][fd.NUMBER]);
  }
};

/**
 * Coorce and return only values defined in the protobuf definition
 *
 * @param {object} opts - Options
 * @param {array} [opts.extensions] - An array of package names. Any extensions that are found, that are not in the extensions list are excluded. By default, all fields are included
 * @return {Protob.Message} - The fully coorced message
 */
Message.prototype.protoValues = function(opts){
  var self = this,
      out = {};

  Object.keys(this.constructor.fieldsById).forEach(function(id) {
    if(self.hasOwnProperty(id)) {
      out = self[id];
    }
  });

  return new this.constructor(out);
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
          out[id] = val.map(function(v) { return (opts.longsAsInts ? v.toInt() : v.toString()); });
        } else {
          out[id] = (opts.longsAsInts ? val.toInt() : val.toString());
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
      fo = goog.fieldOptions;

  while (buffer.offset < start+length || (length == -1 && buffer.remaining() > 0)) {
    var tag = buffer.readVarint32(),
        wireType = tag & 0x07,
        id = tag >> 3,
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
          default:
            throw(new Error("Illegal wire type of unknown field "+id+" in "+this.constructor.fullName+"#decode: "+wireType));
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
  var LABEL = registry.lookup('google.protobuf.FieldDescriptorProto.Label');
  this.constructor.orderedFields.forEach( function(field) {
    if ( LABEL.fetch(field[fd.LABEL]) != LABEL.fetch("LABEL_REQUIRED")) { return; }
    if ( msg[field[fd.NUMBER]] === undefined || msg[field[fd.NUMBER]] === null ){
      var err = new Error("Missing field "+field[fd.NAME]);
      err.decoded = msg;
      throw err;
    }
    var TYPE  = registry.lookup('google.protobuf.FieldDescriptorProto.Type'),
        dp = goog.descriptorProto,
        evd = goog.enumValueDescriptorProto,
        type = TYPE.fetch(field[fd.TYPE]);

    // convert the default_value (if any) to the proper type
    if (field[fd.DEFAULT_VALUE] && type.name != 'TYPE_ENUM' && type.name != 'TYPE_MESSAGE') {
      msg[field[field.NUMBER]] = coorcers[type.name](msg[field[fd.NAME]]).call(self, field[fd.DEFAULT_VALUE]);
    }

  });
  return msg;
};

/**
 * Encode a protocol buffer message.
 * Before encoding, it will ensure consistency by calling Message#protoValues
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

  var fields = this.constructor.orderedFields,
      self = this,
      dp = goog.descriptorProto,
      fd = goog.fieldDescriptorProto,
      fieldEncoder = encoders.field;

  fields.forEach(function(field) {
    if( field.required && (self[field[fd.NUMBER]] === undefined || self[field[fd.NUMBER]] === null )) {
      var err = new Error("Missing at least one required field for "+self.constructor.fullName+": "+field[fd.NAME]);
      throw(err);
    }
  });

  fields.forEach(function(field){
    fieldEncoder(field, self[field[fd.NUMBER]], buffer);
  });

  return buffer;
};

exports.Message = Message;
