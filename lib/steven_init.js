function stevenInit(Steven){
  var Path   = require('path'),
      Compiler = require('./compiler').Compiler,
      init = Steven.lifecycles.initialize;

  init.setup.initializer("protob.compile", function(app){
    var protosDir = app.config.get('protoDir') || Path.resolve(Path.join(app.config.get('appDir'), "protos"))
    Compiler.compile(protosDir);
  });
}

module.exports = stevenInit;
