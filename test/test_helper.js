var Protob = require('../index').Protob;
var Compiler = require('../index').Compiler;
var Protofile = require('../index').Protofile;
var Path = require('path');
var fs = require('fs');
var exec = require('child_process').exec;
var Util = require('util');

var compiledPath = Path.resolve(Path.join(__dirname, 'compiled'));
var protofilePath = Path.resolve(Path.join(__dirname, "protos.json"));

// fs.unlinkSync(compiledPath);

before(function(done){
  var path = Path.resolve(Path.join(__dirname, "..", "bin", "protob"));
  cmd = path + " -o " + compiledPath + " " + protofilePath + " --no-node"
  exec("rm -rf " + compiledPath + "/*", function(_err_, _stdout_, _stderr_){
    exec(cmd, function(err, stdout, stderr){
      if(err) {
        console.error(err, stderr);
        done( new Error(stderr) );
      } else {
        Compiler.compile(Path.resolve(Path.join(__dirname, "compiled")));
        done();
      }
    });
  });
});

