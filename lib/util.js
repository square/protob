/**
 * @module protob/util
 * A simple set of utilities
 */
exports.Util = {
  sortBy: function(fieldName) {
    return function(a, b) {
      if ( a[fieldName] < b[fieldName]) {
        return -1;
      } else if (a[fieldName] > b[fieldName] ) {
        return 1;
      } else {
        return 0;
      }
    };
  },
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
