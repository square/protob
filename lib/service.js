/**
 * @module protob/service
 */
var SERVICE = "SERVICE",
    goog = require('./compiler/google-protos-defn'),
    registry = require('./registry');

/**
 * A compled service object defined by the 'service' keyword in a .proto file
 *
 * The service defines methods that have an input and output type and are available on the constructor
 *
 * The service has a descriptor that is of type google.protobuf.ServiceDescriptorProto
 *
 * @example
 *
 *    MyService = Protob.registry.lookup('my.service.Service');
 *    methods = MyService.methods; // An object describing the methods available for the service keyed by method name
 *    method = methods.MyMethod
 *    method.inputType  // The constructor for the input type of the rpc method
 *    method.outputType // the constructor for the output type of the rpc method
 *    method.getf('options').asJSON() // Show the options as a POJO
 *
 * @constructor
 */
var Service = function() {};

/**
 * Updates the descriptor for this service.
 * This also sets up some information on the constructor that can be used for introspection.
 *
 * @param {object} desc - The Json verion of the google.protobuf.DescriptorProto
 * @private
 */
Service.updateDescriptor = function(desc) {
  var sd = goog.serviceDescriptorProto;
  /** @member {string} - The type of service is 'SERVICE' */
  this.type = SERVICE;

  /** @member {object} - The descriptor is cached for introspection */
  this.descriptor = desc;

  /** @member {string} - The name of the message */
  this.clazz = desc[sd.NAME];

  /** @member {string} - The full protobuf name including package */
  this.fullName = this.parent + "." + desc[sd.NAME];
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
  var self = this,
      sd = goog.serviceDescriptorProto,
      md = goog.methodDescriptorProto,
      MethodOptions = registry.lookup('google.protobuf.MethodOptions');

  if ( this.descriptor && Array.isArray(this.descriptor[sd.METHOD]) ) {
    this.descriptor[sd.METHOD].forEach(function(method) {
      self.methods[method[md.NAME]] = method;
      method.name = method[md.NAME];
      method.inputType = registry.lookup(method[md.INPUT_TYPE].replace(/^\./, ''));
      method.outputType = registry.lookup(method[md.OUTPUT_TYPE].replace(/^\./, ''));
    });
  }
};

exports.Service = Service;
