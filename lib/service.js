/**
 * @module protob/service
 */
var SERVICE = "SERVICE",
    goog = require('./compiler/google-protos-defn'),
    Message = require('./message').Message,
    Promise = require('bluebird').Promise,
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
var Service = function(context) {
  this.context = context || {}; // context for the eexecution of the method.
};

Service.isService = function() { return true; };
Service.isMessage = function() { return false; };
Service.isEnum = function() { return false; };

Service.prototype.isService = function() { return true; };
Service.prototype.isMessage = function() { return false; };
Service.prototype.isEnum = function() { return false; };

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
 * Create a service handler for a method.
 * @param {string} methodName - The name of the method as it appears in the proto rpc definition.
 * @param {string} [methodPrefix] - A method prefix for the handler. By default this is nil.
 * @param {function} fn - The handler. It will recieve the request object as the first instance.
 */
Service.handler = function(methodName, methodPrefix, fn) {
  if(!fn) {
    fn = methodPrefix;
    methodPrefix = undefined;
  }

  var method = this.methods[methodName],
      fullMethodName = [methodPrefix, methodName].join(''),
      handlerFn;
  if(!method) {
    throw new Error('Unknown method ' + methodName + ' for ' + this.fullName);
  }

  /**
   * Set up the dispatching handler function.
   * @param {object} req - The request object. This will be coorced into the correct type if it is not already
   * @param {object} [opts] - An options object
   * @param {boolean} [opts.future] - If you want a future back. When true, an instance of the response is returned, and filled out once available. When false, a promise is returned.
   */
  handlerFn = function (req, opts) {
    req = req || {};

    var self = this, // Service instance
        promise = Promise.resolve(),
        asFuture = opts && opts.future,
        returnValue;

    if(asFuture) {
      returnValue = new method.outputType();
      returnValue.isFulfilled = false;
    }

    promise = promise.then(function() {
      req = ensureType(req, method.inputType);
      return fn.call(self, req) || {};
    }).then(function(res) {
      if(asFuture) {
        returnValue.isFulfilled = true;
        returnValue.updateValues(res);
      } else {
        returnValue = ensureType(res, method.outputType);
      }
      return returnValue;
    });

    if(asFuture) {
      returnValue.asPromised = promise;
      return returnValue;
    } else {
      return promise;
    }
  };

  this.prototype[fullMethodName] = handlerFn;
}

function ensureType(msg, type) {
  if(msg instanceof Message && !(msg instanceof type)) {
    var err = new Error('Incompatible input type for ' + type.fullName + '. Got ' + msg.constructor.fullName);

    err.status = err.statusCode = 400;
    throw err;
  }

  if(!(msg instanceof type)) msg = new type(msg);
  return msg;
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
  this.handler = Service.handler;
};

exports.Service = Service;
