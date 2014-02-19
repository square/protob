/**
 * Manages protofiles (protos.json), tracks, merges and deals with fetching repos and scanning for files
 *
 * The Protofile will manage multiple proto.json files and merge the sources and paths to ensure that
 * all protos are able to be compiled
 *
 * When git repos are fetched, they will be stored in .git_repo_cache/{repo_name}
 *
 * @module protob/compiler/protofile
 * @exports Protofile
 * @example
 *     // An example proto.json file
 *    [
 *      {
 *        "git": "git@github.com:user/my_project.git",
 *        this.basepath = Path.join(".", Protofile.protoCache, this.name,
 *        "paths": {
 *          "import/path/from/repo/root": ["relative/path/to/protos"]
 *          "google/src/main/proto": ["/"],
 *          "rpcs/src/main/proto": ["my_namespace/rpcs"],
 *        }
 *      },
 *      {
 *         "local": "/Users/humpledink/Development/project",
 *         "paths": {
 *           "protos": ["/"]
 *         }
 *      },
 *      {
 *        "nexus": "https://nexus.corp.squareup.com",
 *        "repository": "releases",
 *        "group_id": "com.squareup.protos",
 *        "artifact_id": "all-protos",
 *        "version": "LATEST",
 *        "paths": {
 *          "/": [
 *            "squareup/logging/http.proto",
 *            "squareup/api",
 *            "squareup/items",
 *            "squareup/cogs",
 *            "squareup/opt",
 *            "squareup/objc",
 *            "squareup/common",
 *            "squareup/multipass"
 *          ]
 *        }
 *
 *    ]
 *
 */
var Glob = require('glob');
var Q    = require('q');
var fs   = require('fs');
var exec = require('child_process').exec;
var Protofile;
var Path = require('path');

/**
 * A source of protofiles
 * This can be local or git.
 * @param {object} sourceDef - The source definition of your protos
 * @param {string} [sourceDef.git] - The git repo address that should be cloned of updated
 * @param {string} [sourceDef.branch] - The git repo branch to use
 * @param {string} [sourceDef.local] - The path on your local file system that should be checked
 * @param {object} sourceDef.paths - An object where key is the import path relative to git/local, and the values are arrays of paths from the import paths to scan. These can be directories that will be scanned for .proto files or paths to specific .proto files
 * @protected
 * @constructor
 */
function Source(sourceDef){
  /**
   * @member {boolean} - True if the code has been fetched
   * @private
   */
  var fetched = false;
  var self = this;

  /** @member {object} - The import -> [relative paths to protos] object */
  this.paths = sourceDef.paths || {};
  if ( sourceDef.git ) {
    /** @member {string} - The git repo address */
    this.git = sourceDef.git;
    /** @member {string} - The git repo branch */
    this.branch = sourceDef.branch || 'master';
  } else if ( sourceDef.nexus ){
    this.nexus = sourceDef.nexus;
  } else if ( sourceDef.local ) {
    /** @member {boolean} - True if local */
    this.local = true;
    /** @member {string} - The base path that should be used for these protos */
    this.basePath = sourceDef.local;
  } else {
    throw("Unknown source type");
  }

  /**
   * Fetches the repo for git repository
   * @return {promise} - Resolved when completed
   */
  this.fetch = function(){
    if ( this.fetched || this.local ) { return Q.fcall(function() { return true; }); }
    if( this.git ) return this.fetchFromGit();
    if( this.nexus ) return this.fetchFromNexus();
  };

  if (this.git) {
    this.basePath = Path.join(".", Protofile.protoCache, Path.basename(this.git, ".git"));
  }

  if (this.nexus) {
    sourceDef.version = sourceDef.version || 'LATEST';
    this.basePath = Path.join(".", Protofile.protoCache, sourceDef.artifact_id);
    this.artifact_id = sourceDef.artifact_id;

    this.url = require('url').parse(this.nexus);
    this.url.pathname = "/service/local/artifact/maven/content";
    this.url.query = {
      r: sourceDef.repository,
      g: sourceDef.group_id,
      a: sourceDef.artifact_id,
      v: sourceDef.version
    };
  }

  this.addPaths(sourceDef);
};

/**
 * Adds path to this source without duplicating
 * @param {object} source - The source definition from the protos.json file
 * @private
 */
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
        this.paths[keys[i]] = source.paths[keys[i]];
      }
    }
  }
};

/**
 * The list of import paths for handing to protoc
 * @public
 * @return {array} - An array of directories to hand to the protoc command line tool
 */
Source.prototype.importPaths = function() {
  var out = [],
      self = this;

  return Object.keys(this.paths).map(function(pth) {
    return Path.resolve(Path.join(self.basePath, pth));
  });
};

/**
 * The complete list of files found under the paths specified in the protos.json file
 * @public
 * @return {array} - File paths to compile
 */
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

/**
 * Fetches (clones or updates) a git repo
 * @return {promise} - Resolved when the repo is cloned or updated
 * @private
 */
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

Source.prototype.fetchFromNexus = function(){
  if(!this.nexus) return Q();

  var defer = Q.defer(),
      self = this,
      fileName = self.basePath + ".zip",
      start = Date.now(),
      opts = require('url').parse(this.url.format());

  console.log("Fetching from nexus:", this.url.format());

  require('rimraf').sync(this.basePath);

  if ( !fs.existsSync(Protofile.protoCache) ) fs.mkdirSync(Protofile.protoCache);
  if ( !fs.existsSync(this.basePath) ) fs.mkdirSync(this.basePath);

  opts.rejectUnauthorized = false;

  require('https').get(opts, function(res){
    var extractor = require('unzip').Extract({path: self.basePath});

    res.pipe(extractor);

    res.on('error',       function(err){ console.log("Response error:", err); defer.reject(err) });
    extractor.on('error', function(err){ console.log("Response error:", err); defer.reject(err) });
    extractor.on('close', function(){

      var finish = (Date.now() - start) / 1000;
      console.log("Done fetching from nexus (", self.basePath, ") in " + finish + "s");
      defer.resolve();
    });
  });
  return defer.promise;
}


var Protofile = function(){
  var self = this;
  /** @member {array} - An array of Sources */
  this.sources = [];
  /** @member {array} - All paths specified in the proto.json file */
  this.allPaths = [];
  /** @member {array} - All paths found when the paths are globbed for .proto files */
  this.foundPaths = {};

  Protofile.protoPaths.forEach(function(path){
    var json = JSON.parse(fs.readFileSync(Path.resolve(path)));
    json.forEach(function(src) { self.addSource(src); });
  });
};

/**
 * Adds a source definition
 * @param {object} source - The source definition from the protos.json file
 * @private
 */
Protofile.prototype.addSource = function(source){
  var existing;
  if(source.git) {
    existing = this.sources.filter(function(src){ return src.git == source.git; })[0];
  } else if(source.nexus){
    existing = this.sources.filter(function(src){
      if(!src.nexus) return false;
      return src.nexus && src.nexus == source.nexus && source.artifact_id == src.artifact_id;
    })[0];
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

/**
 * Resolves all the files from the sources
 * @return {promise} - Resolved when the paths are all resolved
 * @private
 */
Protofile.prototype.resolve = function(){
  var ps = this.sources.map(function(source) { return source.fetch(); });
  return Q.all(ps);
};

/**
 * Returns all files from all sources
 * @return {array} - file paths
 * @private
 */
Protofile.prototype.files = function(){
  return [].concat.apply([], this.sources.map(function(source) { return source.files(); }));
};

/**
 * Returns all import paths from all sources
 * @return {array} - Import paths
 * @private
 */
Protofile.prototype.importPaths = function() {
  return [].concat.apply([], this.sources.map(function(source) { return source.importPaths(); }));
};

/** @member {string} - The string path of the proto cache directory */
Protofile.protoCache = "./.git_proto_cache";
/** @member {string} - The string file path of the directory to output the compiled .json files to */
Protofile.outputDir  = "./protos";

/** @member {string} - Paths for protos.json files */
Protofile.protoPaths = [];

exports.Protofile = Protofile;
