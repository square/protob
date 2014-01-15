/**
 * Compiler for parsed .proto files that have already been converted into .json files
 *
 * @module protob/compiler
 * @exports Compiler
 */
var fs = require('fs'),
    Path = require('path'),
    glob = require('glob'),
    Util = require('util'),
    Enum = require('./enum').Enum,
    EnumValue = require('./enum').EnumValue,
    Message = require('./message').Message,
    Service = require('./service').Service,
    registry = require('./protob').registry,
    objAccess = require('./protob').Protob.v,
    extensions = require('./protob').Protob.extensions,
    pUtil = require('./util').Util,
    baseCompiled = false;


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
  var self = this;
  var paths =  Array.prototype.slice.call(arguments) || [];

  if ( !baseCompiled ) {
    baseCompiled = true;
    this.compile(Path.join(__dirname, "../protos/descriptors.json"));
  }

  paths.forEach(function(pathh) {
    var pathz = [pathh];
    if (!( /\.json/.test(pathh)) ) {
      pathz = glob.sync(Path.join(pathh, "**/*.json"));
    }

    pathz.forEach(function(path) {
      descriptors = JSON.parse(fs.readFileSync(path));
      if ( descriptors.length === 0 ) { return; }
      descriptors.forEach(function(desc) {
        self.compileDescriptor(desc);
      });
    });
  });

  this.applyExtensions();

  Object.getOwnPropertyNames(registry).forEach( function(item){
    registry[item].finalize();
  });

  this.updateObjectAccess();

  return registry;
}

/**
 * Updates the object access cache for Protob with all the messages found in the registry.
 *
 *
 * @example
 *    compiler.updateObjectAccess();
 *
 *    Protob.registry['foo.bar.Baz'] === Protob.v.foo.bar.Baz;
 *
 * @private
 */
Compiler.prototype.updateObjectAccess = function(){
  Object.getOwnPropertyNames(registry).forEach( function(key) {
    key.split(".").reduce(function(prev, current, idx, arry) {
      if( (idx == arry.length - 1) ) {
        prev[current] = registry[key];
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
      self.addExtension(ext);
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
 * Add an extension found in a message, service or file to the extensions cache
 * Before finalization, all extensions will be added to the relevant items.
 * @param {object} ext - The extension definiton to attach to the extendees descriptor
 * @private
 */
Compiler.prototype.addExtension = function(ext){
  var extendee = ext.extendee.replace(/^\./, ''),
      key = extendee + ext.number;
  ext.extendee = extendee;
  extensions[key] = ext;
};

/**
 * Applies the extensions found in the extensions cache to the relevant descriptors prior to finalization
 * @private
 */
Compiler.prototype.applyExtensions = function(){
  Object.keys(extensions).forEach(function(key){
    var ext = extensions[key],
        extendee = registry[ext.extendee].descriptor,
        field;

    extendee.field = extendee.field || [];
    field = extendee.field.filter(function(f){ return f.number === ext.number; })[0];
    if(!field){
      extendee.field.push(ext);
    }
  });
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
  var fullName = pkg + "." + enumDesc.name;

  if ( !registry[fullName] ) {
    nenum = function() {
      Enum.prototype.constructor.call(this, Array.prototype.slice.call(arguments));
    };
    Util.inherits(nenum, Enum);
    registry[fullName] = new nenum(pkg);
  }

  registry[fullName].updateDescriptor(enumDesc);
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
  var fullName = pkg + "." + messageDesc.name;
  var self     = this;

  if( Array.isArray(messageDesc.enum_type) ) {
    messageDesc.enum_type.forEach(function(enumDesc) {
      self.compileEnum(enumDesc, fullName, descriptor);
    });
  }

  if ( !registry[fullName] ) {
    nmessage = function() { Message.apply(this, Array.prototype.slice.call(arguments)); };
    Util.inherits(nmessage, Message);
    nmessage.parent = pkg;
    nmessage.updateDescriptor = Message.updateDescriptor;
    nmessage.afterInitialize = [];
    registry[fullName] = nmessage;
  }

  registry[fullName].updateDescriptor(messageDesc);

  if( Array.isArray(messageDesc.extension) ){
    messageDesc.extension.forEach(function(ext){
      ext.pkg = pkg;
      self.addExtension(ext);
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
  var fullName = pkg + "." + serviceDesc.name;
  var self     = this;

  if ( !registry[fullName] ) {
    nservice = function() {
      Service.apply(this, Array.prototype.slice.call(arguments));
    };
    Util.inherits(nservice, Service);
    nservice.parent = pkg;
    nservice.updateDescriptor = Service.updateDescriptor;
    registry[fullName] = nservice;
  }

  if( Array.isArray(serviceDesc.extension) ){
    serviceDesc.extension.forEach(function(ext){
      ext.pkg = pkg;
      self.addExtension(ext);
    });
  }

  registry[fullName].updateDescriptor(serviceDesc);
};

exports.Compiler = new Compiler();
