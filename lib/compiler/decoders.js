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
        repeated;

    if(label && label.number) label = label.number;
    repeated = label == fd.label.LABEL_REPEATED;

    if (wireType != fieldWireType && (skipRepeated || wireType != Protob.WIRE_TYPES.LDELIM || !field.repeated)) {
      throw(new Error("Illegal wire type for field "+field[fd.NAME]+": "+wireType+" ("+fieldWireType+" expected)"));
    }
    if (wireType == Protob.WIRE_TYPES.LDELIM && repeated && (field[fd.OPTIONS] && field[fd.OPTIONS][fo.PACKED])) {
      if( !skipRepeated ){
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
