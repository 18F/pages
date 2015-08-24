/* jshint node: true */
/* jshint expr: true */
/* jshint mocha: true */
'use strict';

var path = require('path');
var fs = require('fs');
var chai = require('chai');
var sinon = require('sinon');
var buildLogger = require('../build-logger.js');

var expect = chai.expect;
chai.should();

describe('BuildLogger', function() {
  var logger, logFileDir, logFilePath;

  before(function() {
    logFileDir = path.resolve(__dirname, 'buildLogger_test');
    logFilePath = path.resolve(logFileDir, 'build.log');
  });

  beforeEach(function(done) {
    fs.exists(logFileDir, function(exists) {
      (exists ? fs.chmod : fs.mkdir)(logFileDir, '0700', done);
    });
  });

  afterEach(function(done) {
    fs.exists(logFilePath, function(exists) {
      if (exists) { fs.unlink(logFilePath, done); } else { done(); }
    });
  });

  after(function(done) {
    fs.exists(logFileDir, function(exists) {
      if (exists) { fs.rmdir(logFileDir, done); } else { done(); }
    });
  });

  var makeLogger = function(done) {
    return new buildLogger.BuildLogger(logFilePath, done);
  };

  var captureLogs = function() {
    sinon.stub(console, 'log').returns(0);
    sinon.stub(console, 'error').returns(0);
  };

  var restoreLogs = function() {
    console.error.restore();
    console.log.restore();
  };

  var checkN = function(n, done, cb) {
    return function(err) {
      if (--n === 0) {
        try {
          cb(err);
          restoreLogs();
          done();
        } catch (e) {
          restoreLogs();
          done(e);
        }
      }
    };
  };

  it ('should fail if the file cannot be written to', function(done) {
    logger = makeLogger(checkN(2, done, function() {
      var expectedError = 'Error: EACCES, open \'' + logFilePath + '\'';
      // I expected the following to succeed, since the failing call happens
      // after the successful call:
      //
      // expect(err).to.equal(expectedError);
      //
      // But here's the thing: It takes longer to flush the first, successful
      // call than it does to change the file permission and make the second 
      // call fail.
      expect(console.log.called).to.be.true;
      expect(console.log.args[0].join(' '))
        .to.equal('This should be logged to the file');
      expect(fs.readFileSync(logFilePath).toString())
        .to.equal('This should be logged to the file\n');
      expect(console.log.args[1].join(' '))
        .to.equal('This should not be logged to the file');
      expect(console.error.called).to.be.true;
      expect(console.error.args[0].join(' '))
        .to.equal('Error: failed to append to log file ' + logFilePath +
          ': ' + expectedError);
    }));

    captureLogs();
    logger.log('This should be logged to the file');

    fs.chmod(logFilePath, '400', function(err) {
      if (err) {
        done(err);
        return;
      }
      logger.log('This should not be logged to the file');
    });
  });

  it('should log everything to the file', function(done) {
    logger = makeLogger(checkN(2, done, function(err) {
      expect(err).to.be.null;
      expect(console.log.called).to.be.true;
      expect(console.log.args[0].join(' '))
        .to.equal('This should be logged to the file');
      expect(console.error.called).to.be.true;
      expect(console.error.args[0].join(' '))
        .to.equal('This should also be logged to the file');
      expect(fs.readFileSync(logFilePath).toString())
        .to.equal('This should be logged to the file\n' +
          'This should also be logged to the file\n');
    }));
    captureLogs();
    logger.log('This should be logged to the file');
    logger.error('This should also be logged to the file');
  });
});
