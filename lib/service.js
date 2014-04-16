/**
 * @module protob/service
 */
var SERVICE = "SERVICE",
    registry = require('./registry');

/**
 * A compled service object defined by the 'service' keyword in a .proto file
 *
 * The service defines methods that have an input and output type and are available on the constructor
 *
 * @example
 *
 *    MyService = Protob.registry['my.service.Service'];
 *    methods = MyService.methods;
 *    methods.name
 *    methods.inputType
 *    methods.outputType
 *    methods.options
 *
 * @constructor
 */
var Service = function() { };

/**
 * Updates the descriptor for this service.
 * This also sets up some information on the constructor that can be used for introspection.
 *
 * @param {object} desc - The Json verion of the google.protobuf.DescriptorProto
 *
 */
Service.updateDescriptor = function(desc) {
  /** @member {string} - The type of service is 'SERVICE' */
  this.type           = SERVICE;

  /** @member {object} - The descriptor is cached for introspection */
  this.descriptor     = desc;

  /** @member {string} - The name of the message */
  this.clazz          = desc.name;

  /** @member {string} - The full protobuf name including package */
  this.fullName       = this.parent + "." + desc.name;
  this.opts           = desc.options;
  this.reset = Service.reset;
  this.finalize = Service.finalize;
  this.reset();
};

/**
 * Reset the service
 * @private
 */
Service.reset = function() { this.methods = {}; }

/**
 * Parses through all the methos and caches their definitions for later
 * @private
 */
Service.finalize = function() {
  this.reset();
  var self = this;
  if ( this.descriptor && Array.isArray(this.descriptor.method) ) {
    this.descriptor.method.forEach(function(method) {
      method.inputType = registry.lookup(method.input_type.replace(/^\./, ''));
      method.outputType = registry.lookup(method.output_type.replace(/^\./, ''));

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
