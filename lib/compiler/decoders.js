var Util = require('util');
var Protob = require('../protob').Protob;
var registry = require('../protob').registry;

var UNIMPLEMENTED = function(buffer, field) {
  throw("TYPE GROUP for " + field.name + " is not implemented");
};

var decoders = {
  TYPE_ENUM:     function(buffer, field) { return buffer.readVarint32();              } ,
  TYPE_DOUBLE:   function(buffer, field) { return buffer.readDouble();                } ,
  TYPE_FLOAT:    function(buffer, field) { return buffer.readFloat();                 } ,
  TYPE_INT32:    function(buffer, field) { return buffer.readVarint32() | 0;          } ,
  TYPE_INT64:    function(buffer, field) { return buffer.readVarint64();              } ,
  TYPE_UINT32:   function(buffer, field) { return buffer.readVarint32() >>> 0;        } ,
  TYPE_UINT64:   function(buffer, field) { return buffer.readVarint64().toUnsigned(); } ,
  TYPE_FIXED32:  function(buffer, field) { return buffer.readUint32() >>> 0;          } ,
  TYPE_FIXED64:  function(buffer, field) { return buffer.readInt64();                 } ,
  TYPE_SFIXED32: function(buffer, field) { return buffer.readInt32() | 0;             } ,
  TYPE_SFIXED64: function(buffer, field) { return buffer.readUint64();                } ,
  TYPE_SINT32:   function(buffer, field) { return buffer.readZigZagVarint32() | 0;    } ,
  TYPE_SINT64:   function(buffer, field) { return buffer.readZigZagVarint64();        } ,
  TYPE_BOOL:     function(buffer, field) { return !!buffer.readVarint32();            } ,
  TYPE_STRING:   function(buffer, field) { return buffer.readVString();               } ,
  TYPE_GROUP:    UNIMPLEMENTED,

  TYPE_BYTES:    function(buffer, field) {
    nBytes = buffer.readVarint32();
    if (buffer.remaining() < nBytes) {
      throw(new Error("Illegal number of bytes for "+this.toString(true)+": "+nBytes+" required but got only "+buffer.remaining()));
    }
    value = buffer.clone(); // Offset already set
    value.length = value.offset+nBytes;
    buffer.offset += nBytes;
    return value;
  },

  TYPE_MESSAGE: function(buffer, field) {
    nBytes = buffer.readVarint32();
    return field.descriptor.concrete.decode(buffer, nBytes);
  },

  field: function(wireType, buffer, skipRepeated, field) {
    var nBytes;
    var fieldWireType = Protob.TYPES[field.fieldType] && Protob.TYPES[field.fieldType].wireType;

    if (wireType != fieldWireType && (skipRepeated || wireType != Protob.WIRE_TYPES.LDELIM || !field.repeated)) {
      throw(new Error("Illegal wire type for field "+field.name+": "+wireType+" ("+fieldWireType+" expected)"));
    }
    if (wireType == Protob.WIRE_TYPES.LDELIM && field.repeated && (field.options && field.options.packed)) {
      if( !skipRepeated ){
        nBytes = buffer.readVarint32();
        nBytes = buffer.offset + nBytes; // Limit
        var values = [];
        while (buffer.offset < nBytes) {
          values.push(decoders.field(fieldWireType, buffer, true, field));
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

    return decoder(buffer, field);

  }
};

exports.decoders = decoders;
