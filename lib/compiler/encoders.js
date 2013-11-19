var Protob = require('../protob').Protob;
var ByteBuffer = require('../protob').ByteBuffer;

var encoders = {
  TYPE_INT32: function(field, value, buffer){ buffer.writeVarint32(value); },
  TYPE_UINT32: function(field, value, buffer){ buffer.writeVarint32(value); },
  TYPE_SINT32: function(field, value, buffer) { buffer.writeZigZagVarint32(value); },
  TYPE_FIXED32: function(field, value, buffer) { buffer.writeUint32(value); },
  TYPE_SFIXED32: function(field, value, buffer) { buffer.writeInt32(value); },
  TYPE_INT64: function(field, value, buffer) { buffer.writeVarint64(value); },
  TYPE_UINT64: function(field, value, buffer) { buffer.writeVarint64(value); },
  TYPE_SINT64: function(field, value, buffer) { buffer.writeZigZagVarint64(value); },
  TYPE_FIXED64: function(field, value, buffer) { buffer.writeUint64(value); },
  TYPE_SFIXED64: function(field, value, buffer) { buffer.writeInt64(value); },
  TYPE_BOOL: function(field, value, buffer) { buffer.writeVarint32(value ? 1 : 0); },
  TYPE_ENUM: function(field, value, buffer) { buffer.writeVarint32(value); },
  TYPE_FLOAT: function(field, value, buffer) { buffer.writeFloat32(value); },
  TYPE_DOUBLE: function(field, value, buffer) { buffer.writeFloat64(value); },
  TYPE_STRING: function(field, value, buffer) { buffer.writeVString(value); },

  TYPE_BYTES: function(field, value, buffer) {
    if (value.offset > value.length) { // Forgot to flip?
      buffer = buffer.clone().flip();
    }
    buffer.writeVarint32(value.remaining());
    buffer.append(value);
  },

  TYPE_MESSAGE: function(field, value, buffer) {
    if ( !value ) { return; }
    if ( !( value instanceof field.descriptor.concrete ) ) {
      value = new field.descriptor.concrete(value);
    }
    var bb = value.encode();
    buffer.writeVarint32(bb.length)
    buffer.append(bb);
  },

  field: function(field, value, buffer){
    if ( field.type == null ) {
      throw(new Error("[INTERNAL] Unresolved type in "+field.name+": "+field.fieldType));
    }
    if (value === null || value === undefined || (field.repeated && (!value || !value.length) )) return buffer; // Optional omitted

    var encoder = encoders[field.fieldType];

    try {
      if ( field.repeated ) {
        var i;
        if (field.options && field.options["packed"]) {
          // "All of the elements of the field are packed into a single key-value pair with wire type 2
          // (length-delimited). Each element is encoded the same way it would be normally, except without a
          // tag preceding it."
          buffer.writeVarint32((field.number << 3) | Protob.WIRE_TYPES.LDELIM);
          buffer.ensureCapacity(buffer.offset += 1); // We do not know the length yet, so let's assume a varint of length 1
          var start = buffer.offset; // Remember where the contents begin
          value.forEach(function(v) { encoder(field, v, buffer) });

          var len = buffer.offset-start;
          var varintLen = ByteBuffer.calculateVarint32(len);
          if (varintLen > 1) { // We need to move the contents
            var contents = buffer.slice(start, buffer.offset);
            start += varintLen-1;
            buffer.offset = start;
            buffer.append(contents);
          }
          buffer.writeVarint32(len, start-varintLen);
        } else {
          // "If your message definition has repeated elements (without the [packed=true] option), the encoded
          // message has zero or more key-value pairs with the same tag number"
          value.forEach(function(val){
            buffer.writeVarint32((field.number << 3) | Protob.TYPES[field.fieldType].wireType);
            encoder(field, val, buffer);
          });
        }
      } else {
        buffer.writeVarint32((field.number << 3) | Protob.TYPES[field.fieldType].wireType);
        encoder(field, value, buffer);
      }
    } catch(e) {
       throw(new Error("Illegal value for "+field.name+": "+value+" ("+e+")"));
    };
    return buffer;
  }
};

exports.encoders = encoders;
