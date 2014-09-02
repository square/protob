# Protob - protocol buffers for Javascript

Protob (pronounced PRO-tob) is a full featured protocol buffer library for Node.js and the browser. It includes support for:

  * Messages
  * Enums
  * Services
  * Extensions
  * Name collision protection for multiple extensions
  * Options
  * Full dynamic reflection
  * Use in the browser
  * Compiling protos from dependent libraries
  * `protoc` integration

Protob originated at Square, where all of these features are used routinely.

This library borrows code from the [ProtoBuf.js](https://github.com/dcodeIO/ProtoBuf.js) library. Thanks!

## Setup

### Install Protob globally
    npm install -g protob

### Install `protoc`

Protob uses `protoc` to parse `.proto` files, so make sure you have it installed (`brew install protobuf` in OS X) before continuing.

### Define your protocol buffers

Define your protocol buffers in `.proto` files as usual. These files can live in directories in your project or in their own git repo.

### Create a `proto.json` file in your project's root directory

The `proto.json` file lists the locations of the `.proto` files that Protob should compile for your project. The file format is a JSON array, where each element describes a different local path or remote git repository. An example `proto.json` file looks like this:

    [
      { "local": "path/to/protos/root", # This path is relative to your project's root },
      { "git": "https@github.com/hassox/google-protos.git"},
    ]

List as many repos or directories as you need to make your proto bundle. You don't have to call it `protos.json` it's just the default. You may want to have a bundle for your server and a different one for your browser bundle.

#### Proto json format

You can pull out specific .proto files, directories or refer to nested directories as the proto import path. For example:

    [
      { 
        "git": "git@github.com:me/my-repo.git",
        "paths": {
          "some/path": ["my/package", "my/other/package"]
          "some/other/path": ["/"]
        }
      }
    ]

This would checkout the git repo from github, and when compiling with protoc it would provide the following to protoc:

- Import paths (where to look for protos via imports etc)
  -- `some/path`
  -- some/other/path`
- Glob and compile all files
  -- `some/path/my/package/**/*.proto`
  -- `som/path/my/other/package/**/*.proto`
  -- `some/other/path/**/*.proto`

The general shape of the prots.json file is:

    [
      { "(git|local)": <address>,
        "[branch]": <optional branch for git repos>,
        "paths": {
          <import path>: [ <glob paths relative to import path>... ]
        }
      }
    ]

The defaults:

* For git repos, branch == 'master'
* Paths defaults to  { "/": ["/"] } meaning, import from the root path of your directory/repo and import all protos found recursivley.

## Compiling protos

**Note:** Protob includes several command-line options. Run `protob --help` to see all of them.

Run the `protob` command from your project's root directory to compile your project's protocol buffers and output them in JSON format. If your project's local dependencies define `proto.json` files, Protob compiles their protos as well. This ensures that you can depend on libraries that use protocol buffers in your application.

In general it's as simple as:

    $> protob

If you want to compile a single bundle file for the browser:

    $> protob -o ./public -f proto-bundle.json

Alternatively, you can also use this `protoc` command directly:

    $> protoc --json_out=./some/path -I some/path some/proto/files --plugin=protoc-gen-json

## Using protos in Node.js code

Now that you have your protos compiled, you can start using them.

    // compile your protos
    // You need to compile before protob knows about them
    // This method is used on the server where you have file system access
    // Alternatively, if you have the raw array of descriptors you can use `registry.register(descriptors)`
    require('protob').Compiler.compile('./protos');

    // Alternatively if you have compiled your proto files into a single .json proto-bundle.
    require('protob').Protob.registry.register(myProtoBundleJSON);

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

In protocol buffers there are two ways to identify a field:

1. field id
2. field name + field package

Unless you're using extensions, field name is sufficient, but as soon as you use extensions, you need to specify the package and field name. It's very possible that multiple extensions that are applied to a message have the same name and if you only use the name these will collide. A protocol buffer library should always use field ids internally to prevent collisions.

For this reason, when you're getting your message `asJSON`, you can specify some options:

    myMessage.asJSON({
      extensions: ['some.extension'], // this will only use extensions from the 'some.extension' package and ignore all other extensions. If not set, all set fields are used and can result in collisions.
      longsAsInts: true, // defaults to false (longs are represented as strings). Trucates longs to ints.
      fieldsAsNumbers: true, // defaults to false. Rather than using names for fields in the JSON output, it will use the field numbers
      enumsAsValues: true // defaults to false. Rather than using enum names, output enums as their tag numbers
    });

### The registry

The registry is a global registry of all compiled protocol buffers. It stores them keyed by full name (package + name)

To look up items from the registry, you must have compiled your protos.

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

The following methods are package-aware and must include the package name if extension fields are being accessed.

* `setf` - set values on fields. setf(value, fieldName, packageName)
* `getf` - get values from fields. getf(fieldName, packageName)
* `getProtoField` - get a field definition. getProtoField(fieldName, packageName)
* `enumValue` - get an enum value. enumValue(fieldName, packageName)
* `enumName` - get an enum name. enumName(fieldName, packageName)

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

Service methods always return a promise (from the q library). So using a service method, on the server or client is simple. Return a promise or a raw object.

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

Using services in this way will allow you to stick to your defined API and greatly simplify working with your API when coming to a new codebase. Read the proto definitions and you know the API. It also allows you to test your code in one place and be confident that anywhere that uses that code is going to follow the correct API.

This service method isn't just useful in the controller, you can use it anywhere in your code.

    myJobHandler.on('someJob', function(payload) {
      var MyService = registry.lookup('some.package.MyService'),
          service = new MyService();
      service.MyMethod(payload)
      .then(function(res) {
        // do stuff
      }).catch(errorHandler);
    });

Or even just in the console:

      MyService = registry.lookup('some.package.MyService');
      service = new MyService();
      p = service.MyMethod({some: 'args'})
      p.inspect().value // response

Services are a great way to create code re-use with a strong, discoverable API.

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

Protob conatins a browser-packed file `browser-protob.js`. Include that file on your page and you'll have the protob library.

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

## Developing Protob
Check out this repo and do:

    npm install

To run tests with grunt, install grunt globally:

    npm test

