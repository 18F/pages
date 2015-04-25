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
var JEKYLL_ARGS = ["exec", "jekyll", "build", "--trace"];

function spawn_cmd(repo_name, site_path, path, args, next) {
  var opts = {cwd: site_path, stdio: 'inherit'}
  var cmd = spawn(path, args, opts);

  cmd.on('close', function(code) {
    if (code !== 0) {
      console.error("failed to rebuild: " + repo_name);
    } else {
      next();
    }
  });
}

hookshot('refs/heads/gh-pages', function(info) {
  var repo_name = info.repository.name;
  var site_path = path.join(REPO_HOME, repo_name);

  if (!fs.existsSync(site_path)) {
    console.error("could not find repo in " + REPO_HOME + ": " + repo_name);
    return;
  }
  console.log("syncing repo: " + repo_name);

  spawn_cmd(repo_name, site_path, GIT, ["pull"], function() {
    spawn_cmd(repo_name, site_path, BUNDLER, ["install"], function() {
      spawn_cmd(repo_name, site_path, BUNDLER,
        JEKYLL_ARGS.concat(["--destination", path.join(DEST_DIR, repo_name)]),
        function() { console.log("updated: " + repo_name); });
    });
  });
}).listen(port);

console.log("18F pages: listening on port " + port);
