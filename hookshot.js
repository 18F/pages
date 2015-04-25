#! /usr/bin/env node

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

var REPO_HOME = path.join(home, "pages-repos");
var DEST_DIR = path.join(home, "pages-generated");
var GIT = path.join("/", "usr", "bin", "git");
var BUNDLER = path.join(rbenv, "shims", "bundle");
var JEKYLL = path.join(rbenv, "shims", "jekyll");

function SiteBuilder(repo_name, site_path, done_callback) {
  this.repo_name = repo_name;
  this.site_path = site_path;
  this.build_destination = path.join(DEST_DIR, repo_name);
  this.done = done_callback;
  this.uses_bundler = fs.existsSync(path.join(site_path, "Gemfile"));

  var that = this;
  this.spawn = function(path, args, next) {
    var opts = {cwd: that.site_path, stdio: 'inherit'};

    spawn(path, args, opts).on('close', function(code) {
      if (code !== 0) {
        console.error("Error: rebuild failed for", that.repo_name,
          "with exit code", code, "from command:", path, args.join(" "));
      } else {
        next();
      }
    });
  }
}

SiteBuilder.prototype.sync_repo = function() {
  var that = this;
  var next = this.uses_bundler ? "update_bundle" : "jekyll_build";
  this.spawn(GIT, ["pull"], function() { that[next](); });
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
  this.spawn(jekyll, args, this.done);
}

hookshot('refs/heads/gh-pages', function(info) {
  var repo_name = info.repository.name;
  var site_path = path.join(REPO_HOME, repo_name);

  if (!fs.existsSync(site_path)) {
    console.error("could not find repo in " + REPO_HOME + ": " + repo_name);
    return;
  }
  console.log("syncing repo: " + repo_name);

  var builder = new SiteBuilder(repo_name, site_path,
    function() { console.log("updated: " + repo_name); });
  builder.sync_repo();
}).listen(port);

console.log("18F pages: listening on port " + port);
