/**
 * Compiler for parsed .proto files that have already been converted into .json files
 *
 * @module protob/compiler
 * @exports Compiler
 */
var Path = require('path'),
    Util = require('util'),
    goog = require('./compiler/google-protos-defn'),
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
function Compiler(){
  this.reset = function() { this.descriptorsByFile = {}; }.bind(this);

  this.reset();
}

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
      glob = require('glob'),
      descriptors = [];

  paths.forEach(function(pathh) {
    var pathz = [pathh];
    if (!( /\.json/.test(pathh)) ) {
      pathz = glob.sync(Path.join(pathh, "**/*.json"));
    }

    pathz.forEach(function(path) {
      fileDescriptors = JSON.parse(fs.readFileSync(path));
      if ( fileDescriptors.length === 0 ) { return; }
      descriptors = descriptors.concat(fileDescriptors);
    });

  });

  self.compileDescriptors(descriptors);

  return registry();
}

/**
 * @param {Array<google.protobuf.FileDescriptorProto>} descriptors - A list of file descriptors
 * @private
 */
Compiler.prototype.compileDescriptors = function(descriptors) {
  var self = this,
    reg = registry(),
      fd = goog.fileDescriptorProto,
      FD;

  if(reg.googleCompiled) FD = reg.lookup('google.protobuf.FileDescriptorProto');

  // The file descriptors should be available immediately after the initial google compilation
  // They also need to make sure that all dependencies are compiled first
  descriptors.forEach(function(desc) {
    self.descriptorsByFile[desc[fd.NAME]] = desc;
  });

  descriptors.forEach(function(desc) {
    // These descriptors are file descriptors
    self.compileDescriptor(self.descriptorsByFile[desc[fd.NAME]]);
  });
  return registry();
};

/**
 * Compiles a generic descriptor, this could be of type message, enum, or service
 * @param {object} descriptor - The object that is a google.protobuf.FileDescriptor
 * @private
 */
Compiler.prototype.compileDescriptor = function(descriptor) {
  if(descriptor.__protobCompiled__ === true) return;

  // We need to bootstrap the things until we actually get the file proto descriptor
  var FD = goog.fileDescriptorProto,
      reg = registry(),
      FDP = reg.lookup('google.protobuf.FileDescriptorProto');

  if(FDP && !(descriptor instanceof FDP)) {
    descriptor = new FDP(descriptor);
    this.descriptorsByFile[descriptor[FD.NAME]] = descriptor;
  }

  var self = this,
      name = descriptor[FD.NAME],
      pkg  = descriptor[FD.PACKAGE],
      dependency = descriptor[FD.DEPENDENCY],
      message_type = descriptor[FD.MESSAGE_TYPE],
      enum_type = descriptor[FD.ENUM_TYPE],
      service = descriptor[FD.SERVICE],
      extension = descriptor[FD.EXTENSION],
      options = descriptor[FD.OPTIONS],
      source_code_info = descriptor[FD.SOURCE_CODE_INFO];

  this.descriptorsByFile[name] = this.descriptorsByFile[name] || descriptor;

  if(dependency) {
    dependency.forEach(function(path) {
      var depDesc = self.descriptorsByFile[path];

      if(!depDesc) throw "Dependency not found: " + path;

      self.compileDescriptor(depDesc);
    });
  }

  if ( Array.isArray(enum_type) ) {
    enum_type.forEach( function(enumDesc) {
      self.compileEnum(enumDesc, pkg, descriptor);
    });
  }

  if ( Array.isArray(message_type) ) {
    message_type.forEach( function(msgDesc) {
      self.compileMessage(msgDesc, pkg, descriptor);
    });
  }

  if ( Array.isArray(service) ) {
    service.forEach( function(serviceDesc) {
      self.compileService(serviceDesc, pkg, descriptor);
    });
  }

  if( Array.isArray(extension) ) {
    extension.forEach(function(ext){
      ext.pkg = pkg;
      registry()._addExtension(ext);
    });
  }

  registry()._applyExtensions();
  registry()._finalize(true);
  descriptor.__protobCompiled__ = true;
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
  var enumDescriptor = goog.enumDescriptorProto,
      name = enumDesc[enumDescriptor.NAME],
      fullName = pkg + "." + name,
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
  var descriptorProto = goog.descriptorProto,
      protobufs = registry().scope('google.protobuf'),
      DescriptorProto = protobufs.lookup('DescriptorProto'),
      nmessage;

  if(registry().googleCompiled && DescriptorProto && !(messageDesc instanceof DescriptorProto)) {
    messageDesc = new DescriptorProto(messageDesc);
  }

  var fullName = pkg + "." + (messageDesc[descriptorProto.NAME]),
      Message = require('./message').Message,
      self    = this,
      messageEnumType = messageDesc[descriptorProto.ENUM_TYPE];

  if( Array.isArray(messageEnumType) ) {
    messageEnumType.forEach(function(enumDesc) {
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

  var messageExtensions = messageDesc[descriptorProto.EXTENSION];

  if( Array.isArray(messageExtensions) ){
    messageExtensions.forEach(function(ext){
      ext.pkg = pkg;
      registry()._addExtension(ext);
    });
  }

  var nestedType = messageDesc[descriptorProto.NESTED_TYPE];
  if( Array.isArray(nestedType) ) {
    nestedType.forEach(function(msgDesc) {
      self.compileMessage(msgDesc, fullName, descriptor);
    });
  }

  registry()._fetch(fullName).updateDescriptor(messageDesc);
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
  var serviceDescriptor = goog.serviceDescriptorProto,
      name = serviceDesc[serviceDescriptor.NAME],
      method = serviceDesc[serviceDescriptor.METHOD],
      options = serviceDesc[serviceDescriptor.OPTIONS],
      fullName = pkg + "." + name,
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

  registry()._fetch(fullName).fileDescriptor = descriptor;
  registry()._fetch(fullName).updateDescriptor(serviceDesc);
};
