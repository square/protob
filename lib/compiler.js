var fs = require('fs');
var Path = require('path');
var glob = require('glob');
var Util = require('util');
var Enum = require('./enum').Enum;
var EnumValue = require('./enum').EnumValue;
var Message = require('./message').Message;
var Service = require('./service').Service;
var registry = require('./protob').registry;

var baseCompiled = false;

EnumValue.prototype.mashalledValue = function(){ return this.number; };

var Compiler = function(){
  // Keep a registry of all messages by fully qualified names
  this.compile = function(){
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

    Object.getOwnPropertyNames(registry).forEach( function(item){
      registry[item].finalize();
    });

    return registry;
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
    var self     = this;

    if( Array.isArray(messageDesc.enum_type) ) {
      messageDesc.enum_type.forEach(function(enumDesc) {
        self.compileEnum(enumDesc, fullName, descriptor);
      });
    }

    if ( !registry[fullName] ) {
      nmessage = function() {
        Message.apply(this, Array.prototype.slice.call(arguments));
      };
      nmessage.afterInitialize = [];
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
