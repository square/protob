exports.Protob    = require('./lib/protob').Protob
exports.Compiler  = require('./lib/compiler').Compiler
exports.Message   = require('./lib/message').Protob
exports.Enum      = require('./lib/enum').Enum;
exports.EnumValue = require('./lib/enum').EnumValue;
exports.Service   = require('./lib/service').Service;

exports.Compiler.compile(); // compile the base protos
