Thing = function(opts) {
  var attributes = {};
  opts = opts || {};

  this.__defineGetter__( "attributes", function() { return attributes; } );

  var self = this;
  Object.getOwnPropertyNames(opts).forEach(function(name) { self.set.call(self, name, opts[name]); });
}

Thing.prototype.__defineSetter__("foo", function(val) { return this.attributes["foo"] = val; });
Thing.prototype.__defineGetter__("foo", function()    { return this.attributes["foo"]; });
