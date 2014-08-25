require('../test_helper');

var Path = require('path'),
    index = require(Path.join(__dirname, "../../index")),
    Protob = index.Protob,
    Assert = require('assert'),
    r = Protob.registry,
    Long = index.Protob.Long;

describe("protofile", function(){
  it("compiles the protos to the registry", function(){
    var stuff = new (r.lookup('test.fox.simpsons.Stuff'))();
    Assert(stuff instanceof index.Message);
  });

  it("uses the provided arguments to set values", function(){
    var homer = new (r.lookup('test.fox.simpsons.Character'))({name: 'Homer'});
    Assert.equal(homer.getf('name'), 'Homer', 'Expected setter on the constructor');
  });

  describe("setting and getting", function(){
    var Stuff;
    beforeEach(function(){ Stuff = r.lookup('test.fox.simpsons.Stuff'); });

    it("ignores non field values", function(){
      var stuff = new Stuff({ not_a_value: "foo" });
      Assert.equal(stuff.asJSON().not_a_value, undefined);
      Assert.equal(stuff.not_a_value, "foo");
    });

    it("converts strings", function(){
      var stuff = new Stuff({ string_value: "foo" });
      Assert.equal(stuff.getf('string_value'), "foo");
    });

    it("converts doubles", function(){
      var stuff = new Stuff({ double_value: 12.23 });
      Assert.equal(stuff.getf('double_value'), 12.23);
    });

    it("converts floats", function(){
      var stuff = new Stuff({ float_value: 12.23 });
      Assert.equal(stuff.getf('float_value'), 12.23);
    });

    it("converts int32", function(){
      var stuff = new Stuff({ int32_value: 12 });
      Assert.equal(stuff.getf('int32_value'), 12);
    });

    it("converts int64", function(){
      var stuff = new Stuff({ int64_value: 12 });
      Assert.deepEqual(stuff.getf('int64_value'), Protob.Long.fromNumber(12));
    });

    it("converts uint32", function(){
      var stuff = new Stuff({ uint32_value: 12 });
      Assert.deepEqual(stuff.getf('uint32_value'), 12);
    });

    it("converts uint64", function(){
      var stuff = new Stuff({ uint64_value: 12 });
      Assert.deepEqual(stuff.getf('uint64_value'), Protob.Long.fromNumber(12, true));
    });

    it("converts fixed32", function(){
      var stuff = new Stuff({ fixed32_value: 12 });
      Assert.deepEqual(stuff.getf('fixed32_value'), 12 );
    });

    it("converts fixed64", function(){
      var stuff = new Stuff({ fixed64_value: 12 });
      Assert.deepEqual(stuff.getf('fixed64_value'), Protob.Long.fromNumber(12, true));
    });

    it("converts sfixed32", function(){
      var stuff = new Stuff({ sfixed32_value: -12 });
      Assert.deepEqual(stuff.getf('sfixed32_value'), -12);
    });

    it("converts sfixed64", function(){
      var stuff = new Stuff({ sfixed64_value: -12 });
      Assert.deepEqual(stuff.getf('sfixed64_value'), Protob.Long.fromNumber(-12));
    });

    it("converts sint32", function(){
      var stuff = new Stuff({ sint32_value: -12 });
      Assert.deepEqual(stuff.getf('sint32_value'), -12);
    });

    it("converts sint64", function(){
      var stuff = new Stuff({ sint64_value: -12 });
      Assert.deepEqual(stuff.getf('sint64_value'), Protob.Long.fromNumber(-12));
    });

    it("converts bool", function(){
      var stuff = new Stuff({ bool_value: true });
      Assert.deepEqual(stuff.getf('bool_value'), true);
    });

    it("converts bytes", function(){
      var char = new (r.lookup('test.fox.simpsons.Character'))({name: "Homer"});
      var stuff = new Stuff({ bytes_value: char.encode() });
      Assert.deepEqual(char.constructor.decode(stuff.getf('bytes_value')), new char.constructor({name: "Homer", is_evil: true, is_lovable: false, joke_count: new Long(1, 0, false)}));
    });

    it("handles messages", function(){
      var stuff = new Stuff({message_value: { name: "Marge" }});
      Assert(stuff.getf('message_value') instanceof r.lookup('test.fox.simpsons.Character'));
      Assert.deepEqual(stuff.getf('message_value'), new (r.lookup('test.fox.simpsons.Character'))({ name: "Marge", is_evil: true, is_lovable: false, joke_count: new Long(1, 0, false)}));
    });

    describe("conversion options", function(){
      describe("enums", function(){
        var char;
        beforeEach( function(){
          char = new (r.lookup('test.fox.simpsons.Character'))({ gender: 'MALE', name: "Sideshow Bob", joke_count: 4 });
        });

        describe("decoding", function(){
          var data, enc;
          beforeEach(function(){
            data = char.encode();
            enc = char.constructor;
          });

          it("gives full values", function(){
            var gender = r.lookup('test.common.Gender').fetch('MALE'),
                stuff = enc.decode(data);

            Assert.equal(stuff.getf('name'), 'Sideshow Bob');
            Assert.deepEqual(stuff.getf('gender'), gender);
            Assert.equal(stuff.getf('joke_count').toInt(), 4);
          });
        });
      });

      describe("longs", function() {
        var stuff;
        beforeEach( function(){
          stuff = new (r.lookup('test.fox.simpsons.Stuff'))({ int64_value: 4815162342});
        });

        it('gives ints', function() {
          Assert.equal(stuff.asJSON({ longsAsInts: true}).int64_value, 4815162342);
        });

        it('gives strings', function() {
          Assert.equal(stuff.asJSON().int64_value, '4815162342');
        });

        describe("decoding", function(){
          var data, enc;
          beforeEach(function(){
            data = stuff.encode();
            enc = stuff.constructor;
          });

          it("gives ints", function(){
            Assert.equal(enc.decode(data).asJSON({longsAsInts: true}).int64_value, 4815162342);
          });

          it('gives strings', function() {
            Assert.equal(enc.decode(data).asJSON().int64_value, '4815162342');
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
          Assert.throws(function() {
            stuff.setf('ABCD', field + "_value");
          });
        });
      });

      ["uint32", "fixed32"].forEach(function(field){
        it("does not convert " + field + " with a negative number", function(){
          var stuff = new Stuff();
          Assert.throws(function() {
            stuff.setf(-3, field + "_value");
          });
        });
      });
    });
  });

  describe("Encode / decode", function(){
    var stuff, Stuff, fields, decoded, encoded;

    beforeEach(function(){
      Stuff = r.lookup('test.fox.simpsons.Stuff');
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
        bytes: new (r.lookup('test.fox.simpsons.Character'))({name: "Bart"}).encode(),
        message_value: { name: 'Lisa' }
      });
      encoded = stuff.encode();
      decoded = Stuff.decode(encoded);
      fields = stuff.asJSON();
    });

    it("encodes the message to a buffer", function(){
      Assert(encoded instanceof Protob.ByteBuffer);
    });

    it("decodes the things", function(){
      Object.keys(fields).forEach(function(field){
        if(field == "float_value") {
          return;
        }
        var val = decoded.getf(field);
        if(val.toInt) val = val.toInt();
        if(val.asJSON) val = val.asJSON();
        Assert.deepEqual(fields[field], val, "Expected fields for " + field + " to match ");
      });
    });

    it("decodes float values", function(){
      Assert.equal(fields.float_value.toFixed(5), decoded.getf('float_value').toFixed(5));
    });
  });

  describe("default values", function(){
    it("sets default values", function(){
      var char = new (r.lookup('test.fox.simpsons.Character'))({name: "Blob"});
      Assert.equal(char.getf('is_evil'), true);
      Assert.equal(char.getf('is_lovable'), false);
      Assert.deepEqual(char.getf('joke_count'), new Long(1, 0, false));
    });
  });

  describe("extensions", function(){
    var Extendable, ext;

    beforeEach(function(){
      Extendable = r.lookup('test.common.Extendable');

      ext = new Extendable({name: 'Plow King'});
      ext.setf(true, 'greet', 'test.fox.simpsons')
         .setf('Hai there', 'msg', 'test.fox.simpsons')
         .setf('NICE', 'greeting_type', 'test.fox.simpsons');
    });

    it("sets up extensions", function(){
      var result = ext.asJSON();
      Assert.equal(result.name, 'Plow King');
      Assert.equal(result.greet, true);
      Assert.equal(result.msg, 'Hai there');
      Assert.equal(result.greeting_type, 'NICE');
    });

    it("excludes extensions unless they're in the list", function(){
      var result = ext.asJSON({extensions: ['test.fox.simpsons']});
      Assert.equal(result.name, 'Plow King');
      Assert.equal(result.greet, true);
      Assert.equal(result.msg, 'Hai there');
      Assert.equal(result.greeting_type, 'NICE');

      var result = ext.asJSON({extensions: []});
      Assert.equal(result.name, 'Plow King');
      Assert(result.hasOwnProperty('greet') === false);
      Assert(result.hasOwnProperty('msg') === false);
      Assert(result.hasOwnProperty('greeting_type') === false);
    });

    it('handles extensions with the same name', function() {
      ext.setf('Barney', 'name', 'test.fox.simpsons');
      Assert.equal(ext.getf('name'), 'Plow King');
      Assert.equal(ext.getf('name', 'test.fox.simpsons'), 'Barney');
    });

    describe('field options', function() {
      var char;

      beforeEach(function() {
        char = new (r.lookup('test.fox.simpsons.Character'))({name: "Blob"});
      });

      it('provides access to my field extensions', function() {
        var field = char.getProtoField('name'),
            opts;

        opts = field.getf('options').getf('my_ext', 'test.common');
        Assert.equal(opts.getf('nick'), 'killa');
      });

      it('provides access to my service extensions', function() {
        var service = r.lookup('test.fox.simpsons.MyService'),
            opts = service.descriptor.getf('options');

        Assert.equal(opts.getf('service_ext', 'test.common').getf('nick'), 'Service yo');
      });

      it('provides access to my metho extensions', function() {
        var service = r.lookup('test.fox.simpsons.MyService'),
            methods = service.methods;

        Assert(Object.keys(methods).length, 1);
        Assert(methods.SomeMethod.getf('options').getf('method_ext', 'test.common').getf('nick'), 'Hai there');
      });
    });
  });
});

