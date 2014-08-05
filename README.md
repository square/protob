# Protob

Protocol buffers for Node.js.

This library borrows code from the [protobuf.js](https://github.com/dcodeIO/ProtoBuf.js) library. Thanks!

Protob is a full featured protocol buffer library for nodejs. It supports:

  * Messages
  * Enums
  * Services
  * Extensions
  * Name collisions protection for multiple extensions
  * Options
  * Full dynamic reflection
  * Browser supported
  * Compiles protos from dependent libraries
  * protoc integration

Protob was originally developed at Square where all these features are routinely used.

## Protofile

The `protob` command will compile your protocol buffers and output them in a JSON format.

When compiling proto files, protob will scan any libraries that you have installed and look for dependencies that have proto.json files and add those to the compilation list also. This ensures that you can depend on libraries that use protocol buffers in your applications.

protob comes with a number of command line options, use the --help flag to see them.

### Usage

Protob does not try to parse raw proto files. This results in poor support for protocol buffer features and is error prone. Instead it uses protoc, so you'll need to install that (brew install protoc on osx) before you can get started.

Define some protocol buffer files (.proto files) either on your local system or on github.

Note that all proto files must have a package defined.

Define a protos.json file:

    [
      {
        "local": "path/to/protos/directory",
        "paths": {
          "/" : ["specific/path"] # the key is the relative path form the directory where the proto namespace starts
        }
      },
      {
        "git": "git@git.squareup.com:some/protos_repo.git",
        "paths": {
          "relative/path/inside/repo": ["specific/path/to.proto", "paths"]
        }
      }
    ]

    $> protob --help
    $> protob

This will compile your protocol buffer definitions in JSON format to the protos directory. It will scan node\_modules for any other protos.json files that dependencies might have and fetch and compile all defined protos and proto paths.

Setting up a protos.json file makes managing proto dependencies much easier.

You can also use this directly.

    $> protoc --json_out=./some/path -I some/path some/proto/files --plugin=protoc-gen-json

## Library usage

Now that you have your protos compiled, you can start using them.

    // compile your protos
    // You need to compile before protob knows about them
    // This method is used on the server where you have file system access
    // Alternatively, if you have the raw array of descriptors you can use `registry.register(descriptors)`
    require('protob').Compiler.compile('./protos');

    var registry = require('protob').Protob.registry;

    var MyMessage = registry.lookup('some.package.MyMessage');

    myMessage = new MyMessage({ some: 'value' });

    myMessage.getf('some'); // 'value'

    myMessage.setf('the value', 'some_field')
             .setf('another', 'other_field');

    myMessage.getf('some_field); // 'the value'
    myMessage.getf('other_field'); // 'another'

    myMessage.asJSON() // { some_field: 'the value', other_field: 'another' }

    // Access enum names
    myMessage.setf('ENUM_VALUE', 'some_enum');
    myMessage.enumName('some_enum') // 'ENUM_VALUE'


    // Access services
    var MyService = registry.lookup('some.package.MyService');
    MyService.methods
    MyService.methods.SomeMethod.inputType // input type constructor
    MyService.methods.SomeMethod.outputType // output type constructor


### Why the weirdo getters and setters?

In protocol buffers there are two ways to identify a field

1. field id
2. field name + field package

Unless you're using extensions, field name is sufficient, but as soon as you use extensions, you need to specify the package and field name. It's very possible that multiple extensions that are applied to a message have the same name and if you only use the name these will collide. A protocol buffer library should always use field ids internally to prevent collisions.

For this reason, when you're getting your message asJSON, you can specify some options:

    myMessage.asJSON({
      extensions: ['some.extension'], // this will only use extensions from the 'some.extension' package and ignore all other extensions. If not set, all set fields are used and can result in collisions.
      longsAsInts: true, // defaults to false (longs are represented as strings). Trucates longs to ints.
      fieldsAsNumbers: true, // defaults to false. Rather than using names for fields in the JSON output, it will use the field numbers
      enumsAsValues: true // defaults to false. Rather than using enum names, output enums as their values
    });

### The registry

The registry is a global registry of all compiled protocol buffers. It stores them keyed by full name (package + name)

To lookup items from the registry, you must have compiled your protos.

    registry.lookup('some.package.that.has.MyMessage');

The registry also supports lazy scoping.

    scope = registry.scope('some.package.that');
    scope.lookup('has.MyMessage');

The scope is lazy in that it will only lookup when things are compiled, but you can setup your scopes any time.

See what's in your registry:

    registry.keys() // provides all items in the registry
    scope.keys() // provides a list of all items in the scope, relative to the scope. 
                 // i.e. rather than some.package.that.has.MyMessage you would see has.MyMessage
    scope.fullKeys() // lists all items within scope, but provides the full paths

### Message field options

Often fields have options set

    field = myMessage.getProtoField('field_name', 'package_name') // package_name is only used for extension fields
    opts = field.getf('options');


## Working with extensions

If you're working with extensions you'll need to specify the package when setting or accessing a field.

    myMessage.setf('ENUM_VALUE', 'some_enum', 'from.package');
    myMessage.getf(''some_enum', 'from.package');

You only specify the package if the field is an extension field.

The following methods are package aware and must include the package name if extensions are used.

* setf - set values on fields. setf(value, fieldName, packageName)
* getf - get values from fields. getf(fieldName, packageName)
* getProtoField - get a field definition. getProtoField(fieldName, packageName)
* enumValue - get an enum value. enumValue(fieldName, packageName)
* enumName - get an enum name. enumName(fieldName, packageName)

## Services

Services are compiled and provide information about the methods that have been defined.

    MyService = registry.lookup('my.package.MyService')
    MyService.methods // object with method names as keys, and google.protobuf.MethodDescriptorProto as values

    SomeMethod = MyService.methods.SomeMethod;
    SomeMethod.inputType // the constructor for the input type of the method
    SomeMethod.outputType // the constructor for the output type of the method
    SomeMethod.getf('options') // Get the optional options object for this method

### Service Handlers

Services are useful in both the browser and on the server.

On the server, use services to receive requests and fulfil the response, on the client, use services to communicate with the server using a strong API contract that is part of the executing code. Adding handlers in both places is easy.

    var MyService = registry.lookup('some.package.MyService');

    MyService.handler('MyMethod', function(req) {
      // On the server hit the db or do things, in the client, make an http request

      this.context // an object that was passed to the service when it was instantiated

      // The response object is coorced to the correct type if you use a plain old javascript object
      // otherwise you can construct an instance of the return type and return that.
      return { response: 'object' };
    });

Service methods always return a promise (from the q library). So using a service method, on the server or client is simple.

    service = new MyService();

    service.MyMethod({some: 'request')
    .then(function(res) {
      res instanceof MyService.methods.MyMethod.inputType // true
      return { some: 'response' } // coorced to the ouptut type, or construct an object of the ouptut type.
    }).catch(errorHandler);


These services are very useful on the server side to construct APIs with strong contracts even if they're not served to clients. By using services you can strictly enforce a particular API internally in your code. Very useful when that API is interacting with external APIs or providing services over http. 

For example, suppose you wanted to expose a JSON API of your service:

    controller.get("/my/thing", function(req, res, next) {
      var MyService = registry.lookup('some.package.MyService'),
          service = new MyService(),
          request = req.query;

      request.user_id = req.currentUserId;

      service.MyMethod(request) // things that are unknown are dropped on the floor
      .then(function(resp) {
        res.json(resp.asJSON());
      }).catch(next);

    });

Using services in this way will allow you to stick to your defined API and greatly simplify working with your API when coming to a new codebase. Read the proto definitions and you know the API.

## Options

Access field, method, service, enum options.

    // message options
    MyMessage.descriptor.getf('options')

    // field options
    myMessage.getProtoField('my_field').getf('options');

    // service options
    MyService.descriptor.getf('options')

    // method options
    MyService.methods.SomeMethod.getf('options')

    // enum options
    MyEnum.descriptor.getf('options')

## Encoding / Decoding

    myMessage.encode(); // encodes to a buffer ready to be sent
    MyMessage.decode(myMessage.encode()); // decodes from a buffer to a message

## Reflection

Messages, Services and enums all have their descriptors available.

    registry.lookup('some.Message').descriptor

## Browser compabtibility

Protob conatins a browser packed file `browser-protob.js`. Include that file on your page and you'll have the protob library.

You'll still need to download and compile your protos.

To compile your browser protos you might use something like: 

    protob -f browser-protos.json -o ./build/protos-cache --no-node --c ./protos-cache

I wrap this up in an npm task so I can run it easily.

Once you've parsed your protos, you need to compile them inside the browser:

    var registry = Protob.registry,
        promise = $http.get('/protos-cache/browser-protos.json', {cache: false});

      promise = promise.success(
        // Success
        function(data) {
          registry.register(data); // register your protos to compile them in your browser
        },
        function(err) {
          console.error("on noes");
        }
      );

      return promise;

## Developing

Check out this repo and do:

    npm install

To run tests with grunt, install grunt globally:

    npm test

