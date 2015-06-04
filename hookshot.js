#! /usr/bin/env node
//
// Webhook listener implementing https://pages.18f.gov/ publishing.
//
// The hookshot() call near the end sets up and launches the actual listener.
//
// For instructions on how to publish, see:
// - https://github.com/18F/pages/
// - https://pages.18f.gov/guides-template/
//
// Author: Mike Bland (michael.bland@gsa.gov)
// Date:   2015-04-23

var hookshot = require("hookshot");
var fs = require("fs");
var path = require('path');
var spawn = require("child_process").spawn;
var options = require('minimist')(process.argv.slice(2));

var port = options.port;
var home = options.home;
var rbenv = options.rbenv;

if (!(port && home && rbenv)) {
  console.error("--port, --home, and --rbenv are all required");
  process.exit(1);
}

var GIT = path.join("/", "usr", "bin", "git");
var BUNDLER = path.join(rbenv, "shims", "bundle");
var JEKYLL = path.join(rbenv, "shims", "jekyll");

// Message logger that logs both to the console and a repo-specific build.log.
function BuildLogger(log_file_path) {
  this.log_write = function(message) {
    fs.appendFile(log_file_path, message + "\n", function(err) {
      if (err !== null) {
        console.error("Error: failed to append to log file",
          log_file_path + ":", err);
      }
    });
  }
}

BuildLogger.prototype.log = function() {
  var message = Array.prototype.slice.call(arguments).join(' ');
  console.log(message);
  this.log_write(message);
}

BuildLogger.prototype.error = function() {
  var message = Array.prototype.slice.call(arguments).join(' ');
  console.error(message);
  this.log_write(message);
}

// Executes the algorithm for cloning/syncing repos and publishing sites.
// Patterned after the ControlFlow pattern used within Google.
//
// Once instantiated, users need only call build(), which is the entry point
// to the algorithm. All other methods are "states" of the algorithm/state
// machine that are executed asynchronously via callbacks.
//
// repo_dir: directory containing locally-cloned Pages repositories
// repo_name: name of the repo belonging to the 18F GitHub organization
// dest_dir: path to the destination directory for published sites
// site_path: path to the repo on the local machine
// branch: the branch to publish
// build_logger: BuildLogger instance
// done_callback: callback triggered when the algorithm exits; takes a single
//   `err` argument which will be nil on success, and an error string on
//   failure
function SiteBuilder(repo_dir, repo_name, dest_dir, site_path, branch,
  build_logger, done_callback) {
  this.repo_dir = repo_dir;
  this.repo_name = repo_name;
  this.site_path = site_path;
  this.branch = branch;
  this.logger = build_logger;
  this.build_destination = path.join(dest_dir, repo_name);
  this.done = done_callback;

  this.spawn = function(path, args, next) {
    var opts = {cwd: site_path, stdio: 'inherit'};

    spawn(path, args, opts).on('close', function(code) {
      if (code !== 0) {
        done_callback("Error: rebuild failed for " + repo_name +
          " with exit code " + code + " from command: " +
          path + " " + args.join(" "))
      } else {
        next();
      }
    });
  }
}

SiteBuilder.prototype.build = function() {
  if (fs.existsSync(this.site_path)) {
    this.sync_repo();
  } else {
    this.clone_repo();
  }
}

SiteBuilder.prototype.sync_repo = function() {
  this.logger.log("syncing repo: " + this.repo_name);

  var that = this;
  this.spawn(GIT, ["pull"], function() { that.check_for_bundler(); });
}

SiteBuilder.prototype.clone_repo = function() {
  this.logger.log("cloning", this.repo_name, "into", this.site_path);

  var clone_addr = "git@github.com:18F/" + this.repo_name + ".git";
  var clone_args = ["clone", clone_addr, "--branch", this.branch];
  var clone_opts = {cwd: this.repo_dir, stdio: 'inherit'};
  var that = this;

  spawn(GIT, clone_args, clone_opts).on('close', function(code) {
    if (code != 0) {
      that.done("Error: failed to clone " + that.repo_name +
        " with exit code " + code + " from command: "
        + path + " " + args.join(" "));
    } else {
      that.check_for_bundler();
    }
  });
}

SiteBuilder.prototype.check_for_bundler = function() {
  this.uses_bundler = fs.existsSync(path.join(this.site_path, "Gemfile"));
  if (this.uses_bundler) {
    this.update_bundle();
  } else {
    this.jekyll_build();
  }
}

SiteBuilder.prototype.update_bundle = function() {
  var that = this;
  this.spawn(BUNDLER, ["install"], function() { that.jekyll_build(); });
}

SiteBuilder.prototype.jekyll_build = function() {
  var jekyll = JEKYLL;
  var args = ["build", "--trace", "--destination", this.build_destination];

  if (this.uses_bundler) {
    jekyll = BUNDLER;
    args = ["exec", "jekyll"].concat(args);
  }
  var that = this;
  this.spawn(jekyll, args, function() { that.done(null); });
}

function launch_builder(info, dest_dir, repo_dir) {
  var repo_name = info.repository.name;
  var branch = info.ref.split('/').pop();
  var site_path = path.join(repo_dir, repo_name);
  var commit = info.head_commit;
  var build_log = site_path + '.log';
  var logger = new BuildLogger(build_log);
  logger.log(repo_name + ':', 'starting build at commit', commit.id);
  logger.log('description:', commit.message);
  logger.log('timestamp:', commit.timestamp);
  logger.log('committer:', commit.committer.email);

  var builder = new SiteBuilder(repo_dir, repo_name, dest_dir, site_path,
    branch, logger, function(err) {
      if (err !== null) {
        logger.error(err);
        logger.error(repo_name + ': build failed');
      } else {
        logger.log(repo_name + ': build successful');
      }

      // Provides https://pages.18f.gov/REPO-NAME/build.log as an indicator of
      // latest status.
      var new_log_path = path.join(dest_dir, repo_name, 'build.log');
      fs.rename(build_log, new_log_path, function(err) {
        if (err !== null) {
          console.error('Error moving build log from', build_log, 'to',
            new_log_path);
        }
      });
    });
  builder.build();
}

var webhook = hookshot('refs/heads/18f-pages', function(info) {
  launch_builder(info,
    path.join(home, "pages-generated"),
    path.join(home, "pages-repos"));
});

webhook.on('refs/heads/18f-pages-staging', function(info) {
  launch_builder(info,
    path.join(home, "pages-staging"),
    path.join(home, "pages-repos-staging"));
});

webhook.listen(port);

console.log("18F pages: listening on port " + port);
