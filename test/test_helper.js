var Protob = require('../index').Protob;
var Compiler = require('../index').Compiler;
var Protofile = require('../index').Protofile;
var Path = require('path');
var fs = require('fs');
var exec = require('child_process').exec;

var compiledPath = Path.resolve(Path.join(__dirname, 'compiled'));
var protofilePath = Path.resolve(Path.join(__dirname, "protos.json"));

// fs.unlinkSync(compiledPath);

describe("setup", function(){
  before(function(done){
    var path = Path.resolve(Path.join(__dirname, "..", "bin", "protob"));
    cmd = path + " -o " + compiledPath + " " + protofilePath;
    exec("rm -rf " + compiledPath + "/*", function(){
      exec(cmd, function(err, stdout, stderr){
        if(err) {
          done( new Error(stderr) );
        } else {
          Compiler.compile(Path.resolve(Path.join(__dirname, "compiled")));
          done();
        }
      });
    });
  });

  it("is setup", function(){});
});




