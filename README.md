# Protob

Protocol buffers for Node.js.

## Protofile

The command line file `protob` will compile your protocol buffers and output them

### Usage

Define a protos.json file:

    [
      {
        "local": "path/to/protos/directory",
        "paths": {
          "relative/path" : ["specific/path"]
        }
      },
      {
        "git": "git@git.squareup.com:some/protos_repo.git",
        "paths": {
          "relative/path": ["specific", "paths"]
        }
      }
    ]

    $> protob --help
    $> protob

This will compile your protocol buffer definitions to json for the protob library to consume.

You can also use this directly.

    $> protoc --json_out=./some/path -I some/path some/proto/files --plugin=protoc-gen-json

## Protocompiler

This will compile your protocol buffers into Javascript objects.

You can access your protocol buffers either by the registry or object cache.

    var Protob = require('protob').Protob;
    var Compiler = require('protob').Compiler;
    Compiler.compile();
    var registry = Protob.registry;
    var protos = Protob.v;

    myMessage = new r['some.package.MyMessage']({with: "values"});
    myMessage = protos.some.package.MyMessage({with: "values"});

## Encoding / Decoding

    myMessage.encode(); // encodes to a buffer ready to be sent
    MyMessage.decode(myMessage.encode()); // decodes from a buffer to a message

    myMessage.protoValues(); // provides a cooerced version of the message. 64 bit integers use the Long library
    myMessage.protoValues({enums: 'name'}) // convert all enums into name values
    myMessage.protoValues({enums: 'number'}) // convert all enums into number values
    myMessage.protoValues({enums: 'full'}) // convert all enums into number values

## Reflection

Messages are stored with their descriptor available on their constructor.

MyMessage.descriptor // access the definition of the protocol buffer

## ENUMS

You can set an enum value as either the number of name.

    myMessage.enum_value = "FOO"
    myMessage.encode() // will do the right thing

## Developing

Check out this repo and do:

    npm install

To run tests with grunt, install grunt globally:

    npm install grunt-cli -g

And then:

    grunt simplemocha

Or if you prefer not to install grunt globally:

    ./node_modules/.bin/mocha --reporter spec --ui bdd --slow 200 --timeout 1000 -w lib/** -w test/** test/**



