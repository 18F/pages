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
  var testRepoDir, fileToDelete, gemfile, pagesConfig;

  before(function() {
    testRepoDir = path.resolve(__dirname, 'siteBuilder_test');
    gemfile = path.resolve(testRepoDir, 'Gemfile');
    pagesConfig = path.resolve(testRepoDir, siteBuilder.PAGES_CONFIG);
  });

  beforeEach(function() {
    origSpawn = childProcess.spawn;
    mySpawn = mockSpawn();
    childProcess.spawn = mySpawn;
    logger = new buildLogger.BuildLogger('/dev/null');
    logMock = sinon.mock(logger);
  });

  afterEach(function(done) {
    childProcess.spawn = origSpawn;

    var removeFileToDelete = new Promise(function(resolve, reject) {
      if (!fileToDelete) { return resolve(); }
      fs.unlink(fileToDelete, function(err) {
        if (err) { reject(err); } else { resolve(); }
      });
    });

    var removeRepoDir = function() {
      return new Promise(function(resolve, reject) {
        fs.exists(testRepoDir, function(exists) {
          if (!exists) { return resolve(); }
          fs.rmdir(testRepoDir, function(err) {
            if (err) { reject(err); } else { resolve(); }
          });
        });
      });
    };
    removeFileToDelete.then(removeRepoDir).then(done, done);
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

  it('should write the expected configuration', function(done) {
    // Note the builder.done callback wrapper will remove the generated config.
    builder = makeBuilder(testRepoDir, function() {});
    logMock.expects('log').withExactArgs(
      'generating', siteBuilder.PAGES_CONFIG);
    logMock.expects('log').withExactArgs(
      'removing generated', siteBuilder.PAGES_CONFIG);

    var inRepoDir = new Promise(function(resolve, reject) {
      createRepoDir(function(err) {
        if (err) { reject(err); } else { resolve(); }
      });
    });

    var writeConfig = function() {
      var configExists;
      return builder.writeConfig(configExists = false);
    };

    var readConfig = function() {
      expect(builder.generatedConfig).to.be.true;
      return new Promise(function(resolve, reject) {
        fs.readFile(pagesConfig, function(err, data) {
          if (err) { reject(err); } else { resolve(data.toString()); }
        });
      });
    };

    var checkResults = function(content) {
      expect(content).to.equal('baseurl: /repo_name\n' +
        'asset_root: ' + siteBuilder.ASSET_ROOT + '\n');
      builder.done();
      logMock.verify();
    };

    inRepoDir
      .then(writeConfig)
      .then(readConfig)
      .then(checkResults)
      .then(done, done);
  });

  it('should clone the repo if the directory does not exist', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    mySpawn.sequence.add(function(done) {
      createRepoDir(function() { done(0); });
    });

    logMock.expects('log').withExactArgs(
      'cloning', 'repo_name', 'into', testRepoDir);
    logMock.expects('log').withExactArgs(
      'generating', siteBuilder.PAGES_CONFIG);
    logMock.expects('log').withExactArgs(
      'removing generated', siteBuilder.PAGES_CONFIG);
    builder = makeBuilder(testRepoDir, check(done, function(err) {
      expect(err).to.be.undefined;
      expect(spawnCalls()).to.eql([
        'git clone git@github.com:18F/repo_name.git --branch 18f-pages',
        'jekyll build --trace --destination dest_dir/repo_name ' +
          '--config _config.yml,_config_18f_pages.yml',
      ]);
      logMock.verify();
    }));
    builder.build();
  });

  it('should report an error if the clone fails', function(done) {
    mySpawn.sequence.add(mySpawn.simple(1));
    logMock.expects('log').withExactArgs(
      'cloning', 'repo_name', 'into', testRepoDir);
    builder = makeBuilder(testRepoDir, check(done, function(err) {
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
    logMock.expects('log').withExactArgs(
      'generating', siteBuilder.PAGES_CONFIG);
    logMock.expects('log').withExactArgs(
      'removing generated', siteBuilder.PAGES_CONFIG);
    createRepoDir(function() {
      builder = makeBuilder(testRepoDir, check(done, function(err) {
        expect(err).to.be.undefined;
        expect(spawnCalls()).to.eql([
          'git pull',
          'jekyll build --trace --destination dest_dir/repo_name ' +
            '--config _config.yml,_config_18f_pages.yml',
        ]);
        logMock.verify();
      }));
      builder.build();
    });
  });

  it ('should use bundler if a Gemfile is present', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    logMock.expects('log').withExactArgs(
      'generating', siteBuilder.PAGES_CONFIG);
    logMock.expects('log').withExactArgs(
      'removing generated', siteBuilder.PAGES_CONFIG);
    createRepoWithFile(gemfile, function() {
      builder = makeBuilder(testRepoDir, check(done, function(err) {
        expect(err).to.be.undefined;
        expect(spawnCalls()).to.eql([
          'git pull',
          'bundle install',
          'bundle exec jekyll build --trace --destination dest_dir/repo_name ' +
            '--config _config.yml,_config_18f_pages.yml',
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
    logMock.expects('log').withExactArgs(
      'generating', siteBuilder.PAGES_CONFIG);
    logMock.expects('log').withExactArgs(
      'removing generated', siteBuilder.PAGES_CONFIG);
    createRepoWithFile(gemfile, function() {
      builder = makeBuilder(testRepoDir, check(done, function(err) {
        var jekyllBuildCommand =
          'bundle exec jekyll build --trace --destination dest_dir/repo_name ' +
            '--config _config.yml,_config_18f_pages.yml';
        expect(err).to.equal('Error: rebuild failed for repo_name with ' +
          'exit code 1 from command: ' + jekyllBuildCommand);
        expect(spawnCalls()).to.eql([
          'git pull', 'bundle install', jekyllBuildCommand]);
        logMock.verify();
      }));
      builder.build();
    });
  });

  it('should not generate _config_18f_pages.yml if present', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    logMock.expects('log').withExactArgs(
      'using existing', siteBuilder.PAGES_CONFIG);
    createRepoWithFile(pagesConfig, function() {
      builder = makeBuilder(testRepoDir, check(done, function(err) {
        expect(err).to.be.undefined;
        expect(spawnCalls()).to.eql([
          'git pull',
          'jekyll build --trace --destination dest_dir/repo_name ' +
            '--config _config.yml,_config_18f_pages.yml',
        ]);
        logMock.verify();
      }));
      builder.build();
    });
  });
});
