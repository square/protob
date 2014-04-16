require('./test_helper');
var Assert = require('assert');
var Path = require('path');
var Protob = require('../index').Protob;

describe("Protob", function(){
  describe("Wire Types", function(){
    it("has a VARINT", function(){
      Assert.equal( 0, Protob.WIRE_TYPES.VARINT, "VARINT expected but not found");
    });

    it("has a BITS64", function(){
      Assert.equal( 1, Protob.WIRE_TYPES.BITS64, "BITS64 expected but not found");
    });

    it("has a LDELIM", function(){
      Assert.equal( 2, Protob.WIRE_TYPES.LDELIM, "LDELIM expected but not found");
    });

    it("has a STARTGROUP", function(){
      Assert.equal( 3, Protob.WIRE_TYPES.STARTGROUP, "STARTGROUP expected but not found");
    });

    it("has a ENDGROUP", function(){
      Assert.equal( 4, Protob.WIRE_TYPES.ENDGROUP, "ENDGROUP expected but not found");
    });

    it("has a BITS32", function(){
      Assert.equal( 5, Protob.WIRE_TYPES.BITS32, "BITS32 expected but not found");
    });
  });

  describe("TYPES", function(){
    var Types = Protob.TYPES;
    var WT = Protob.WIRE_TYPES;
    var eq = Assert.deepEqual;

    it("has TYPE_INT32", function(){
      eq(Types.TYPE_INT32, {
        name: "int32",
        wireType: WT.VARINT
      });
    });

    it("has TYPE_UINT32", function(){
      eq(Types.TYPE_UINT32, {
        name: "uint32",
        wireType: WT.VARINT
      });
    });

    it("has TYPE_SINT32", function(){
      eq(Types.TYPE_SINT32, {
        name: "sint32",
        wireType: WT.VARINT
      });
    });

    it("has TYPE_INT64", function(){
      eq(Types.TYPE_INT64, {
        name: "int64",
        wireType: WT.VARINT
      });
    });

    it("has TYPE_UINT64", function(){
      eq(Types.TYPE_UINT64, {
        name: "uint64",
        wireType: WT.VARINT
      });
    });

    it("has TYPE_SINT64", function(){
      eq(Types.TYPE_SINT64, {
        name: "sint64",
        wireType: WT.VARINT
      });
    });

    it("has TYPE_BOOL", function(){
      eq(Types.TYPE_BOOL, {
        name: "bool",
        wireType: WT.VARINT
      });
    });

    it("has TYPE_DOUBLE", function(){
      eq(Types.TYPE_DOUBLE, {
        name: "double",
        wireType: WT.BITS64
      });
    });

    it("has TYPE_STRING", function(){
      eq(Types.TYPE_STRING, {
        name: "string",
        wireType: WT.LDELIM
      });
    });

    it("has TYPE_BYTES", function(){
      eq(Types.TYPE_BYTES, {
        name: "bytes",
        wireType: WT.LDELIM
      });
    });

    it("has TYPE_FIXED32", function(){
      eq(Types.TYPE_FIXED32, {
        name: "fixed32",
        wireType: WT.BITS32
      });
    });

    it("has TYPE_SFIXED32", function(){
      eq(Types.TYPE_SFIXED32, {
        name: "sfixed32",
        wireType: WT.BITS32
      });
    });

    it("has TYPE_FIXED64", function(){
      eq(Types.TYPE_FIXED64, {
        name: "fixed64",
        wireType: WT.BITS64
      });
    });

    it("has TYPE_SFIXED64", function(){
      eq(Types.TYPE_SFIXED64, {
        name: "sfixed64",
        wireType: WT.BITS64
      });
    });

    it("has TYPE_FLOAT", function(){
      eq(Types.TYPE_FLOAT, {
        name: "float",
        wireType: WT.BITS32
      });
    });

    it("has TYPE_ENUM", function(){
      eq(Types.TYPE_ENUM, {
        name: "enum",
        wireType: WT.VARINT
      });
    });

    it("has TYPE_MESSATE", function(){
      eq(Types.TYPE_MESSAGE, {
        name: "message",
        wireType: WT.LDELIM
      });
    });
  });

  it("has a registry", function(){
    Assert.equal(typeof Protob.registry, "object");
  });

  it("caches the ByteBuffer implementation", function(){
    var bb = require('bytebuffer');
    Assert.equal(bb, Protob.ByteBuffer);
  });


});
