require('./test_helper');
var Protob = require('../index').Protob,
    Message = require('../index').Message,
    Assert = require('assert');
    registry = Protob.registry;

describe('#register', function() {
  it("takes a file descriptor and compiles the proto value");
});

describe('#lookup', function() {
  it('looks up a constructor from the registry', function() {
    var Stuff = registry.lookup('test.fox.simpsons.Stuff'),
        stuff = new Stuff();

    Assert(stuff instanceof Message);
  });

  it('returns undefined when there is nothing here', function() {
    Assert(registry.lookup('not.here') === undefined);
  });
});

describe('#keys',function() {
  it("returns all the keys", function() {
    var keys = registry.keys().sort();
    Assert(Array.isArray(keys));
    Assert(keys.indexOf('test.fox.simpsons.Stuff') > 0);
  });
});

describe('#scope', function() {
  it("creates a scope object", function() {
    var simpsons = registry.scope('test.fox.simpsons');
    Assert(simpsons.keys().indexOf('Stuff') > 0);
  });

  it("lets me get scoped keys", function() {
    var test = registry.scope('test'),
        fox = test.scope('fox'),
        simpsons = fox.scope('simpsons'),
        Stuff = registry.lookup('test.fox.simpsons.Stuff');

    Assert(test.lookup('fox.simpsons.Stuff') === Stuff);
    Assert(fox.lookup('simpsons.Stuff') === Stuff);
    Assert(simpsons.lookup('Stuff') === Stuff);
  });
});

describe('#has', function() {
  it("returns true if the registry has the value", function() {
    Assert(registry.has('test.fox.simpsons.Stuff') === true);
  });

  it("returns false if the registry does not have the value", function() {
    Assert(registry.has('not.here') === false);
  });
});
