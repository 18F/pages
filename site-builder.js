// Author: Mike Bland (michael.bland@gsa.gov)
/* jshint node: true */

'use strict';

var fs = require('fs');
var path = require('path');
var buildLogger = require('./build-logger');
var childProcess = require('child_process');

var exports = module.exports = {};

exports.PAGES_CONFIG = '_config_18f_pages.yml';

// asset_root: is used by the guides_style_18f gem to ensure that updates to
// common CSS and JavaScript files can be applied to 18F Pages without having
// to update the gem.
exports.ASSET_ROOT = '/guides-template';

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
function Options(info, repoDir, destDir, git, bundler, jekyll) {
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
// opts: Options object
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

  var that = this;

  this.done = function(err) {
    if (that.generatedConfig) {
      that.logger.log('removing generated', exports.PAGES_CONFIG);
      var configPath = path.join(that.sitePath, exports.PAGES_CONFIG);
      fs.unlink(configPath, function(unlinkErr) {
        if (unlinkErr) {
          that.logger.log('error removing ' + configPath + ': ' + unlinkErr);
        }
        doneCallback(err);
      });
    } else {
      doneCallback(err);
    }
  };

  this.spawn = function(path, args) {
    return new Promise(function(resolve, reject) {
      var opts = {cwd: that.sitePath, stdio: 'inherit'};

      childProcess.spawn(path, args, opts).on('close', function(code) {
        if (code !== 0) {
          reject('Error: rebuild failed for ' + that.repoName +
            ' with exit code ' + code + ' from command: ' +
            path + ' ' + args.join(' '));
        } else {
          resolve();
        }
      });
    });
  };
}

SiteBuilder.prototype.build = function() {
  var that = this;
  fs.exists(this.sitePath, function(exists) {
    (exists === true ? that.syncRepo() : that.cloneRepo())
      .then(function() { return that.checkForFile('Gemfile'); })
      .then(function(usesBundler) { return that.updateBundle(usesBundler); })
      .then(function() { return that.checkForFile(exports.PAGES_CONFIG); })
      .then(function(configExists) { return that.writeConfig(configExists); })
      .then(function() { return that.jekyllBuild(); })
      .then(that.done, that.done);
  });
};

SiteBuilder.prototype.syncRepo = function() {
  this.logger.log('syncing repo:', this.repoName);
  return this.spawn(this.git, ['pull']);
};

SiteBuilder.prototype.cloneRepo = function() {
  this.logger.log('cloning', this.repoName, 'into', this.sitePath);

  var cloneAddr = 'git@github.com:18F/' + this.repoName + '.git';
  var cloneArgs = ['clone', cloneAddr, '--branch', this.branch];
  var cloneOpts = {cwd: this.repoDir, stdio: 'inherit'};
  var that = this;

  return new Promise(function(resolve, reject) {
    childProcess.spawn(that.git, cloneArgs, cloneOpts)
      .on('close', function(code) {
      if (code !== 0) {
        reject('Error: failed to clone ' + that.repoName +
          ' with exit code ' + code + ' from command: ' +
          that.git + ' ' + cloneArgs.join(' '));
      } else {
        resolve();
      }
    });
  });
};

SiteBuilder.prototype.checkForFile = function(filePath) {
  var that = this;
  return new Promise(function(resolve) {
    fs.exists(path.join(that.sitePath, filePath), resolve);
  });
};

SiteBuilder.prototype.updateBundle = function(usesBundler) {
  if (!usesBundler) {
    return;
  }
  this.usesBundler = usesBundler;
  return this.spawn(this.bundler, ['install']);
};

SiteBuilder.prototype.writeConfig = function(configExists) {
  if (configExists) {
    this.logger.log('using existing', exports.PAGES_CONFIG);
    return;
  }
  this.logger.log('generating', exports.PAGES_CONFIG);

  var that = this;
  return new Promise(function(resolve, reject) {
    var configPath = path.join(that.sitePath, exports.PAGES_CONFIG);
    var content = 'baseurl: /' + that.repoName + '\n' +
      'asset_root: ' + exports.ASSET_ROOT + '\n';
    fs.writeFile(configPath, content, function(err) {
      if (err) { return reject(err); }
      that.generatedConfig = true;
      resolve();
    });
  });
};

SiteBuilder.prototype.jekyllBuild = function() {
  var jekyll = this.jekyll;
  var args = ['build', '--trace', '--destination', this.buildDestination,
    '--config', '_config.yml,_config_18f_pages.yml'];

  if (this.usesBundler) {
    jekyll = this.bundler;
    args = ['exec', 'jekyll'].concat(args);
  }
  return this.spawn(jekyll, args);
};

exports.launchBuilder = function (info, builderOpts) {
  var commit = info.head_commit;
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
    if (err !== undefined) {
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

exports.Options = Options;
exports.SiteBuilder = SiteBuilder;
