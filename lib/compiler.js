/**
 * Compiler for parsed .proto files that have already been converted into .json files
 *
 * @module protob/compiler
 * @exports Compiler
 */
var Path = require('path'),
    Util = require('util'),
    pUtil = require('./util').Util,
    compiler = new Compiler(),
    _registry;

function registry() {
  _registry = _registry || require('./registry');
  return _registry;
}

module.exports.Compiler = compiler;
/**
 * A new instance of a compiler. Compilers will update the Protob registry and define Javascript objects for each message, enum, service found
 * @constructor
 */
function Compiler(){}

/**
 * Compiles all the .json files found in any of the paths (found recursively) provided
 *
 * This will create Javascript objects in the registry for each message, enum, service found in the descriptors for those files.
 * Extensions will then be applied and finally the Object cache (Protob.v) will be updated to include any new objects.
 *
 * compile can be called many times and is additive to the registry. Each time you call it though, every message type will be finalized anew.
 *
 * @argument {string} - Repeated arguments for each directory to look under for json files to compile
 * @example
 *    compiler = new Compiler();
 *    compiler.compile("./foo", "./protos")
 *
 * @public
 */
Compiler.prototype.compile = function(){
  var self = this,
      paths =  Array.prototype.slice.call(arguments) || [],
      fs = require('fs'),
      glob = require('glob');

  paths.forEach(function(pathh) {
    var pathz = [pathh];
    if (!( /\.json/.test(pathh)) ) {
      pathz = glob.sync(Path.join(pathh, "**/*.json"));
    }

    pathz.forEach(function(path) {
      descriptors = JSON.parse(fs.readFileSync(path));
      if ( descriptors.length === 0 ) { return; }
      self.compileDescriptorSet(descriptors);
    });
  });

  registry()._applyExtensions();
  registry()._finalize();
  this.updateObjectAccess();
  return registry();
}

Compiler.prototype.compileDescriptors = function(descriptors) {
  this.compileDescriptorSet(descriptors);

  registry()._applyExtensions();
  registry()._finalize();
  this.updateObjectAccess();
  return registry();
};

Compiler.prototype.compileDescriptorSet = function(descriptors) {
  var self = this;
  descriptors.forEach(function(desc) {
    // These descriptors are file descriptors
    self.compileDescriptor(desc);
  });
};

/**
 * Updates the object access cache for Protob with all the messages found in the registry.
 *
 *
 * @example
 *    compiler.updateObjectAccess();
 *
 *    Protob.registry.lookup('foo.bar.Baz') === Protob.v.foo.bar.Baz;
 *
 * @private
 */
Compiler.prototype.updateObjectAccess = function(){
  var objAccess = require('./protob').Protob.v;
  registry().keys().forEach(function(key) {
    key.split(".").reduce(function(prev, current, idx, arry) {
      if( (idx == arry.length - 1) ) {
        prev[current] = registry().lookup(key);
      } else {
        prev[current] = prev[current] || {};
      }
      return prev[current];
    }, objAccess);
  });
}

/**
 * Compiles a generic descriptor, this could be of type message, enum, or service
 * @param {object} descriptor - The object that is a google.protobuf.FileDescriptor
 * @private
 */
Compiler.prototype.compileDescriptor = function(descriptor) {
  var pkg = descriptor['package'],
      self = this;

  if ( Array.isArray(descriptor.enum_type) ) {
    descriptor.enum_type.forEach( function(enumDesc) {
      self.compileEnum(enumDesc, pkg, descriptor);
    });
  }

  if ( Array.isArray(descriptor.message_type) ) {
    descriptor.message_type.forEach( function(msgDesc) {
      self.compileMessage(msgDesc, pkg, descriptor);
    });
  }

  if( Array.isArray(descriptor.extension) ) {
    descriptor.extension.forEach(function(ext){
      ext.pkg = pkg;
      registry()._addExtension(ext);
    });
  }

  if ( Array.isArray(descriptor.service) ) {
    descriptor.service.forEach( function(serviceDesc) {
      self.compileService(serviceDesc, pkg, descriptor);
    });
  }

  // TODO: handle options
}

/**
 * Compiles an Enum, and all associated EnumValues and creates a new object in the registry,
 * or updates an existing one by calling updateDescriptor on the enum.
 * @param {object} enumDesc - The enum descriptor
 * @param {string} pkg - The protobuf package name
 * @param {object} descriptor - The file descriptor that this enum came from
 * @private
 */
Compiler.prototype.compileEnum = function(enumDesc, pkg, descriptor) {
  var fullName = pkg + "." + enumDesc.name,
      Enum = require('./enum').Enum,
      obj;

  if ( !registry().has(fullName) ) {
    nenum = function() {
      Enum.prototype.constructor.call(this, Array.prototype.slice.call(arguments));
    };
    Util.inherits(nenum, Enum);
    obj = new nenum(pkg);
    obj.fileDescriptor = descriptor;
    registry()._addObject(fullName, obj);
  }
  registry()._fetch(fullName).updateDescriptor(enumDesc);
};

/**
 * Compiles a Message and adds it to the registry
 * or updates an existing one by calling updateDescriptor
 * @param {object} messageDesc - The message descriptor
 * @param {string} pkg - The protobuf package name
 * @param {object} descriptor - The file descriptor that this message came from
 * @private
 */
Compiler.prototype.compileMessage = function(messageDesc, pkg, descriptor) {
  var fullName = pkg + "." + messageDesc.name,
      Message = require('./message').Message,
      self    = this;

  if( Array.isArray(messageDesc.enum_type) ) {
    messageDesc.enum_type.forEach(function(enumDesc) {
      self.compileEnum(enumDesc, fullName, descriptor);
    });
  }

  if ( !registry().has(fullName) ) {
    nmessage = function() { Message.apply(this, Array.prototype.slice.call(arguments)); };
    Util.inherits(nmessage, Message);
    nmessage.parent = pkg;
    nmessage.updateDescriptor = Message.updateDescriptor;
    nmessage.afterInitialize = [];
    registry()._addObject(fullName, nmessage);
  }

  registry()._fetch(fullName).fileDescriptor = descriptor;
  registry()._fetch(fullName).updateDescriptor(messageDesc);

  if( Array.isArray(messageDesc.extension) ){
    messageDesc.extension.forEach(function(ext){
      ext.pkg = pkg;
      registry()._addExtension(ext);
    });
  }

  if( Array.isArray(messageDesc.nested_type) ) {
    messageDesc.nested_type.forEach(function(msgDesc) {
      self.compileMessage(msgDesc, fullName, descriptor);
    });
  }
}

/**
 * Compiles a Service and adds it to the registry
 * or updates an existing one by calling updateDescriptor
 * @param {object} serviceDesc - The service descriptor
 * @param {string} pkg - The protobuf package name
 * @param {object} descriptor - The file descriptor that this service
 * @private
 */
Compiler.prototype.compileService = function(serviceDesc, pkg, descriptor) {
  var fullName = pkg + "." + serviceDesc.name,
      Service = require('./service').Service,
      self     = this;

  if ( !registry().has(fullName) ) {
    nservice = function() {
      Service.apply(this, Array.prototype.slice.call(arguments));
    };
    Util.inherits(nservice, Service);
    nservice.parent = pkg;
    nservice.updateDescriptor = Service.updateDescriptor;
    registry()._addObject(fullName, nservice);
  }

  if( Array.isArray(serviceDesc.extension) ){
    serviceDesc.extension.forEach(function(ext){
      ext.pkg = pkg;
      registry()._addExtension(ext);
    });
  }

  registry()._fetch(fullName).fileDescriptor = descriptor;
  registry()._fetch(fullName).updateDescriptor(serviceDesc);
};
