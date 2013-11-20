var Glob = require('glob');
var Q    = require('q');
var fs   = require('fs');
var exec = require('child_process').exec;
var Protofile;
var Path = require('path');

// {
//   "sources": [
//     {
//       "git": "git@git.squareup.com.git",
//       "base": "protos",
//       "branch": "my-branch",
//       "paths": [
//         "squareup/sake"
//       ]
//    },
//    {
//      "base": "/Users/dneighman/Development/protos",
//      "paths": ["/"]
//    }
//   ],
// }

var Source = function(sourceDef){
  var fetched = false;

  this.base = sourceDef.base;
  this.paths = sourceDef.paths;

  if ( sourceDef.git ) {
    this.git = sourceDef.git;
    this.branch = sourceDef.branch || 'master';
  }

  this.fetch = function(){
    if ( this.fetched || !this.git ) { return Q.fcall(function() { return true }); }
    return this.fetchFromGit();
  };

  if (this.git) {
    this.basePath = Path.join(".", Protofile.protoCache, Path.basename(this.git, ".git"));
    this.location = Path.join(this.basePath, this.base);
  } else {
    this.location = this.basePath = this.base;
  }
}

Source.prototype.files = function(){
  var out = [],
      self = this;

  if ( this.paths && Array.isArray(this.paths) ) {
    this.paths.forEach(function(path) {
      if ( /\.proto$/.test(path) ) {
        out.push(path);
      } else {
        Glob.sync(Path.join(self.location, path, "**/*.proto")).forEach(function(pth) {
          out.push(pth);
        });
      }
    });
  }
  return out;
}

Source.prototype.fetchFromGit = function(){
  var deferred = Q.defer();
  var self = this;

  if ( fs.existsSync(this.location) ) {
    // it already exists. Just have to update it and checkout the branch
    deferred.resolve(true)
  } else {
    if ( !fs.existsSync(Protofile.protoCache) ) {
      fs.mkdirSync(Protofile.protoCache);
    }
    console.error("Cloning from git:", this.git);
    // clone it and check out the branch
    var cmd = "git clone --depth 1 --branch " + this.branch + " " + this.git;

    exec(cmd, { cwd: Protofile.protoCache }, function(error, stdout, stderr) {
      if( error ){
        console.error(self.location);
        console.error(error);
        deferred.reject(error);
      } else {
        deferred.resolve(true);
      }
    });
    return deferred.promise;
  }

  // get the branch
  var promise = deferred.promise.then(function(){
    var defer = Q.defer();
    // checkout the branch and pull
    console.error("Fetching latest from git:", self.git);
    var cmd = "git checkout " + this.branch;
    cmd = cmd + "; git pull --depth 1";
    exec(cmd, { cwd: self.location }, function(error, stdout, stderr) {
      if ( error ) {
        console.error(self.location);
        console.error("could not checkout");
        console.error(error);
        console.error(stderr);

        defer.reject(error);
      } else {
        defer.resolve(true);
      }
    });
    return defer.promise;
  }, function(error) { console.error("THERE WAS AN ERROR"); });

  return promise;
};

var Protofile = function(){
  var self = this;
  this.sources = [];
  this.allPaths = [];
  this.foundPaths = {};

  Protofile.protoPaths.forEach(function(path){
    var json = JSON.parse(fs.readFileSync(Path.resolve(path)));
    json.forEach(function(src) { self.sources.push( new Source(src) ); });
  });
};

Protofile.prototype.resolve = function(){
  var ps = this.sources.map(function(source) { return source.fetch(); });
  return Q.all(ps);
};

Protofile.prototype.files = function(){
  return [].concat.apply([], this.sources.map(function(source) { return source.files() }));
};

Protofile.protoCache = "./.git_proto_cache";
Protofile.outputDir  = "./protos";
Protofile.protoPaths = [];

exports.Protofile = Protofile;
