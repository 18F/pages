// Author: Mike Bland (michael.bland@gsa.gov)
/* jshint node: true */

'use strict';

var fs = require('fs');
var path = require('path');
var buildLogger = require('./build-logger');
var fileLockedOperation = require('file-locked-operation');
var childProcess = require('child_process');
var config = require('./pages-config.json');

var exports = module.exports = {};

exports.PAGES_CONFIG = config.pagesConfig;

// asset_root: is used by the guides_style_18f gem to ensure that updates to
// common CSS and JavaScript files can be applied to Pages without having to
// update the gem.
exports.ASSET_ROOT = config.assetRoot;

// Creates an options object to pass to the SiteBuilder constructor
//
// Arguments:
//   info: GitHub webhook payload
//   repoDir: directory containing locally-cloned Pages repositories
//   destDir: path to the destination directory for published sites
//   sitePath: path to the repo on the local machine
//   git, bundler, jekyll, rsync: path to system binaries
//   rsyncOpts: options for the rsync binary
//
// With the exception of `info`, all of the arguments are added to the options
// object, with these additional fields (computed from info):
//   repoName: name of the repo belonging to the GitHub organization
//   sitePath: path to the repo of the specific Pages site being rebuilt
//   branch: branch of the Pages repository to check out and rebuild
function Options(info, repoDir, destDir, git, bundler, jekyll, rsync,
  rsyncOpts) {
  return {
    repoDir: repoDir,
    repoName: info.repository.name,
    sitePath: path.join(repoDir, info.repository.name),
    branch: info.ref.split('/').pop(),
    destDir: destDir,
    git: git,
    bundler: bundler,
    jekyll: jekyll,
    rsync: rsync,
    rsyncOpts: rsyncOpts
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
// updateLock: FileLockedOperation instance
// doneCallback: callback triggered when the algorithm exits; takes a single
//   `err` argument which will be nil on success, and an error string on
//   failure
function SiteBuilder(opts, buildLogger, updateLock, doneCallback) {
  this.repoDir = opts.repoDir;
  this.repoName = opts.repoName;
  this.sitePath = opts.sitePath;
  this.branch = opts.branch;
  this.logger = buildLogger;
  this.updateLock = updateLock;
  this.destDir = opts.destDir;
  this.buildDestination = path.join(opts.destDir, opts.repoName);
  this.git = opts.git;
  this.bundler = opts.bundler;
  this.jekyll = opts.jekyll;
  this.rsync = opts.rsync;
  this.rsyncOpts = opts.rsyncOpts;

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
  this.updateLock.doLockedOperation(function(done) {
    fs.exists(that.sitePath, function(exists) {
      (exists ? that.syncRepo() : that.cloneRepo())
        .then(function() { return that.checkForFile('_config.yml'); })
        .then(function(useJekyll) {
          return (useJekyll ? that._buildJekyll() : that._rsync());
        })
        .then(done, done);
    });
  }, this.done);
};

SiteBuilder.prototype._rsync = function() {
  return this.spawn(this.rsync,
    this.rsyncOpts.concat(['./', this.buildDestination]));
};

SiteBuilder.prototype._buildJekyll = function() {
  var that = this;
  return this.checkForFile('Gemfile')
    .then(function(usesBundler) { return that.updateBundle(usesBundler); })
    .then(function() { return that.checkForFile(exports.PAGES_CONFIG); })
    .then(function(fileExists) { return that.readOrWriteConfig(fileExists); })
    .then(function() { return that.jekyllBuild(); });
};

SiteBuilder.prototype.syncRepo = function() {
  this.logger.log('syncing repo:', this.repoName);
  var that = this;
  return this.spawn(this.git, ['stash'])
    .then(function() { that.spawn(that.git, ['pull']); });
};

SiteBuilder.prototype.cloneRepo = function() {
  this.logger.log('cloning', this.repoName, 'into', this.sitePath);

  var cloneAddr = 'git@github.com:' + config.githubOrg + '/' +
    this.repoName + '.git';
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

SiteBuilder.prototype.readOrWriteConfig = function(configExists) {
  var that = this;
  var configPath = path.join(that.sitePath, exports.PAGES_CONFIG);

  if (configExists) {
    this.logger.log('using existing', exports.PAGES_CONFIG);
    return new Promise(function(resolve, reject) {
      fs.readFile(configPath, 'utf8', function(err, data) {
        if (err) { return reject(err); }
        var baseurl = data.match(/baseurl: *\/(.+)/m);
        if (baseurl) {
          that.buildDestination = path.join(that.destDir, baseurl[1].trim());
        }
        resolve();
      });
    });
  }

  this.logger.log('generating', exports.PAGES_CONFIG);
  return new Promise(function(resolve, reject) {
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
  var commit = info.head_commit;  // jshint ignore:line
  var buildLog = builderOpts.sitePath + '.log';
  var logger = new buildLogger.BuildLogger(buildLog);
  logger.log(info.repository.full_name + ':',   // jshint ignore:line
    'starting build at commit', commit.id);
  logger.log('description:', commit.message);
  logger.log('timestamp:', commit.timestamp);
  logger.log('committer:', commit.committer.email);
  logger.log('pusher:', info.pusher.name, info.pusher.email);
  logger.log('sender:', info.sender.login);

  var lockfilePath = path.join(builderOpts.destDir,
    '.update-lock-' + builderOpts.repoName);
  var updateLock = new fileLockedOperation.FileLockedOperation(lockfilePath);
  var builder = new SiteBuilder(builderOpts, logger, updateLock, function(err) {
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
