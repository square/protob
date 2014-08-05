/**
 * Maintains a registry of all known protocol buffer object definitions.
 * This registry is a global registry that spans versions. Protob should be included at the top level
 */
var cache, REGISTRY,
    goog = require('./compiler/google-protos-defn');

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
} else {
  var registry = {},
      extensions = {},
      awaitingFinalizers = [];

  /**
   * The registry of all protocol buffer objects that have been compiled
   * @constructor
   */
  function Registry() { }

  /**
   * Resets the registry and clears all related information. Useful for testing.
   * @private
   */
  Registry.prototype.reset = function() {
    awaitingFinalizers = [];
    registry = {};
    extensions = {};
    require('./compiler').Compiler.reset();
    this.compileGoogleDescriptors();
  }

  /**
   * Provides a scope for accessing information from the registry. 
   * This is a convenience and does not need to be used
   * Scopes can be created before anything is registered, and is only evealuated when a lookup is performed
   * @example
   *    myPackage = registry.scope('my.package')
   *    NestedObject = myPackage.lookup('some.NestedObject');
   *
   * @param {string} name - The name of the package to create the scope for. Can be a sub package if coming from another scope
   * @param {Scope} parentScope - The parent scope to create this scope from
   * @constructor
   */
  function Scope(name, parentScope) {
    if(parentScope) {
      this.name = [parentScope.name, name].join('.');
    } else {
      /** @member {string} - the name of the scope */
      this.name = name;
    }
  }

  /**
   * Create a new scope based off this one. This will be a child scope of the current scope
   * @param {string} name - The name of the sub-scope to create
   * @example
   *     scope = myScope.scope('other.package')
   * @public
   */
  Scope.prototype.scope = function(name) { return new Scope(name, this); };

  /**
   * Lookup an object stored in the registry using the current scope as the starting place
   * @param {string} name - The name of the object within this scope
   * @example
   *  scope = registry.scope('my.scope')
   *  scope.lookup('MyObject') // fetch my.scope.MyObject
   * @public
   */
  Scope.prototype.lookup = function(name) { 
    return REGISTRY.lookup([this.name, name].join('.'));
  };

  /**
   * List all keys in the registry under the current scope
   * @public
   */
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

  /**
   * List all keys in the registry under the current scope, but retain their full scope
   * @public
   */
  Scope.prototype.fullKeys = function() {
    var keys = this.keys(),
        self = this;

    return keys.map(function(k) { return (self.name ? self.name + '.' + k : k); });
  };

  /**
   * Lookup an object in the registry
   * @example
   *     registry.lookup('my.package.MyObject');
   *
   * @return - an object from the registry if present, or undefined
   * @public
   */
  Registry.prototype.lookup = function(name) {
    if(!awaitingFinalizers.length) this._finalize();
    return registry[name];
  };

  /**
   * Shorthand for the lookup method
   * @see Registry#lookup
   * @public
   */
  Registry.prototype.l = function(name) { return this.lookup(name); };

  /**
   * Shorthand for the scope method
   * @see Registry#scope
   * @public
   */
  Registry.prototype.s = function(name) { return this.scope(name); };

  /**
   * Create a scope for the given name
   * @example
   *     scope = registry.scope('some.name')
   *     MyObject = scope.lookup('MyObject');
   * @public
   */
  Registry.prototype.scope = function(name) { return new Scope(name); }

  /**
   * Registers a set of descriptors into the registry.
   * @param {Array<Object>} descriptors - The objects must conform to google.protobuf.FileDescriptorProto using field numbers as keys
   * @public
   */
  Registry.prototype.register = function(descriptors) {
    var compiler = require('./compiler').Compiler;
    compiler.compileDescriptors(descriptors);
  };

  /**
   * List all keys in the registry
   * @public
   */
  Registry.prototype.keys = function() { return Object.keys(registry); }

  /**
   * Check if a given key is present in the registry
   * @param {string} name - The full path of the protobuf object to check
   * @return boolean - Presence of the key
   * @public
   */
  Registry.prototype.has = function(name) { return registry.hasOwnProperty(name); }

  /**
   * Finalizes the objects in the registry if they are awaiting finalization
   * i.e. if they have just been added.
   * @param {boolean} force - Force the finalization. By default, it will only run if there is anything to run.
   * @private
   */
  Registry.prototype._finalize = function(force) {
    if(!force && !awaitingFinalizers.length) return;
    var finalizers = awaitingFinalizers,
        dp = goog.descriptorProto,
        fd = goog.fieldDescriptorProto;

    finalizers.forEach(function(name) { registry[name].finalize(); });
    awaitingFinalizers = [];
  };

  /**
   * Add an object to be finalized. 
   * This happens when each new object is added to the registry,
   * or when they are extended.
   * @param {string} name - The name of the thing to finalize
   * @private
   */
  Registry.prototype._addFinalize = function(name) {
    awaitingFinalizers = awaitingFinalizers || [];
    if(awaitingFinalizers.indexOf(name) < 0) awaitingFinalizers.push(name);
  }

  /**
   * Add a protocol buffer object to the registry by name
   * @param {string} name - The name of the object for the registry
   * @param {Object} protobufObject - The object to store in the registry
   * @private
   */
  Registry.prototype._addObject = function(name, protobufObject) {
    this._addFinalize(name);
    registry[name] = protobufObject;
  };

  /**
   * Adds an extension to be compiled when the objects are finalized.
   * @param {google.protobuf.FieldDescriptorProto} ext - The field extension to apply
   * @private
   */
  Registry.prototype._addExtension = function(ext) {
    var fd = goog.fieldDescriptorProto,
        extendee = (ext[fd.EXTENDEE]).replace(/^\./, ''),
        key = extendee + (ext[fd.NUMBER]);

    ext[fd.EXTENDEE] = extendee;
    extensions[key] = ext;
  };

  // TODO: remove if not needed
  // Registry.prototype.extensions = function() { return extensions; };

  /**
   * Apply any existing extensions to the objects in the reigstry. Also clear out the extensions so they're not doubly applied
   * @private
   */
  Registry.prototype._applyExtensions = function() {
    var self = this,
        fd = goog.fieldDescriptorProto;

    Object.keys(extensions).forEach(function(key){
      var ext = extensions[key],
          Extendee = registry[ext[fd.EXTENDEE]],
          extendee = Extendee.descriptor,
          fields = extendee[fd.FIELD],
          field;

      if(!fields) fields = extendee[fd.EXTENDEE] = extendee[fd.EXTENDEE] || [];

      field = (fields || []).filter(function(f){ return f[fd.NUMBER] === (ext[fd.NUMBER]); })[0];
      if(!field){
        self._addFinalize(Extendee.fullName);
        fields.push(ext);
      }
    });
    extensions = {};
  };

  /**
   * Check to see if the google descriptors have been compiled
   * @protected
   */
  Registry.prototype.googleDescriptorsCompiled = function() {
    this.googleCompiled = true;
  }

  /**
   * Compile the google descriptors. This must be done as the first step and is done automatically
   * @private
   */
  Registry.prototype.compileGoogleDescriptors = function() {
    if(this.googleCompiled) return;
    this.register(require('./google_descriptors'));
    this._finalize();
    this.googleDescriptorsCompiled();
    // These are only the google ones. We need to set their descriptors up
    Object.keys(registry).forEach(function(key) {
      var thing = registry[key];
      thing.fileDescriptor = new (registry['google.protobuf.FileDescriptorProto'])(thing.fileDescriptor);
      if(thing.type.name == 'TYPE_MESSAGE') {
        registry[key].descriptor = new (registry['google.protobuf.DescriptorProto'])(thing.descriptor);
        registry[key].finalize(true);
      } else if(thing.type.name == 'TYPE_ENUM') {
        registry[key].descriptor = new (registry['google.protobuf.EnumDescriptorProto'])(thing.descriptor);
        registry[key].finalize(true);
      }
    });
  }

  REGISTRY = cache.registry = new Registry();
  module.exports = REGISTRY;
  REGISTRY.reset();
}
