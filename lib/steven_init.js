function stevenInit(Steven){
  var Path   = require('path'),
      Compiler = require('./compiler').Compiler,
      init = Steven.lifecycles.initialize;

  init.setup.initializer("protob.compile", function(app){
    var protosDir = app.config.protoDir || Path.resolve(Path.join(app.config.root, "protos"))
    Compiler.compile(protosDir);
  });
}

module.exports = stevenInit;
