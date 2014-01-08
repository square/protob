/**
 * @module protob/util
 * A simple set of utilities
 */
exports.Util = {
  /**
   * A sort by length of string function
   * @function
   * @example
   *     someArrayOfStrings.sort(Util.sortByLength)
   * @private
   */
  sortByLength: function(a,b) {
    if ( a.length < b.length ) {
      return -1;
    } else if (a.length > b.length ) {
      return 1;
    } else {
      return 0;
    }
  }
};
