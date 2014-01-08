var Path = require('path');
require(Path.resolve(Path.join(__dirname, "..", "test_helper")));
var index = require(Path.join(__dirname, "../../index"));
var Protob = index.Protob;
var Assert = require('assert');
var r = Protob.registry;

describe("protofile", function(){
  it("compiles the protos to the registry", function(){
    var stuff = new r['test.fox.simpsons.Stuff']();
    Assert(stuff instanceof index.Message);
  });

  it("uses the provided arguments to set values", function(){
    var homer = new r['test.fox.simpsons.Character']({name: 'Homer'});
    Assert.equal(homer.name, 'Homer', 'Expected setter on the constructor');
  });

  describe("protoValues", function(){
    var Stuff;
    beforeEach(function(){ Stuff = r['test.fox.simpsons.Stuff']; });

    it("ignores non field values", function(){
      var stuff = new Stuff({ not_a_value: "foo" });
      Assert.equal(stuff.protoValues().not_a_value, undefined);
      Assert.equal(stuff.not_a_value, "foo");
    });

    it("converts strings", function(){
      var stuff = new Stuff({ string_value: "foo" });
      Assert.equal(stuff.protoValues().string_value, "foo");
    });

    it("converts doubles", function(){
      var stuff = new Stuff({ double_value: 12.23 });
      Assert.equal(stuff.protoValues().double_value, 12.23);
    });

    it("converts floats", function(){
      var stuff = new Stuff({ float_value: 12.23 });
      Assert.equal(stuff.protoValues().float_value, 12.23);
    });

    it("converts int32", function(){
      var stuff = new Stuff({ int32_value: 12 });
      Assert.equal(stuff.protoValues().int32_value, 12);
    });

    it("converts int64", function(){
      var stuff = new Stuff({ int64_value: 12 });
      Assert.deepEqual(stuff.protoValues().int64_value, Protob.Long.fromNumber(12));
    });

    it("converts uint32", function(){
      var stuff = new Stuff({ uint32_value: 12 });
      Assert.deepEqual(stuff.protoValues().uint32_value, 12);
    });

    it("converts uint64", function(){
      var stuff = new Stuff({ uint64_value: 12 });
      Assert.deepEqual(stuff.protoValues().uint64_value, Protob.Long.fromNumber(12, true));
    });

    it("converts fixed32", function(){
      var stuff = new Stuff({ fixed32_value: 12 });
      Assert.deepEqual(stuff.protoValues().fixed32_value, 12 );
    });

    it("converts fixed64", function(){
      var stuff = new Stuff({ fixed64_value: 12 });
      Assert.deepEqual(stuff.protoValues().fixed64_value, Protob.Long.fromNumber(12, true));
    });

    it("converts sfixed32", function(){
      var stuff = new Stuff({ sfixed32_value: -12 });
      Assert.deepEqual(stuff.protoValues().sfixed32_value, -12);
    });

    it("converts sfixed64", function(){
      var stuff = new Stuff({ sfixed64_value: -12 });
      Assert.deepEqual(stuff.protoValues().sfixed64_value, Protob.Long.fromNumber(-12));
    });

    it("converts sint32", function(){
      var stuff = new Stuff({ sint32_value: -12 });
      Assert.deepEqual(stuff.protoValues().sint32_value, -12);
    });

    it("converts sint64", function(){
      var stuff = new Stuff({ sint64_value: -12 });
      Assert.deepEqual(stuff.protoValues().sint64_value, Protob.Long.fromNumber(-12));
    });

    it("converts bool", function(){
      var stuff = new Stuff({ bool_value: true });
      Assert.deepEqual(stuff.protoValues().bool_value, true);
    });

    it("converts bytes", function(){
      var char = new r['test.fox.simpsons.Character']({name: "Homer"});
      var stuff = new Stuff({ bytes_value: char.encode() });
      Assert.deepEqual(char.constructor.decode(stuff.protoValues().bytes_value), {name: "Homer", is_evil: true, is_lovable: false});
    });

    it("handles messages", function(){
      var stuff = new Stuff({message_value: { name: "Marge" }});
      Assert(stuff.protoValues().message_value instanceof r['test.fox.simpsons.Character']);
      Assert.deepEqual(stuff.protoValues().message_value, { name: "Marge", is_evil: true, is_lovable: false });
    });

    describe("conversion options", function(){
      describe("enums", function(){
        var char;
        beforeEach( function(){
          char = new r['test.fox.simpsons.Character']({ gender: 'MALE', name: "Sideshow Bob" });
        });

        it("gives numbers by default", function(){
          Assert.equal(char.protoValues({enums: 'value'}).gender, 2);
        });

        it("gives numbers", function(){
          Assert.equal(char.protoValues({enums: 'value'}).gender, 2);
        });

        it("gives name", function(){
          Assert.equal(char.protoValues({enums: 'name'}).gender, 'MALE');
        });
        it("gives full values", function(){
          var gender = r['test.common.Gender'].fetch('MALE');
          Assert.deepEqual(char.protoValues({enums: 'full'}).gender, gender);
        });

        describe("decoding", function(){
          var data, enc;
          beforeEach(function(){
            data = char.encode();
            enc = char.constructor;
          });

          it("gives numbers by default", function(){
            Assert.equal(enc.decode(data, {enums: 'value'}).gender, 2);
          });

          it("gives numbers", function(){
            Assert.equal(enc.decode(data, {enums: 'value'}).gender, 2);
          });

          it("gives name", function(){
            Assert.equal(enc.decode(data, {enums: 'name'}).gender, 'MALE');
          });

          it("gives full values", function(){
            var gender = r['test.common.Gender'].fetch('MALE');
            Assert.deepEqual(enc.decode(data, {enums: 'full'}).gender, gender);
          });
        });

      });
    });

    describe("failing conversions", function(){
      var example = this;

      ["double", "float", "int32", "int64", "uint32", "uint64", "fixed32", "fixed64",
        "sfixed32", "sfixed64", "sint32", "sint64"].forEach(function(field){

        it("does not convert " + field + " from a string", function(){
          var stuff = new Stuff();
          stuff[field + "_value"] = "ABCD";
          Assert.throws(function(){ stuff.protoValues(); });
        });
      });

      ["uint32", "fixed32"].forEach(function(field){
        it("does not convert " + field + " with a negative number", function(){
          var stuff = new Stuff();
          stuff[field + "_value"] = -3;
          Assert.throws(function(){ stuff.protoValues(); });
        });
      });
    });
  });

  describe("Encode / decode", function(){
    var stuff, Stuff, fields, decoded, encoded;

    beforeEach(function(){
      Stuff = r['test.fox.simpsons.Stuff'];
      stuff = new Stuff({
        string_value: "FOO",
        double_value: 123.123,
        float_value: 123.123,
        int32_value: -123,
        int64_value: -123,
        uint32_value: 123,
        uint64_value: 123,
        fixed32_value: 123,
        fixed64_value: 123,
        sfixed32_value: 123,
        sfixed64_value: 123,
        sint32_value: -123,
        sint64_value: -123,
        bool_value: false,
        bytes: new r['test.fox.simpsons.Character']({name: "Bart"}).encode(),
        message_value: { name: 'Lisa' }
      });
      encoded = stuff.encode();
      decoded = Stuff.decode(encoded);
      fields = stuff.protoValues();
    });

    it("encodes the message to a buffer", function(){
      Assert(encoded instanceof Protob.ByteBuffer);
    });

    it("decodes the things", function(){
      Object.keys(stuff).forEach(function(field){
        if(field == "float_value") {
          return;
        }
        Assert.deepEqual(fields[field], decoded[field], "Expected fields for " + field + " to match ");
      });
    });

    it("decodes float values", function(){
      Assert.equal(fields.float_value.toFixed(5), decoded.float_value.toFixed(5));
    });
  });

  describe("default values", function(){
    it("sets default values", function(){
      var char = new r['test.fox.simpsons.Character']({name: "Blob"});
      Assert.equal(char.is_evil, true);
      Assert.equal(char.is_lovable, false);
    });
  });
});

