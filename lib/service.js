var SERVICE = "SERVICE";

var Service = function() {
  this.type = this.constructor.fullName;
};

Service.updateDescriptor = function(desc) {
  if( !Object.isFrozen(desc) ) { Object.freeze(desc); }
  this.type           = SERVICE;
  this.descriptor     = desc;
  this.clazz          = desc.name;
  this.extensions     = this.extension;
  this.fullName       = this.parent + "." + desc.name;
  this.extensionRange = desc.extension_range;
  this.opts           = desc.options;
  this.reset = Service.reset;
  this.reset();
};

Service.reset = function() {
  var fields = this.fields = {};
  if( Array.isArray(this.descriptor.field) ){
    this.descriptor.field.forEach( function(f) {
      fields[f.name] = f;
    });
  }
};

exports.Service = Service;
