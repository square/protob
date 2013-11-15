var ENUM = "ENUM";

var Enum = function(parentNs){
  this.type = ENUM;
  this.parent = parentNs;
  this.v = {};
  this.valuesByNumber = {};
};

var EnumValue = function(name, number, options) {
  this.name = name;
  this.number = number;
  if( options ) {
    this.options = options;
  }
};

Enum.prototype.updateDescriptor = function(desc) {
  if( !Object.isFrozen(desc) ) { Object.freeze(desc); }
  this.descriptor = desc;
  this.name = desc.name;
  this.fullName = this.parent + "." + desc.name;
  this.reset();
};

Enum.prototype.options = function() {
  return this.descriptor.options;
};

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

Enum.prototype.byValue = function(val)  { return this.valuesByNumber[val]; };
Enum.prototype.byName  = function(name) { return this.v[name];  };
Enum.prototype.fetch = function(nameOrValue) {
  return this.byName(nameOrValue) || this.byValue(nameOrValue);
};

Enum.prototype.isValidValue = function(val) { return !!this.byValue(val); };
Enum.prototype.isValidName  = function(val) { return !!this.byName(val);  };

Enum.prototype.names = function() {
  return Object.getOwnPropertyNames(this.v);
};

Enum.prototype.values = function() {
  return Object.getOwnPropertyNames(this.valuesByNumber).map(function(i) { parseInt(i, 10); });
};

Enum.prototype.enumValues = function(){
  var self = this;
  return Object.getOwnPropertyNames(this.v).map(function(name) {
    return self.v[name];
  });
};

exports.Enum = Enum;
exports.EnumValue = EnumValue;
