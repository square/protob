require('./test_helper');
var Assert = require('assert'),
    Path = require('path'),
    Protob = require('../index').Protob,
    reg = Protob.registry,
    Promise = require('bluebird'),
    MyService, Character, Stuff;

describe('Service', function() {
  beforeEach(function() {
    MyService = reg.lookup('test.fox.simpsons.MyService');
    Character = reg.lookup('test.fox.simpsons.Character');
    Stuff = reg.lookup('test.fox.simpsons.Stuff');
  });

  it('has the descriptor', function() {
    Assert.equal(!!MyService.descriptor, true);
  });

  describe('.handler', function() {
    var service, method;

    beforeEach(function() {
      method = MyService.methods.SomeMethod;
      MyService.handler('SomeMethod', function(req) {
        return { string_value: 'hai' };
      });
      service = new MyService();
    });

    it('fails to setup a handler for a non-existant method', function() {
      Assert.throws(function() {
        MyService.handler('AMethodThatDoesNotExist', function() {});
      });
    });

    it('fails if the input type is wrong', function(done) {
      var stuff = new Stuff();
      service.SomeMethod(stuff)
      .then(function() { console.error("DONE"); done(new Error('Expected an exception')); })
      .catch(function(err) {
        Assert.equal(err.status, 400);
        Assert.equal(err.statusCode, 400);
        done();
      }).catch(done);
    });

    it('coorces the input type', function(done) {
      MyService.handler('SomeMethod', function(req) {
        Assert.equal(req instanceof method.inputType, true);
        Assert.equal(req.getf('name'), 'Homer');
        return { string_value: 'hai' };
      });

      service.SomeMethod({name: 'Homer'})
      .then(function() { done(); })
      .catch(done);
    });

    it('handles empty things', function(done) {
      MyService.handler('SomeMethod', function(req) {
        Assert.equal(req instanceof method.inputType, true);
        return { string_value: 'hai' };
      });

      service.SomeMethod()
      .then(function() { done(); })
      .catch(done);
    });

    it('does not coorce the input type if it is the correct type', function(done) {
      var request = new Character({name: 'Homer'});

      MyService.handler('SomeMethod', function(req) {
        Assert.equal(req === request, true);
        return { string_value: 'hai' };
      });

      service.SomeMethod(request)
      .then(function() { done(); })
      .catch(done);
    });

    it('coorces the output type', function(done) {
      service.SomeMethod()
      .then(function(res) {
        Assert.equal(res instanceof method.outputType, true);
        done();
      }).catch(done);
    })

    it('does not coorce output if it is the correct type', function(done) {
      var response;
      MyService.handler('SomeMethod', function(req) {
        response = new Stuff();
        return response;
      });

      service.SomeMethod()
      .then(function(res) {
        Assert.equal(res === response, true);
        done();
      }).catch(done);
    });
  });
});
