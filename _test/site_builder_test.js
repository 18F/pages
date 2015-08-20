/* jshint node: true */
/* jshint expr: true */
/* jshint mocha: true */
'use strict';

var fs = require('fs');
var path = require('path');
var chai = require('chai');
var sinon = require('sinon');
var child_process = require('child_process');
var mock_spawn = require('mock-spawn');
var site_builder = require('../site-builder');
var build_logger = require('../build-logger');

var expect = chai.expect;
chai.should();

describe('SiteBuilder', function() {
  var builder, origSpawn, mySpawn, logger, log_mock, test_repo_dir, gemfile;

  before(function() {
    test_repo_dir = path.resolve(__dirname, 'site_builder_test');
    gemfile = path.resolve(test_repo_dir, 'Gemfile');
  });

  beforeEach(function() {
    origSpawn = child_process.spawn;
    mySpawn = mock_spawn();
    child_process.spawn = mySpawn;
    logger = new build_logger.BuildLogger('/dev/null');
    log_mock = sinon.mock(logger);
  });

  afterEach(function(done) {
    child_process.spawn = origSpawn;
    fs.exists(gemfile, function(exists) {
      if (exists) { fs.unlink(gemfile, done); } else { done(); }
    });
  });

  after(function(done) {
    fs.exists(test_repo_dir, function(exists) {
      if (exists) { fs.rmdir(test_repo_dir, done); } else { done(); }
    });
  });

  var spawn_calls = function() {
    return mySpawn.calls.map(function(value) {
      return value.command + ' ' + value.args.join(' ');
    });
  };

  var check = function(done, cb) {
    return function(err) { try { cb(err); done(); } catch (e) { done(e); } };
  };

  var create_repo_dir = function(done) {
    fs.mkdir(test_repo_dir, '0700', done);
  };

  var create_repo_with_gemfile = function(done) {
    create_repo_dir(function() { fs.writeFile(gemfile, '', done); });
  };

  var make_builder = function(site_path, done) {
    return new site_builder.SiteBuilder('repo_dir', 'repo_name', 'dest_dir',
      site_path, 'master', logger, 'git', 'bundle', 'jekyll', done);
  };

  it('should clone the repo if the directory does not exist', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    log_mock.expects('log').withExactArgs(
        'cloning', 'repo_name', 'into', 'new_dir');
    builder = make_builder('new_dir', check(done, function(err) {
      expect(err).to.be.null;
      expect(spawn_calls()).to.eql([
        'git clone git@github.com:18F/repo_name.git --branch master',
        'jekyll build --trace --destination dest_dir/repo_name',
      ]);
      log_mock.verify();
    }));
    builder.build();
  });

  it('should report an error if the clone fails', function(done) {
    mySpawn.sequence.add(mySpawn.simple(1));
    log_mock.expects('log').withExactArgs(
        'cloning', 'repo_name', 'into', 'new_dir');
    builder = make_builder('new_dir', check(done, function(err) {
      var clone_command = 
        'git clone git@github.com:18F/repo_name.git --branch master';
      expect(err).to.equal('Error: failed to clone repo_name with ' +
        'exit code 1 from command: ' + clone_command);
      expect(spawn_calls()).to.eql([clone_command]);
      log_mock.verify();
    }));
    builder.build();
  });

  it('should sync the repo if the directory already exists', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    log_mock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    create_repo_dir(function() {
      builder = make_builder(test_repo_dir, check(done, function(err) {
        expect(err).to.be.null;
        expect(spawn_calls()).to.eql([
          'git pull',
          'jekyll build --trace --destination dest_dir/repo_name',
        ]);
        log_mock.verify();
      }));
      builder.build();
    });
  });

  it ('should use bundler if a Gemfile is present', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    log_mock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    create_repo_with_gemfile(function() {
      builder = make_builder(test_repo_dir, check(done, function(err) {
        expect(err).to.be.null;
        expect(spawn_calls()).to.eql([
          'git pull',
          'bundle install',
          'bundle exec jekyll build --trace --destination dest_dir/repo_name',
        ]);
        log_mock.verify();
      }));
      builder.build();
    });
  });

  it ('should fail if bundle install fails', function(done) {
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(1));
    log_mock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    create_repo_with_gemfile(function() {
      builder = make_builder(test_repo_dir, check(done, function(err) {
        var bundle_install_command = 'bundle install';
        expect(err).to.equal('Error: rebuild failed for repo_name with ' +
          'exit code 1 from command: ' + bundle_install_command);
        expect(spawn_calls()).to.eql(['git pull', bundle_install_command]);
        log_mock.verify();
      }));
      builder.build();
    });
  });

  it ('should fail if jekyll build fails', function(done) {
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(1));
    log_mock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    create_repo_with_gemfile(function() {
      builder = make_builder(test_repo_dir, check(done, function(err) {
        var jekyll_build_command =
          'bundle exec jekyll build --trace --destination dest_dir/repo_name';
        expect(err).to.equal('Error: rebuild failed for repo_name with ' +
          'exit code 1 from command: ' + jekyll_build_command);
        expect(spawn_calls()).to.eql([
          'git pull', 'bundle install', jekyll_build_command]);
        log_mock.verify();
      }));
      builder.build();
    });
  });
});
