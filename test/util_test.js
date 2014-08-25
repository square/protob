require('./test_helper');
var Assert = require('assert');
var Util   = require('../lib/util').Util;

describe("util", function(){
  describe("sortByLength", function(){
    it("sorts by string length", function() {
      var arry = ["aa", "aaaaa", "a", "aaaa", "aaa"];
      var expected = ["a", "aa", "aaa", "aaaa", "aaaaa"];
      var outcome = arry.sort(Util.sortByLength);
      Assert.deepEqual(expected, outcome);
    });
  });
});
