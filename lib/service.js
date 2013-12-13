var SERVICE = "SERVICE";

var Service = function() { };
var registry = require('./protob').registry;

Service.updateDescriptor = function(desc) {
  if( !Object.isFrozen(desc) ) { Object.freeze(desc); }
  this.type           = SERVICE;
  this.descriptor     = desc;
  this.clazz          = desc.name;
  this.fullName       = this.parent + "." + desc.name;
  this.opts           = desc.options;
  this.reset = Service.reset;
  this.finalize = Service.finalize;
  this.reset();
};

Service.reset = function() {
  this.finalize();
};

Service.finalize = function() {
  var self = this;
  self.methods = {};
  if ( this.descriptor && Array.isArray(this.descriptor.method) ) {
    this.descriptor.method.forEach(function(method) {
      method.inputType = registry[method.input_type.replace(/^\./, '')];
      method.outputType = registry[method.output_type.replace(/^\./, '')];

      self.methods[method.name] = {
        name: method.name,
        inputType: method.inputType,
        outputType: method.outputType,
        options: method.options
      };
    });
  }
};

exports.Service = Service;
