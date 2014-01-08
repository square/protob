/**
 * Provides protocol buffer support for Node.js
 * Protob includes a proto buffer compiler `proto-gen-json` and uses the output to dynamically construct Javascript objects
 * that implement these definitions.
 *
 * Protob provides support for:
 *
 * <ul>
 *   <li>Converting .proto files to json definitions using protoc</li>
 *   <li>Fast loading</li>
 *   <li>64 bit support (Long.js && ByteBuffer.js)</li>
 *   <li>Reflection and introspection</li>
 *   <li>Dynamic reloading of proto definitions</li>
 *   <li>Messages</li>
 *   <li>Enums</li>
 *   <li>Services</li>
 *   <li>Exposes extensions but does not support extended messages (yet)</li>
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
    FS = require('fs'),
    registry = fetchRegistry(),
    Path = require('path'),
    v = fetchObjectCache();

/**
 * Fetches a cache from the global object for protobuf definitions to be stored on
 * @private
 */
function fetchProtobCache(){
  if(!global.protob){ global.protob = {}; }
  return global.protob;
}

/**
 * Fetches the compiled protobuffer registry
 * @private
 */
function fetchRegistry(){
  var cache = fetchProtobCache();
  if(!cache.registry){ cache.registry = {}; }
  return cache.registry;
}


/**
 * Fetches the compiled protobuffer object cache
 * @private
 */
function fetchObjectCache(){
  var cache = fetchProtobCache();
  if(!cache.objectCache){ cache.objectCache = {}; }
  return cache.objectCache;
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
Protob.VERSION = JSON.parse(FS.readFileSync(Path.join(__dirname, '../package.json'))).version;

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

/**
 * A registry of compiled protocol buffer objects
 * Each object is keyed by it's protocol buffer name (including package) and each value is the constructor.
 * @type {object.<string,Protob.Message>}
 * @example
 *    var registry = require('protob').Protob.registry,
 *        fileDescriptor = new registry['google.protobuf.FileDescriptor']();
 * @expose
 */
Protob.registry = registry;
Protob.v = v;

exports.registry = registry;
exports.Protob = Protob;
exports.ByteBuffer = ByteBuffer;
