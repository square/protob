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

// If we got to here... we're the fist kids on the scene
var registry = {},
    extensions = {},
    awaitingFinalizers = [];

REGISTRY = cache.registry = new Registry();
module.exports = REGISTRY;

function Registry() {
}

function Scope(name, parentScope) {
  if(parentScope) {
    this.name = [parentScope.name(), name].join('.');
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
Registry.prototype._finalize = function() {
  if(!awaitingFinalizers.length) return;
  var finalizers = awaitingFinalizers;
  awaitingFinalizers = [];

  finalizers.forEach(function(name) {
    registry[name].finalize();
  });
};

/**
 * @api private
 */
Registry.prototype._addObject = function(name, protobuffObject) {
  awaitingFinalizers.push(name);
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
  var extendee = ext.extendee.replace(/^\./, ''),
      key = extendee + ext.number;
  ext.extendee = extendee;
  extensions[key] = ext;
};

/**
 * @api private
 */
Registry.prototype._applyExtensions = function() {
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
};

// Seed the registry with the google descriptors
REGISTRY.register(require('./google_descriptors'));
REGISTRY._finalize();
