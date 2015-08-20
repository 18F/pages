// Author: Mike Bland (michael.bland@gsa.gov)
/* jshint node: true */

'use strict';

var fs = require('fs');
var path = require('path');
var buildLogger = require('./build-logger');
var childProcess = require('child_process');

var exports = module.exports = {};

// Executes the algorithm for cloning/syncing repos and publishing sites.
// Patterned after the ControlFlow pattern used within Google.
//
// Once instantiated, users need only call build(), which is the entry point
// to the algorithm. All other methods are "states" of the algorithm/state
// machine that are executed asynchronously via callbacks.
//
// repoDir: directory containing locally-cloned Pages repositories
// repoName: name of the repo belonging to the 18F GitHub organization
// destDir: path to the destination directory for published sites
// sitePath: path to the repo on the local machine
// branch: the branch to publish
// buildLogger: BuildLogger instance
// doneCallback: callback triggered when the algorithm exits; takes a single
//   `err` argument which will be nil on success, and an error string on
//   failure
function SiteBuilder(repoDir, repoName, destDir, sitePath, branch,
  buildLogger, git, bundler, jekyll, doneCallback) {
  this.repoDir = repoDir;
  this.repoName = repoName;
  this.sitePath = sitePath;
  this.branch = branch;
  this.logger = buildLogger;
  this.buildDestination = path.join(destDir, repoName);
  this.git = git;
  this.bundler = bundler;
  this.jekyll = jekyll;
  this.done = doneCallback;

  this.spawn = function(path, args, next) {
    var opts = {cwd: sitePath, stdio: 'inherit'};

    childProcess.spawn(path, args, opts).on('close', function(code) {
      if (code !== 0) {
        doneCallback('Error: rebuild failed for ' + repoName +
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

exports.launchBuilder = function (info, destDir, repoDir, git, bundler,
  jekyll) {
  var repoName = info.repository.name;
  var branch = info.ref.split('/').pop();
  var sitePath = path.join(repoDir, repoName);
  var commit = info.headCommit;
  var buildLog = sitePath + '.log';
  var logger = new buildLogger.BuildLogger(buildLog);
  logger.log(info.repository.fullName + ':',
    'starting build at commit', commit.id);
  logger.log('description:', commit.message);
  logger.log('timestamp:', commit.timestamp);
  logger.log('committer:', commit.committer.email);
  logger.log('pusher:', info.pusher.name, info.pusher.email);
  logger.log('sender:', info.sender.login);

  var builder = new SiteBuilder(repoDir, repoName, destDir, sitePath,
    branch, logger, git, bundler, jekyll, function(err) {
      if (err !== null) {
        logger.error(err);
        logger.error(repoName + ': build failed');
      } else {
        logger.log(repoName + ': build successful');
      }

      // Provides https://pages.18f.gov/REPO-NAME/build.log as an indicator of
      // latest status.
      var newLogPath = path.join(destDir, repoName, 'build.log');
      fs.rename(buildLog, newLogPath, function(err) {
        if (err !== null) {
          console.error('Error moving build log from', buildLog, 'to',
            newLogPath);
        }
      });
    });
  builder.build();
};

exports.SiteBuilder = SiteBuilder;
