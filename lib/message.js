var _ = require('underscore');
var MESSAGE = "MESSAGE";
var registry = require('./protob').registry;
var coorcers = require('./compiler/coorcers').coorcers;
var ByteBuffer = require('./protob').ByteBuffer;
var Protob     = require('./protob').Protob;
var decoders   = require('./compiler/decoders').decoders;
var encoders   = require('./compiler/encoders').encoders;

var Message = function(opts) {
  opts = opts || {};
  var self = this;

  this.setDefaults();

  // Apply all after initializers on this message
  [Message.afterInitialize, this.constructor.afterInitialize].forEach(function(funcs) {
    if ( !funcs ) { return; }
    funcs.forEach(function(func) { func.call(self); });
  });

  // Set the values passed in on this object
  Object.getOwnPropertyNames(opts).forEach(function(name){
    self[name] = opts[name];
  });

};

Message.afterInitialize = [];

Message.updateDescriptor = function(desc) {
  var self = this;
  this.descriptor     = desc;
  this.clazz          = desc.name;
  this.extensions     = this.extension;
  this.fullName       = this.parent + "." + desc.name;
  this.extensionRange = desc.extension_range;
  this.opts           = desc.options;
  this.fieldsById     = {};

  if ( desc.field && Array.isArray(desc.field) ) {
    desc.field.forEach(function(field) { self.fieldsById[field.number] = field; });

    this.orderedFields  = desc.field.sort(function(a,b) {
      if( a.number < b.number ) {
        return -1;
      } else if ( a.number > b.number ) {
        return 1;
      } else {
        return 0;
      }
    });
  }

  this.reset    = Message.reset;
  this.finalize = Message.finalize;
  this.decode   = Message.decode;
  this.encode   = Message.encode;
  this.reset();
};

Message.reset = function() {
  var fields = this.fields = {};
  if( Array.isArray(this.descriptor.field) ){
    this.descriptor.field.forEach( function(f) {
      fields[f.name] = f;
    });
  }
};

var expandDescriptors = function(descriptor) {
  var TYPE  = registry['google.protobuf.FieldDescriptorProto.Type'];
  var LABEL = registry['google.protobuf.FieldDescriptorProto.Label'];
  if ( Array.isArray(descriptor.field) ) {
    descriptor.field.forEach(function(field) {
      field.repeated = LABEL.fetch(field.label) == LABEL.fetch("LABEL_REPEATED");
      field.required = LABEL.fetch(field.label) == LABEL.fetch("LABEL_REQUIRED");
      var type = TYPE.fetch(field.type || field.type_name);
      field.fieldType = type.name;
      if ( type.name == 'TYPE_MESSAGE' || type.name == 'TYPE_ENUM') {
        var name = field.type_name.replace(/^\./, '');
        field.descriptor = registry[name].descriptor;
        field.concrete   = registry[name];
      }
    });
  }
};

Message.finalize = function() {
  if ( _.isEqual(this._finalDesc, this.descriptor ) ) { return; }

  var TYPE  = registry['google.protobuf.FieldDescriptorProto.Type'];
  this.type = TYPE.fetch("TYPE_MESSAGE");

  this.descriptor.concrete = this;

  expandDescriptors(this.descriptor);

  this._finalDesc = this.descriptor;
  if( !Object.isFrozen(this.descriptor) ) { Object.freeze(this.descriptor); }
};

encodeField = function(field, value, opts) {
  var self = this;
  var val;
  var TYPE  = registry['google.protobuf.FieldDescriptorProto.Type'];
  if ( field.fieldType == "TYPE_ENUM" ){
    var typeName = field.type_name.replace(/^\./, '');
    val = coorcers[field.fieldType](field.name, registry[typeName]).call(self, value, opts);
  } else if ( field.fieldType == "TYPE_MESSAGE" ) {
    val = coorcers[field.fieldType](field.name, field).call(self, value, opts);
  } else {
    val = coorcers[field.fieldType](field.name).call(self, value, opts);
  }
  return val;
};

Message.prototype.enumFor = function(fieldName){
  var field;
  if(!this[fieldName]){
    return;
  } else {
    if(this[fieldName] instanceof Enum){
      return this[fieldName];
    } else {
      field = this.constructor.fieldsByName[fieldName];
      if(!field){ throw new Error('Field ' + fieldName + ' not defined'); }
      return field.concrete.fetch(this[fieldName]);
    }
  }
}

Message.prototype.enumValue = function(fieldName){
  var _enum;
  _enum = this.enumFor(fieldName);
  if(!_enum){ return; }
  return _enum.number;
}

Message.prototype.enumName = function(fieldName){
  var _enum;
  _enum = this.enumFor(fieldName);
  if(!_enum){ return; }
  return _enum.name;
}

Message.prototype.setDefaults = function(){
  if(!this.constructor.descriptor) { return; }
  if(!this.constructor.descriptor.field) { return; }
  var fields = this.constructor.descriptor.field || [];

  for(var i=0; i<fields.length; i++){
    if(fields[i].default_value){
      if(fields[i].fieldType == 'TYPE_BOOL') {
        this[fields[i].name] = fields[i].default_value != "false";
      } else {
        this[fields[i].name] = fields[i].default_value;
      }
    }
  }
};

Message.prototype.__defineGetter__('protoFields', function(){ return this.protoValues(); });
Message.prototype.__defineGetter__('allFields',   function(){ return this.protoValues(); });

Message.prototype.protoValues = function(opts){
  opts = opts || {};
  var out = {};
  var self = this;
  var fields = this.constructor.descriptor.field || [];

  fields.forEach(function(field) {
    var value = self[field.name];
    if ( field.repeated ) {
      if ( value === undefined || value === null ){ out[field.name] = []; return; }
      if ( !Array.isArray(value) ) { value = [value]; }
      out[field.name] = value.map(function(val) {
        return encodeField.call(self, field, val, opts);
      });
    } else {
      var val = encodeField.call(self, field, value, opts);
      if ( val !== undefined && val !== null ) {
        out[field.name] = val;
      }
    }
  });

  return out;
};

Message.prototype.fieldById = function(id) {
  return this.constructor.fieldsById[id];
};

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

Message.prototype.decode = function(buffer, length, opts) {
  length = typeof length === 'number' ? length : -1;
  var self = this;
  var start = buffer.offset;
  var msg = new (this.constructor)();
  while (buffer.offset < start+length || (length == -1 && buffer.remaining() > 0)) {
    var tag = buffer.readVarint32();
    var wireType = tag & 0x07,
        id = tag >> 3;
    var field = this.fieldById(id); // Message.Field only
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
    if (field.repeated && (!field.options || !field.options.packed)) {
      msg[field.name] = msg[field.name] || [];
      msg[field.name].push(decoders.field(wireType, buffer, false, field, opts));
    } else {
      msg[field.name] = decoders.field(wireType, buffer, false, field, opts);
    }
  }
  // Check if all required fields are present
  var LABEL = registry['google.protobuf.FieldDescriptorProto.Label'];
  this.constructor.descriptor.field.forEach( function(field) {
    if ( LABEL.fetch(field.label) != LABEL.fetch("LABEL_REQUIRED")) { return; }
    if ( msg[field.name] === undefined || msg[field.name] === null ){
      var err = new Error("Missing field "+field.name);
      err.decoded = msg;
      throw err;
    }
  });
  return msg;
};

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

Message.prototype.encode = function(buffer) {
  if ( !buffer ) { return this.constructor.encode(this); }

  var fields = this.constructor.orderedFields,
      self = this,
      protoFields = self.protoFields,
      fieldEncoder = encoders.field;

  fields.forEach(function(field) {
    if( field.required && (protoFields[field.name] === undefined || protoFields[field.name] === null )) {
      var err = new Error("Missing at least one required field for "+self.constructor.fullName+": "+field.name);
      throw(err);
    }
  });

  fields.forEach(function(field){
    fieldEncoder(field, protoFields[field.name], buffer);
  });

  return buffer;
};

exports.Message = Message;
