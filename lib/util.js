exports.Util = {
  sortByLength: function(a,b) {
    if ( a.length < b.length ) {
      return -1;
    } else if (a.length > b.length ) {
      return 1;
    } else {
      return 0;
    }
  },
};
