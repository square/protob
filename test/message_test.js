require('./test_helper');
var Assert = require('assert'),
    Path = require('path'),
    Protob = require('../index').Protob,
    reg = Protob.registry,
    EnumValue = require('../index').EnumValue;

describe("Message", function(){
  var Character, Stuff, Extendable, character, stuff, ext;

  describe('setting values', function() {
    beforeEach(function() {
      Stuff = reg.lookup('test.fox.simpsons.Stuff');
      Character = reg.lookup('test.fox.simpsons.Character');
      Extendable = reg.lookup('test.common.Extendable');
      stuff = new Stuff();
    });

    it('sets a known value as the number', function() {
      stuff.setf('Hai', 'string_value');
      Assert.equal(stuff[1], 'Hai');
    });

    it('coorces the value when setting', function() {
      stuff.setf('1.234', 'double_value');
      Assert.equal(stuff.getf('double_value'), 1.234);
    });

    it('sets the value to the name if unknown', function() {
      stuff.setf('stuff', 'unknown_field');
      Assert.equal(stuff.unknown_field, 'stuff');
    });

    it('sets enum values when set by name', function() {
      stuff.setf('NICE', 'greeting');

      Assert.equal(stuff.getf('greeting') instanceof EnumValue, true);
      Assert.equal(stuff.getf('greeting').name, 'NICE');
    });

    it('sets enum values when set by number', function() {
      stuff.setf(1, 'greeting');
      Assert.equal(stuff.getf('greeting') instanceof EnumValue, true);
      Assert.equal(stuff.getf('greeting').name, 'NICE');
    });

    it('raises when the value is imcompatible', function() {
      Assert.throws(function() {
        stuff.setf('Hai there', 'int64_value');
      });
    });

    it('coorces messages', function() {
      stuff.setf({name: 'Homer', gender: 'MALE', is_evil: false, is_lovable: true}, 'message_value');
      var msg = stuff.getf('message_value');
      Assert.equal(msg instanceof reg.lookup('test.fox.simpsons.Character'), true);
      Assert.equal(msg.getf('name'), 'Homer');
      Assert.equal(msg.enumName('gender'), 'MALE');
      Assert.equal(msg.getf('is_evil'), false);
      Assert.equal(msg.getf('is_lovable'), true);
    });

    it('coorces repeated messages', function() {
      Assert.deepEqual(stuff.getf('repeated_message'), []);

      stuff.setf([{name: 'Homer'}], 'repeated_message');
      var val = stuff.getf('repeated_message');
      Assert.equal(Array.isArray(val), true);
      Assert.equal(val.length, 1);
      Assert.equal(val[0] instanceof Character, true);
      Assert.equal(val[0].getf('name'), 'Homer');
    });

    it('coorces repeated enums', function() {
      Assert.deepEqual(stuff.getf('repeated_enum'), []);
      stuff.setf(['NICE', 'NASTY'], 'repeated_enum');
      var val = stuff.getf('repeated_enum');
      Assert.equal(Array.isArray(val), true);
      Assert.deepEqual(val.map(function(v) { return v.name; }), ['NICE', 'NASTY']);
    });

    it('coorces repeated longs', function() {
      Assert.deepEqual(stuff.getf('repeated_long'), []);
      stuff.setf(['123', '1234'], 'repeated_long');
      var val = stuff.getf('repeated_long');
      Assert.equal(val.length, 2);
      val.forEach(function(v) { 
        Assert.equal(v instanceof Protob.Long, true);
      });
      Assert.equal(val[0].toInt(), 123);
      Assert.equal(val[1].toInt(), 1234);
    });

    it('sets extension fields from a different package', function() {
      ext = new Extendable();
      ext.setf('NICE', 'greeting_type', 'test.fox.simpsons');
      Assert.equal(ext.enumName('greeting_type', 'test.fox.simpsons'), 'NICE');
    });

    it('chains setters', function() {
      stuff.setf('Hai', 'string_value')
        .setf(12.34, 'double_value')
        .setf(true, 'bool_value');

      Assert.equal(stuff.getf('string_value'), 'Hai');
      Assert.equal(stuff.getf('double_value'), 12.34);
      Assert.equal(stuff.getf('bool_value'), true);
    });
  });

  describe('setting incorrect values', function() {
    it('throws when setting an incompatible value', function() {
      Assert.throws(function() { stuff.setf('wot', 'int64_value'); });
    });

    it('sets an unknown field as the name that was passed in', function() {
      stuff.setf('some', 'value');
      Assert.equal(stuff.value, 'some');
    });
  });

  describe('asJSON', function() {
    var vals;
    beforeEach(function() {
      vals = {
        string_value: 'abc',
        double_value: 12.12,
        float_value: 12.12,
        int64_value: '1234',
        bool_value: true,
        message_value: { 
          name: 'Homer', 
          is_evil: false, 
          is_lovable: true, 
          joke_count: 15,
          things_i_like: ['BEER', 'DONUTS']
        },
        repeated_enum: ['NICE'],
        repeated_long: ['12', '13'],
        repeated_message: [ 
          {
            name: 'Marge',
            is_evil: false,
            is_lovable: false,
            joke_count: 0,
            things_i_like: [],
          },
          {
            name: 'Bart',
            is_evil: true,
            is_lovable: true,
            joke_count: 5,
            things_i_like: ['SKATEBOARD']
          }
        ]
      };
      stuff = new Stuff(vals);
    });

    it('gives me the values in a json format', function() {
      Assert.deepEqual(stuff.asJSON(), vals);
    });

    it('ignores values that are not defined in protos', function() {
      stuff.hai = 'hai';
      Assert.deepEqual(stuff.asJSON(), vals);
    });
  });

  describe("encode/decode", function(){
    it('encodes and decodes messages', function() {
      stuff = new Stuff({
        string_value: '15', 
        repeated_enum: ['NICE'],
        int64_value: 1234
      });

      var val = Stuff.decode(stuff.encode());
      val.asJSON();

      Assert.deepEqual(val, stuff);
    });

    it('is ok with bytes', function() {
      character = new Character({name: 'HOMER'});
      stuff = new Stuff({bytes_value: character.encode()});
      var thing = Stuff.decode(stuff.encode()),
          val = Character.decode(thing.getf('bytes_value'));

      val.asJSON();

      Assert.deepEqual(val, character);
    });
    it('handles extension fields', function() {
      ext = new Extendable();
      ext.setf('hai there', 'msg', 'test.fox.simpsons');

      var thing = Extendable.decode(ext.encode());
      Assert.equal(thing.getf('msg', 'test.fox.simpsons'), 'hai there');

    });
  });

  describe('field extensions', function() {
    beforeEach(function() {
      character = new Character({name: 'Homer'});
    });

    it('provides access to the extension', function() {
      var field = character.getProtoField('name');
      Assert.equal(field.getf('options').getf('my_ext', 'test.common').getf('nick'), 'killa');
    });

  });
});

