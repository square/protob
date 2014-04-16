/**
 * @module protob/enum
 * @exports Enum
 * @exports EnumValue
 */
var ENUM = "ENUM";
var registry = require('./registry');

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
  if( !Object.isFrozen(desc) ) { Object.freeze(desc); }
  /** @member {object} - The protobuf descriptor */
  this.descriptor = desc;
  /** @member {object} - The protocol buffer name for this enum */
  this.clazz = desc.name;
  /** @member {object} - The protocol buffer full name for this Enum */
  this.fullName = this.parent + "." + desc.name;
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
  return this.descriptor.options;
};

/**
 * Resets the Enum after a new descriptor has been created.
 * Re-Creates the EnumValues associated with this enum.
 * Called as part of finalization
 *
 * @protected
 */
Enum.prototype.reset = function() {
  this.v   = {};
  this.valuesByNumber = {};
  var self = this;

  if ( !Array.isArray(this.descriptor.value) ) { return; }

  this.descriptor.value.forEach(function(v) {
    var val = new EnumValue(v.name, v.number, v.options);
    self.v[v.name]     = val;
    self.valuesByNumber[v.number] = val;
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
Enum.prototype.byName  = function(name) { return this.v[name];  };

/**
 * Fetches the EnumValue by name or ID
 * @param {string|integer} nameOrValue - The name or value of the EnumValue to fetch
 * @return {Protob.EnumValue} - The found value or undefined
 */
Enum.prototype.fetch = function(nameOrValue) {
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
