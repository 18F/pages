// Author: Mike Bland (michael.bland@gsa.gov)
/* jshint node: true */

'use strict';

var fs = require('fs');
var exports = module.exports = {};

// Message logger that logs both to the console and a repo-specific build.log.
function BuildLogger(logFilePath, writeCb) {
  this.logWrite = function(message) {
    fs.appendFile(logFilePath, message + '\n', function(err) {
      if (err !== null) {
        console.error('Error: failed to append to log file',
          logFilePath + ':', err);
      }
      if (writeCb !== undefined) {
        writeCb(err);
      }
    });
  };
}

BuildLogger.prototype.log = function() {
  var message = Array.prototype.slice.call(arguments).join(' ');
  console.log(message);
  this.logWrite(message);
};

BuildLogger.prototype.error = function() {
  var message = Array.prototype.slice.call(arguments).join(' ');
  console.error(message);
  this.logWrite(message);
};

exports.BuildLogger = BuildLogger;
