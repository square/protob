/**
 * Adds an initialize lifecycle initializer to Steven applications to compile protos.
 *
 * Configuration values avaialble:
 * <ul>
 *   <li>protoDir - The directory path to your compiled protocol buffer. By default, {appDir}/protos</li>
 * </ul>
 *
 * Lifecycles:
 * <ul>
 *   <li>initialize.setup 'protob.compile' - Loads the compiled protocol buffers for the project</li>
 * </ul>
 *
 * @param {function} - The Steven function that the application knows about
 * @example
 *    require('protob').stevenInit(require('steven'));
 * @private
 */
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
