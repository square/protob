var cache,
    REGISTRY;

if(typeof window == 'undefined') {
  global.protob = global.protob || {};
  cache = global.protob;
} else {
  window.protob = window.protob || {};
  cache = window.protob;
}

if(cache.registry) {
  module.exports = cache.registry;
  return;
}

var registry = {},
    extensions = {},
    awaitingFinalizers = [];

REGISTRY = cache.registry = new Registry();
module.exports = REGISTRY;

function Registry() { }

Registry.prototype.reset = function() {
  awaitingFinalizers = [];
  registry = {};
  extensions = {};
  require('./compiler').Compiler.reset();
}

function Scope(name, parentScope) {
  if(parentScope) {
    this.name = [parentScope.name, name].join('.');
  } else {
    this.name = name;
  }
}

Scope.prototype.scope = function(name) { return new Scope(name, this); };
Scope.prototype.lookup = function(name) { 
  return REGISTRY.lookup([this.name, name].join('.'));
};

Scope.prototype.keys = function() {
  var keys = [],
      self = this,
      name = this.name,
      ln = this.name.length;

  Object.keys(registry).forEach(function(key) {
    if(key.substr(0, ln) == name) keys.push(key.substr(ln, key.length).replace(/^\./, ''));
  });
  return keys;
};

Scope.prototype.fullKeys = function() {
  var keys = this.keys(),
      self = this;

  return keys.map(function(k) { 
    return (self.name ? self.name + '.' + k : k);
  });
};

/**
 * @api public
 */
Registry.prototype.lookup = function(name) {
  if(!awaitingFinalizers.length) this._finalize();
  return registry[name];
};

Registry.prototype.l = function(name) { return this.lookup(name); };
Registry.prototype.s = function(name) { return this.scope(name); };

Registry.prototype.scope = function(name) {
  return new Scope(name);
}

/**
 * @api public
 */
Registry.prototype.register = function(descriptors) {
  var compiler = require('./compiler').Compiler;
  compiler.compileDescriptors(descriptors);
};

/**
 * @api public
 */
Registry.prototype.keys = function() {
  return Object.keys(registry);
}

/**
 * @api public
 */
Registry.prototype.has = function(name) {
  return registry.hasOwnProperty(name);
}

/**
 * @api private
 */
Registry.prototype._finalize = function(force) {
  if(!force && !awaitingFinalizers.length) return;
  var finalizers = awaitingFinalizers;

  finalizers.forEach(function(name) { registry[name].finalize(); });

  awaitingFinalizers = [];

  // Set the message field options
  Object.keys(registry).forEach(function(name) {
    var desc = registry[name].descriptor,
        FieldOptions = registry['google.protobuf.FieldOptions'];

    if(desc.field) {
      desc.field.forEach(function(f) {
        if(!f.options || f.options instanceof FieldOptions) return;
        f.options = (new FieldOptions(f.options)).protoValues({fieldAccess: 'number'});
      });
    }
  });
};

Registry.prototype._addFinalize = function(name) {
  awaitingFinalizers = awaitingFinalizers || [];
  if(awaitingFinalizers.indexOf(name) < 0) awaitingFinalizers.push(name);
}

/**
 * @api private
 */
Registry.prototype._addObject = function(name, protobuffObject) {
  this._addFinalize(name);
  registry[name] = protobuffObject;
};

/**
 * @api private
 */
Registry.prototype._fetch = function(name) {
  return registry[name];
}


/**
 * @api private
 */
Registry.prototype._addExtension = function(ext) {
  var extendee = (ext[2] || ext.extendee).replace(/^\./, ''),
      key = extendee + (ext[3] || ext.number);

  ext.extendee = extendee;
  extensions[key] = ext;
};

/**
 * @api private
 */
Registry.prototype._applyExtensions = function() {
  var self = this;
  Object.keys(extensions).forEach(function(key){
    var ext = extensions[key],
        Extendee = registry[ext.extendee],
        extendee = Extendee.descriptor,
        fields = extendee[2] || extendee.field,
        field;

    if(!fields) fields = extendee[2] = [];

    field = (fields || []).filter(function(f){ return f.number === (ext[3] || ext.number); })[0];
    if(!field){
      self._addFinalize(Extendee.fullName);
      fields.push(ext);
    }
  });
};

// Seed the registry with the google descriptors
REGISTRY.register(require('./google_descriptors'));
REGISTRY._finalize();
