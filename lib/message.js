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
