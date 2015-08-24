/* jshint node: true */
/* jshint expr: true */
/* jshint mocha: true */
'use strict';

var fs = require('fs');
var path = require('path');
var chai = require('chai');
var sinon = require('sinon');
var childProcess = require('child_process');
var mockSpawn = require('mock-spawn');
var siteBuilder = require('../site-builder');
var buildLogger = require('../build-logger');

var expect = chai.expect;
chai.should();

describe('SiteBuilder', function() {
  var builder, origSpawn, mySpawn, logger, logMock;
  var testRepoDir, fileToDelete, gemfile;

  before(function() {
    testRepoDir = path.resolve(__dirname, 'siteBuilder_test');
    gemfile = path.resolve(testRepoDir, 'Gemfile');
  });

  beforeEach(function() {
    origSpawn = childProcess.spawn;
    mySpawn = mockSpawn();
    childProcess.spawn = mySpawn;
    logger = new buildLogger.BuildLogger('/dev/null');
    logMock = sinon.mock(logger);
  });

  afterEach(function(done) {
    if (fileToDelete === undefined) {
      done();
      return;
    }
    childProcess.spawn = origSpawn;
    fs.exists(fileToDelete, function(exists) {
      if (exists) { fs.unlink(fileToDelete, done); } else { done(); }
    });
  });

  after(function(done) {
    fs.exists(testRepoDir, function(exists) {
      if (exists) { fs.rmdir(testRepoDir, done); } else { done(); }
    });
  });

  var spawnCalls = function() {
    return mySpawn.calls.map(function(value) {
      return value.command + ' ' + value.args.join(' ');
    });
  };

  var check = function(done, cb) {
    return function(err) { try { cb(err); done(); } catch (e) { done(e); } };
  };

  var createRepoDir = function(done) {
    fs.mkdir(testRepoDir, '0700', done);
  };

  var createRepoWithFile = function(filename, done) {
    fileToDelete = filename;
    createRepoDir(function() { fs.writeFile(filename, '', done); });
  };

  var makeBuilder = function(sitePath, done) {
    var info = {
      repository: {
        name: 'repo_name'
      },
      ref: 'refs/heads/18f-pages'
    };
    var opts = new siteBuilder.Options(info, 'repo_dir', 'dest_dir',
      'git', 'bundle', 'jekyll');
    opts.sitePath = sitePath;
    return new siteBuilder.SiteBuilder(opts, logger, done);
  };

  it('should clone the repo if the directory does not exist', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs(
        'cloning', 'repo_name', 'into', 'new_dir');
    builder = makeBuilder('new_dir', check(done, function(err) {
      expect(err).to.be.undefined;
      expect(spawnCalls()).to.eql([
        'git clone git@github.com:18F/repo_name.git --branch 18f-pages',
        'jekyll build --trace --destination dest_dir/repo_name',
      ]);
      logMock.verify();
    }));
    builder.build();
  });

  it('should report an error if the clone fails', function(done) {
    mySpawn.sequence.add(mySpawn.simple(1));
    logMock.expects('log').withExactArgs(
        'cloning', 'repo_name', 'into', 'new_dir');
    builder = makeBuilder('new_dir', check(done, function(err) {
      var cloneCommand = 
        'git clone git@github.com:18F/repo_name.git --branch 18f-pages';
      expect(err).to.equal('Error: failed to clone repo_name with ' +
        'exit code 1 from command: ' + cloneCommand);
      expect(spawnCalls()).to.eql([cloneCommand]);
      logMock.verify();
    }));
    builder.build();
  });

  it('should sync the repo if the directory already exists', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    createRepoDir(function() {
      builder = makeBuilder(testRepoDir, check(done, function(err) {
        expect(err).to.be.undefined;
        expect(spawnCalls()).to.eql([
          'git pull',
          'jekyll build --trace --destination dest_dir/repo_name',
        ]);
        logMock.verify();
      }));
      builder.build();
    });
  });

  it ('should use bundler if a Gemfile is present', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    createRepoWithFile(gemfile, function() {
      builder = makeBuilder(testRepoDir, check(done, function(err) {
        expect(err).to.be.undefined;
        expect(spawnCalls()).to.eql([
          'git pull',
          'bundle install',
          'bundle exec jekyll build --trace --destination dest_dir/repo_name',
        ]);
        logMock.verify();
      }));
      builder.build();
    });
  });

  it ('should fail if bundle install fails', function(done) {
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(1));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    createRepoWithFile(gemfile, function() {
      builder = makeBuilder(testRepoDir, check(done, function(err) {
        var bundleInstallCommand = 'bundle install';
        expect(err).to.equal('Error: rebuild failed for repo_name with ' +
          'exit code 1 from command: ' + bundleInstallCommand);
        expect(spawnCalls()).to.eql(['git pull', bundleInstallCommand]);
        logMock.verify();
      }));
      builder.build();
    });
  });

  it ('should fail if jekyll build fails', function(done) {
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(1));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    createRepoWithFile(gemfile, function() {
      builder = makeBuilder(testRepoDir, check(done, function(err) {
        var jekyllBuildCommand =
          'bundle exec jekyll build --trace --destination dest_dir/repo_name';
        expect(err).to.equal('Error: rebuild failed for repo_name with ' +
          'exit code 1 from command: ' + jekyllBuildCommand);
        expect(spawnCalls()).to.eql([
          'git pull', 'bundle install', jekyllBuildCommand]);
        logMock.verify();
      }));
      builder.build();
    });
  });

});
