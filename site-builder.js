// Author: Mike Bland (michael.bland@gsa.gov)
/* jshint node: true */

'use strict';

var fs = require('fs');
var path = require('path');
var buildLogger = require('./build-logger');
var childProcess = require('child_process');

var exports = module.exports = {};

// Creates an options object to pass to the SiteBuilder constructor
//
// Arguments:
//   info: GitHub webhook payload
//   repoDir: directory containing locally-cloned Pages repositories
//   destDir: path to the destination directory for published sites
//   sitePath: path to the repo on the local machine
//   branch: the branch to publish
//
// With the exception of `info`, all of the arguments are added to the options
// object, with these additional fields (computed from info):
//   repoName: name of the repo belonging to the 18F GitHub organization
//   sitePath: path to the repo of the specific Pages site being rebuilt
//   branch: branch of the Pages repository to check out and rebuild
function SiteBuilderOptions(info, repoDir, destDir, git, bundler, jekyll) {
  return {
    repoDir: repoDir,
    repoName: info.repository.name,
    sitePath: path.join(repoDir, info.repository.name),
    branch: info.ref.split('/').pop(),
    destDir: destDir,
    git: git,
    bundler: bundler,
    jekyll: jekyll
  };
}

// Executes the algorithm for cloning/syncing repos and publishing sites.
// Patterned after the ControlFlow pattern used within Google.
//
// Once instantiated, users need only call build(), which is the entry point
// to the algorithm. All other methods are "states" of the algorithm/state
// machine that are executed asynchronously via callbacks.
//
// opts: SiteBuilderOptions object
// buildLogger: BuildLogger instance
// doneCallback: callback triggered when the algorithm exits; takes a single
//   `err` argument which will be nil on success, and an error string on
//   failure
function SiteBuilder(opts, buildLogger, doneCallback) {
  this.repoDir = opts.repoDir;
  this.repoName = opts.repoName;
  this.sitePath = opts.sitePath;
  this.branch = opts.branch;
  this.logger = buildLogger;
  this.buildDestination = path.join(opts.destDir, opts.repoName);
  this.git = opts.git;
  this.bundler = opts.bundler;
  this.jekyll = opts.jekyll;
  this.done = doneCallback;

  var that = this;
  this.spawn = function(path, args, next) {
    var opts = {cwd: that.sitePath, stdio: 'inherit'};

    childProcess.spawn(path, args, opts).on('close', function(code) {
      if (code !== 0) {
        that.done('Error: rebuild failed for ' + that.repoName +
          ' with exit code ' + code + ' from command: ' +
          path + ' ' + args.join(' '));
      } else {
        next();
      }
    });
  };
}

SiteBuilder.prototype.build = function() {
  if (fs.existsSync(this.sitePath)) {
    this.syncRepo();
  } else {
    this.cloneRepo();
  }
};

SiteBuilder.prototype.syncRepo = function() {
  this.logger.log('syncing repo:', this.repoName);

  var that = this;
  this.spawn(this.git, ['pull'], function() { that.checkForBundler(); });
};

SiteBuilder.prototype.cloneRepo = function() {
  this.logger.log('cloning', this.repoName, 'into', this.sitePath);

  var cloneAddr = 'git@github.com:18F/' + this.repoName + '.git';
  var cloneArgs = ['clone', cloneAddr, '--branch', this.branch];
  var cloneOpts = {cwd: this.repoDir, stdio: 'inherit'};
  var that = this;

  childProcess.spawn(this.git, cloneArgs, cloneOpts)
    .on('close', function(code) {
    if (code !== 0) {
      that.done('Error: failed to clone ' + that.repoName +
        ' with exit code ' + code + ' from command: ' +
        that.git + ' ' + cloneArgs.join(' '));
    } else {
      that.checkForBundler();
    }
  });
};

SiteBuilder.prototype.checkForBundler = function() {
  this.usesBundler = fs.existsSync(path.join(this.sitePath, 'Gemfile'));
  if (this.usesBundler) {
    this.updateBundle();
  } else {
    this.jekyllBuild();
  }
};

SiteBuilder.prototype.updateBundle = function() {
  var that = this;
  this.spawn(this.bundler, ['install'], function() { that.jekyllBuild(); });
};

SiteBuilder.prototype.jekyllBuild = function() {
  var jekyll = this.jekyll;
  var args = ['build', '--trace', '--destination', this.buildDestination];

  if (this.usesBundler) {
    jekyll = this.bundler;
    args = ['exec', 'jekyll'].concat(args);
  }
  var that = this;
  this.spawn(jekyll, args, function() { that.done(null); });
};

exports.launchBuilder = function (info, builderOpts) {
  var commit = info.headCommit;
  var buildLog = builderOpts.sitePath + '.log';
  var logger = new buildLogger.BuildLogger(buildLog);
  logger.log(info.repository.fullName + ':',
    'starting build at commit', commit.id);
  logger.log('description:', commit.message);
  logger.log('timestamp:', commit.timestamp);
  logger.log('committer:', commit.committer.email);
  logger.log('pusher:', info.pusher.name, info.pusher.email);
  logger.log('sender:', info.sender.login);

  var builder = new SiteBuilder(builderOpts, logger, function(err) {
    if (err !== null) {
      logger.error(err);
      logger.error(builderOpts.repoName + ': build failed');
    } else {
      logger.log(builderOpts.repoName + ': build successful');
    }

    // Provides https://pages.18f.gov/REPO-NAME/build.log as an indicator of
    // latest status.
    var newLogPath = path.join(
      builderOpts.destDir, builderOpts.repoName, 'build.log');
    fs.rename(buildLog, newLogPath, function(err) {
      if (err !== null) {
        console.error('Error moving build log from', buildLog, 'to',
          newLogPath);
      }
    });
  });
  builder.build();
};

exports.SiteBuilderOptions = SiteBuilderOptions;
exports.SiteBuilder = SiteBuilder;
