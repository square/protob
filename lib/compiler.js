var fs = require('fs');
var Path = require('path');
var Util = require('util');
var Enum = require('./enum').Enum;
var Message = require('./message').Message;

var Compiler = function(){
  // Keep a registry of all messages by fully qualified names
  this.registry = {};

  this.compile = function(){
    var self = this;
    var paths =  Array.prototype.slice.call(arguments) || [];

    paths.push(Path.join(__dirname, "../protos/descriptors.json"));

    paths.forEach(function(path) {
      descriptors = JSON.parse(fs.readFileSync(path));
      if ( descriptors.length === 0 ) { return; }
      descriptors.forEach(function(desc) {
        self.compileDescriptor(desc);
      });
    });

    return this.registry;
  };

  this.compileDescriptor = function(descriptor) {
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

    if ( Array.isArray(descriptor.service) ) {
      descriptor.service.forEach( function(serviceDesc) {
        self.compileService(msg, pkg, descriptor);
      });
    }

    // TODO: handle extensions
    // TODO: handle options
  };

  this.compileEnum = function(enumDesc, pkg, descriptor) {
    var fullName = pkg + "." + enumDesc.name;
    console.info("Compiling Enum: " + fullName);
    var registry = this.registry;

    if ( !registry[fullName] ) {
      nenum = function() {
        Enum.prototype.constructor.call(this, Array.prototype.slice.call(arguments));
      };
      Util.inherits(nenum, Enum);
      registry[fullName] = new nenum(pkg);
    }

    registry[fullName].updateDescriptor(enumDesc);
  };

  this.compileMessage = function(messageDesc, pkg, descriptor) {
    var fullName = pkg + "." + messageDesc.name;
    console.info("Compiling Message: " + fullName);
    var registry = this.registry;
    var self     = this;

    if( Array.isArray(messageDesc.enum_type) ) {
      messageDesc.enum_type.forEach(function(enumDesc) {
        self.compileEnum(enumDesc, fullName, descriptor);
      });
    }

    if ( !registry[fullName] ) {
      nmessage = function() {
        Message.prototype.constructor.call(this, Array.prototype.slice.call(arguments));
      };
      Util.inherits(nmessage, Message);
      nmessage.parent = pkg;
      nmessage.updateDescriptor = Message.updateDescriptor;
      registry[fullName] = nmessage;
    }

    registry[fullName].updateDescriptor(messageDesc);

    if( Array.isArray(messageDesc.nested_type) ) {
      messageDesc.nested_type.forEach(function(msgDesc) {
        self.compileMessage(msgDesc, fullName, descriptor);
      });
    }
  };

  this.compileService = function(serviceDesc, pkg, descriptor) {
    var fullName = pkg + "." + serviceDesc.name;
    console.info("Compiling Service: " + fullName);
    var registry = this.registry;
    var self     = this;

    if ( !registry[fullName] ) {
      nservice = function() {
        Service.prototype.constructor.call(this, Array.prototype.slice.call(arguments));
      };
      Util.inherits(nservice, Service);
      nservice.parent = pkg;
      nservice.updateDescriptor = Service.updateDescriptor;
      registry[fullName] = nservice;
    }

    registry[fullName].updateDescriptor(serviceDesc);
  };
};

exports.Compiler = new Compiler();
