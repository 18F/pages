#! /usr/bin/env node
/* jshint node: true */
/* jshint bitwise: false */
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

var hookshot = require('hookshot');
var path = require('path');
var siteBuilder = require('./site-builder');
var options = require('minimist')(process.argv.slice(2));

var port = options.port;
var home = options.home;
var rbenv = options.rbenv;

if (!(port && home && rbenv)) {
  console.error('--port, --home, and --rbenv are all required');
  process.exit(1);
}

var GIT = path.join('/', 'usr', 'bin', 'git');
var BUNDLER = path.join(rbenv, 'shims', 'bundle');
var JEKYLL = path.join(rbenv, 'shims', 'jekyll');

// Passed through to bodyParser.json().
// https://www.npmjs.com/package/body-parser#limit
var jsonOptions = { limit: 1 << 20 };

function SiteBuilderOptions(info, repoDir, destDir) {
  return new siteBuilder.Options(info, path.join(home, repoDir),
    path.join(home, destDir), GIT, BUNDLER, JEKYLL);
}

var webhook = hookshot('refs/heads/18f-pages', function(info) {
  siteBuilder.launchBuilder(info,
    new SiteBuilderOptions(info, 'pages-repos', 'pages-generated'));
}, jsonOptions);

webhook.on('refs/heads/18f-pages-staging', function(info) {
  siteBuilder.launchBuilder(info,
    new SiteBuilderOptions(info, 'pages-repos-staging', 'pages-staging'));
}, jsonOptions);

webhook.listen(port);

console.log('18F pages: listening on port ' + port);
