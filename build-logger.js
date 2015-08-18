// Author: Mike Bland (michael.bland@gsa.gov)
/* jshint node: true */

'use strict';

var fs = require('fs');
var exports = module.exports = {};

// Message logger that logs both to the console and a repo-specific build.log.
function BuildLogger(log_file_path) {
  this.log_write = function(message) {
    fs.appendFile(log_file_path, message + '\n', function(err) {
      if (err !== null) {
        console.error('Error: failed to append to log file',
          log_file_path + ':', err);
      }
    });
  };
}

BuildLogger.prototype.log = function() {
  var message = Array.prototype.slice.call(arguments).join(' ');
  console.log(message);
  this.log_write(message);
};

BuildLogger.prototype.error = function() {
  var message = Array.prototype.slice.call(arguments).join(' ');
  console.error(message);
  this.log_write(message);
};

exports.BuildLogger = BuildLogger;
