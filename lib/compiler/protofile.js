var Glob = require('glob');
var Q    = require('q');
var fs   = require('fs');
var exec = require('child_process').exec;
var Protofile;
var Path = require('path');

//
// [
//   {
//     "git": "git@git.squareup.com:square/protos.git",
//     "paths": {
//       "google/src/main/proto": ["/"],
//       "sake/src/main/proto": ["squareup/sake"],
//       "multipass/src/main/proto": ["squareup/multipass"],
//     }
//   },
//   {
//      "local": "/Users/foo/Development/java",
//      "paths": {
//        "roster/api/src/main/proto": ["/"]
//      }
// ]

var Source = function(sourceDef){
  var fetched = false;
  var self = this;
  this.paths = sourceDef.paths || {};
  if ( sourceDef.git ) {
    this.git = sourceDef.git;
    this.branch = sourceDef.branch || 'master';
  } else if ( sourceDef.local ) {
    this.local = true;
    this.basePath = sourceDef.local;
  } else {
    throw("Unknown source type");
  }

  this.fetch = function(){
    if ( this.fetched || this.local ) { return Q.fcall(function() { return true; }); }
    return this.fetchFromGit();
  };

  if (this.git) {
    this.basePath = Path.join(".", Protofile.protoCache, Path.basename(this.git, ".git"));
  }

  this.addPaths(sourceDef);
};

Source.prototype.addPaths = function(source){
  var keys = Object.keys(source.paths || {});
  for(var i=0; i<keys.length; i++){
    if(source.paths[keys[i]]) {
      if(this.paths[keys[i]]) {
        var pths = source.paths[keys[i]] || [];
        for(var k=0;k<pths.length;k++){
          if(this.paths[keys[i]].indexOf(pths[k]) < 0){
            this.paths[keys[i]].push(pths[k]);
          }
        }
      } else {
        this.paths[keys[i]] = sources.paths[keys[i]];
      }
    }
  }
};

Source.prototype.importPaths = function() {
  var out = [],
      self = this;

  return Object.keys(this.paths).map(function(pth) {
    return Path.resolve(Path.join(self.basePath, pth));
  });
};

Source.prototype.files = function(){
  var out = [],
      self = this;

  if ( this.paths ) {
    Object.keys(this.paths).forEach(function(basePath) {
      self.paths[basePath].forEach(function(path) {
        if ( /\.proto$/.test(path) ) {
          out.push(Path.join(self.basePath, basePath, path));
        } else {
          Glob.sync(Path.join(self.basePath, basePath, path, "**/*.proto")).forEach(function(pth) {
            out.push(pth);
          });
        }
      });
    });
  }
  return out;
};

Source.prototype.fetchFromGit = function(){
  var deferred = Q.defer();
  var self = this;

  if ( fs.existsSync(this.basePath) ) {
    // it already exists. Just have to update it and checkout the branch
    deferred.resolve(true);
  } else {
    if ( !fs.existsSync(Protofile.protoCache) ) {
      fs.mkdirSync(Protofile.protoCache);
    }
    console.error("Cloning from git:", this.git);
    // clone it and check out the branch
    var cmd = "git clone --branch " + this.branch + " " + this.git;

    exec(cmd, { cwd: Protofile.protoCache }, function(error, stdout, stderr) {
      if( error ){
        console.error(self.basePath);
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
    var cmd = "git checkout " + self.branch;
    cmd = cmd + "; git pull;"
    exec(cmd, { cwd: self.basePath }, function(error, stdout, stderr) {
      if ( error ) {
        console.error(self.basePath);
        console.error("could not checkout");
        console.error(error);
        console.error(stderr);

        defer.reject(error);
      } else {
        defer.resolve(true);
      }
    });
    return defer.promise;
  }, function(error) { console.error("THERE WAS AN ERROR", error); });

  return promise;
};

var Protofile = function(){
  var self = this;
  this.sources = [];
  this.allPaths = [];
  this.foundPaths = {};

  Protofile.protoPaths.forEach(function(path){
    var json = JSON.parse(fs.readFileSync(Path.resolve(path)));
    json.forEach(function(src) { self.addSource(src); });
  });
};

Protofile.prototype.addSource = function(source){
  var existing;
  if(source.git) {
    existing = this.sources.filter(function(src){ return src.git == source.git; })[0];
  } else if ( source.local ){
    existing = this.sources.filter(function(src){ return src.basePath == source.local; })[0];
  } else {
    throw(new Error("Unknown source type"));
  }

  if( existing ) {
    existing.addPaths(source);
    if(source.branch && !existing.branch) { existing.branch = source.branch; }
  } else {
    this.sources.push(new Source(source));
  }
};

Protofile.prototype.resolve = function(){
  var ps = this.sources.map(function(source) { return source.fetch(); });
  return Q.all(ps);
};

Protofile.prototype.files = function(){
  return [].concat.apply([], this.sources.map(function(source) { return source.files(); }));
};

Protofile.prototype.importPaths = function() {
  return [].concat.apply([], this.sources.map(function(source) { return source.importPaths(); }));
};

Protofile.protoCache = "./.git_proto_cache";
Protofile.outputDir  = "./protos";
Protofile.protoPaths = [];

exports.Protofile = Protofile;
