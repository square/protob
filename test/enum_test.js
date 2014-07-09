var Assert = require('assert');
var Enum = require('../lib/enum').Enum;

describe("ENUM", function(){
  it("is a function", function(){
    Assert.equal(typeof Enum, 'function', 'Enum should be a constructor');
  });

  describe("compiled enum", function(){
    var testValue;
    var enumType;

    beforeEach(function(){
      enumType = {
        "name": "Type",
        "value": [
          { "name": "TYPE_DOUBLE", "number": 1 },
          { "name": "TYPE_FLOAT", "number": 2 },
          { "name": "TYPE_INT64", "number": 3 }
        ],
        "options": { "foo": "bar" }
      };

      testValue = new Enum("my.great.package");
      testValue.updateDescriptor(enumType);
    });

    it("keeps track of it's parent namespace", function(){
      Assert.equal("my.great.package", testValue.parent);
    });

    it("keeps track of it's descriptor", function(){
      Assert.equal(testValue.descriptor, enumType);
    });

    it("keeps track of it's class", function(){
      Assert.equal(testValue.clazz, enumType.name);
    });

    it("sets the full name", function(){
      Assert.equal(testValue.fullName, testValue.parent + "." + enumType.name);
    });

    it("fetches options", function(){
      Assert.deepEqual(testValue.options(), {"foo": "bar"});
    });

    it("lets me fetch by value", function(){
      var val = testValue.byValue(1);
      Assert.equal("TYPE_DOUBLE", val.name);
    });

    it("lets me fetch by id", function(){
      var val = testValue.byName("TYPE_DOUBLE");
      Assert.equal(1, val.number);
    });

    it('lets me fetch with a lower case enum' ,function() {
      var val = testValue.byName('type_double');
      Assert.equal(1,val.number);
    });

    it('returns undefined when there is no enum', function() {
      Assert.equal(testValue.byName(), undefined);
    });

    it("lets me fetch by id or name", function(){
      var valByName = testValue.fetch("TYPE_DOUBLE");
      var valByNumber = testValue.fetch(1);
      var byNumber = testValue.byValue(1);
      var byName = testValue.byName("TYPE_DOUBLE");
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
      Assert.equal(testValue.isValidName("TYPE_DOUBLE"), true);
    });

    it("returns false for a valid name", function(){
      Assert.equal(testValue.isValidName("THING"), false);
    });

    it("returns a list of valid names", function(){
      var names = testValue.names().sort();
      Assert.deepEqual(["TYPE_DOUBLE", "TYPE_FLOAT", "TYPE_INT64"], names);
    });

    it("returns a list of valid values", function(){
      var names = testValue.values().sort();
      Assert.deepEqual([1,2,3], names);
    });

    it("returns the available enum values", function(){
      var vals = [
        { "name": "TYPE_DOUBLE", "number": 1 },
        { "name": "TYPE_FLOAT", "number": 2 },
        { "name": "TYPE_INT64", "number": 3 }
      ];
      Assert.deepEqual(vals, testValue.enumValues());
    });
  });
});
