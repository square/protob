var MESSAGE = "MESSAGE";

var Message = function() {
  this.type = this.constructor.fullName;
};

Message.updateDescriptor = function(desc) {
  if( !Object.isFrozen(desc) ) { Object.freeze(desc); }
  this.type           = MESSAGE;
  this.descriptor     = desc;
  this.clazz          = desc.name;
  this.extensions     = this.extension;
  this.fullName       = this.parent + "." + desc.name;
  this.extensionRange = desc.extension_range;
  this.opts           = desc.options;
  this.reset = Message.reset;
  this.reset();
};

Message.reset = function() {
  var fields = this.fields = {};
  if( Array.isArray(this.descriptor.field) ){
    this.descriptor.field.forEach( function(f) {
      fields[f.name] = f;
    });
  }
};

exports.Message = Message;
