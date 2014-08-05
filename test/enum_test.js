require('./test_helper');
var Assert = require('assert'),
    Enum = require('../lib/enum').Enum,
    registry = require('../lib/registry'),
    goog = require('../lib/compiler/google-protos-defn'),
    ed = goog.enumDescriptorProto,
    evd = goog.enumValueDescriptorProto;

describe("ENUM", function(){
  it("is a function", function(){
    Assert.equal(typeof Enum, 'function', 'Enum should be a constructor');
  });

  describe("compiled enum", function(){
    var testValue;

    beforeEach(function(){
      testValue = registry.lookup('test.common.Gender');
    });

    it("keeps track of it's parent namespace", function(){
      Assert.equal("test.common", testValue.parent);
    });

    it("keeps track of it's descriptor", function(){

      Assert.equal(testValue.descriptor instanceof registry.lookup('google.protobuf.EnumDescriptorProto'), true);
    });

    it("keeps track of it's class", function(){
      Assert.equal(testValue.clazz, 'Gender');
    });

    it("sets the full name", function(){
      Assert.equal(testValue.fullName, 'test.common.Gender');
    });

    it("lets me fetch by value", function(){
      var val = testValue.byValue(1);
      Assert.equal("FEMALE", val.name);
    });

    it("lets me fetch by id", function(){
      var val = testValue.byName("FEMALE");
      Assert.equal(1, val.number);
    });

    it("lets me fetch by id or name", function(){
      var valByName = testValue.fetch("FEMALE");
      var valByNumber = testValue.fetch(1);
      var byNumber = testValue.byValue(1);
      var byName = testValue.byName("FEMALE");
      Assert.deepEqual(byNumber, byName);
      Assert.deepEqual(byNumber, valByName);
      Assert.deepEqual(byNumber, valByNumber);
    });

    it("returns true for a valid value", function(){
      Assert.equal(testValue.isValidValue(1), true);
    });

    it("returns false for a valid value", function(){
      Assert.equal(testValue.isValidValue(19), false);
    });

    it("returns true for a valid name", function(){
      Assert.equal(testValue.isValidName("MALE"), true);
    });

    it("returns false for a valid name", function(){
      Assert.equal(testValue.isValidName("THING"), false);
    });

    it("returns a list of valid names", function(){
      var names = testValue.names().sort();
      Assert.deepEqual(["FEMALE", "MALE"], names);
    });

    it("returns a list of valid values", function(){
      var names = testValue.values().sort();
      Assert.deepEqual([1,2], names);
    });

    it("returns the available enum values", function(){
      var vals = [
        { "name": "FEMALE", "number": 1 },
        { "name": "MALE", "number": 2 }
      ];
      Assert.deepEqual(vals, testValue.enumValues());
    });
  });
});
