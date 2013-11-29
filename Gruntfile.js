var exec = require('child_process').exec;
module.exports = function(grunt){
  grunt.loadNpmTasks('grunt-simple-mocha');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    simplemocha: {
      options: {
        reporter: 'spec',
        slow: 200,
        timeout: 1000,
        ui: 'bdd'
      },
      all: { src: ['test/test_helper.js', 'test/**/*_test.js'] }
    },
    watch:{
      test: {
        files: ['lib/**/*.js', 'test/**/*_test.js'],
        tasks: ['test'],
        options: {
          spawn: true,
          debounceDelay: 250
        }
      }
    }
  });

  grunt.registerTask("test", ['simplemocha:all']);
  grunt.registerTask("dev", ['watch:test']);
};
