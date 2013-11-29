var ByteBuffer = require('bytebuffer');
var registry = {};
var v = {};

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
Protob.VERSION = "0.1.0";

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
Protob.registry = registry;
Protob.v = v;

exports.registry = registry;
exports.Protob = Protob;
exports.ByteBuffer = ByteBuffer;
