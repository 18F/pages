# 18F Pages

[18F Pages](https://pages.18f.gov/) is the serving host and publishing
platform that [18F](https://18f.gsa.gov/) uses to prototype and publish many
of its [Jekyll](http://jekyllrb.com/)-based and other statically-generated web
sites. It works very similarly to [GitHub pages](https://pages.github.com/).

This repo contains the Jekyll source for the https://pages.18f.gov/ home page
itself.

The 18F Pages publishing server is available as the [`18f-pages-server`
npm](https://www.npmjs.com/package/18f-pages-server), the code for which
resides in the [18F/pages-server
repository](https://github.com/18F/pages-server/). Complete details on the
publishing mechanism and server installation, configuration, and
administration are available in the README posted on both of those pages.

## Reusability

The server may be reused by other organizations, as it is completely
configurable via the [`pages-config.json`](#pages-config) file. You may
imagine replacing all instances of "18F" in the instructions that follow with
your own organization's handle.

## Publishing to `pages.18f.gov`

Published sites will appear as `https://pages.18f.gov/REPO-NAME`, where
`REPO-NAME` is the name of the site's repository without the organization
prefix.

For example, `18F/guides-template` will publish to
https://pages.18f.gov/guides-template/.

The status of the most recent build attempt will be visible at
`https://pages.18f.gov/REPO-NAME/build.log`.

### When to use this technique

The one condition test: "Is this site going to be for public (non-18F) consumption? If yes, use pages.18F.gov."

### Adding a new site

See the [18F Guides Template](https://pages.18f.gov/guides-template/) for
step-by-step instructions on how to develop a site for 18F Pages and configure
its GitHub repository for publishing.

Alternatively, if you're an 18F team member who's already comfortable with
Jekyll and GitHub, the short version is:

- Create the `18f-pages` publishing branch. If you already have a `gh-pages`
  branch, you can do this on the command line via:
```sh
$ git checkout -b 18f-pages gh-pages
$ git push origin 18f-pages
```
  or by clicking on the **Branch:** button on your repository's GitHub page,
  selecting `gh-pages`, clicking the button again, and entering `18f-pages` in
  the _Find or create a branch..._ box.
- If your repo is primarily an 18F Pages site (as opposed to a project site
  with an `18f-pages` branch for documentation), you may optionally set the
  default branch on GitHub to `18f-pages`.
- [Make sure all internal links are prefixed with `{{ site.baseurl
  }}`](https://github.com/18F/pages-server/blob/master/README.md#prefixing-jekyll-links-with--sitebaseurl-).
  This is essential for proper publishing to `https://pages.18f.gov/REPO-NAME`,
  though your local site will continue to serve correctly from
  http://localhost:4000/.
- Push a change to the `18f-pages` branch to publish your site. The site will
  not appear when the branch is created, only after it is updated.

For further information, read
[the "Publishing" section of the 18F/guides-server
README](https://github.com/18F/pages-server/blob/master/README.md#publishing)
for a thorough explanation of the entire publishing mechanism.

### Staging area

Any changes pushed to a `18f-pages-staging` branch will appear on
`https://pages-staging.18f.gov`, which requires authenticated access.

## Administering `https://pages.18f.gov/` and `https://pages-staging.18f.gov/`

### 18F GitHub organization webhook

There is a webhook configured for the 18F GitHub organization that will send
push notifications from every 18F GitHub repository to
`https://pages.18f.gov/deploy`. This enables every update to an `18f-pages` or
`18f-pages-staging` branch in every 18F GitHub repository to automatically
publish to `https://pages.18f.gov/` or `https://pages-staging.18f.gov/`,
respectively.

Individual 18F repositories _do not_ need to set up their own publishing
webhooks, and any existing publishing webhooks should be removed.

### Getting access to `pages.18f.gov`

**Note:** `pages.18f.gov` and `pages-staging.18f.gov` are the same machine.
Both sites are served using the same `18f-pages-server` instance.

- Get SSH access to `pages.18f.gov` via #devops.
- For convenience, add the following stanza to `$HOME/.ssh/config`, replacing
  `$HOME` with the full path to your home directory:
```
Host 18f-pages
   Hostname pages.18f.gov
   User ubuntu
   IdentityFile $HOME/.ssh/id_rsa
   IdentitiesOnly yes
```

In the sections that follow, each set of command line instructions presumes
that you have logged into `pages.18f.gov`. Alternatively, you may execute each
command from your local machine by adding `ssh 18f-pages` as a prefix.

### Cloning the 18F/pages repository and installing the server

Should `18f-pages-server` ever need to be re-installed, or installed on a new
instance, log into the host via `ssh 18f-pages` and follow the
[`18f-pages-server` installation instructions](https://github.com/18F/pages-server/blob/master/README.md#installation).

Once the server is installed, clone the 18F/pages repository and run the server using [Forever](https://www.npmjs.com/package/forever):

```sh
$ git clone git@github.com:18F/pages.git /home/ubuntu/pages
$ forever -l /var/log/18f-pages-server/pages.log -a /usr/local/bin/18f-pages /home/ubuntu/pages/pages-config.json
```

### Upgrading the server

Run the following command to upgrade `18f-pages-server` npm, and then follow
the [instructions to restart the server](#restart):

```sh
$ sudo npm upgrade -g 18f-pages-server
```

You should see output similar to the following upon success:

```sh
/usr/local/bin/18f-pages -> /usr/local/lib/node_modules/18f-pages-server/bin/18f-pages
18f-pages-server@0.0.3 /usr/local/lib/node_modules/18f-pages-server
├── file-locked-operation@0.0.1 (lockfile@1.0.1)
└── hookshot@0.1.0 (commander@2.3.0, lockfile@1.0.1, body-parser@1.8.4,
express@4.9.8)
```

### Updating the configuration

The [`pages-config.json` configuration file from this
repository](./pages-config.json) is the configuration for the
`18f-pages-server`. The schema is fully-documented in [the "Generate and
configure `pages-config.json` section of the `18f-pages-server`
README](https://github.com/18F/pages-server/blob/master/README.md#pages-config).

After changes to this file have been pushed or merged into the `18f-pages`
branch on GitHub, run the following to pull the configuration updates onto
`pages.18f.gov` then follow the [instructions to restart the server](#restart):

```sh
$ cd /home/ubuntu/pages && git pull
```

_Note: When running from your local machine using the `ssh 18f-pages`
prefix, this command must be surrounded by quotation marks._

### <a name="restart"></a>Restarting the server

To restart the server:

```sh
$ forever restart /usr/local/bin/18f-pages
```

To validate that the update succeeded, print the last lines of the log file,
which should look similar to the following:

```sh
$ tail -n 2 /var/log/18f-pages-server/pages.log
18f-pages-server v0.0.3
18F pages: listening on port 5000
```

### Setting up the `https://pages.18f.gov/` home page

`pages-generated/index.html` is a symlink to
`pages-generated/pages/index.html`, as explained in the
["Create a symlink to the `index.html` of the generated homepage" section of
the 18F/pages-server
README](https://github.com/18F/pages-server/blob/master/README.md#homepage-symlink).

### System configuration files

Updating these files in the repository _does not_ update them on the server.
Currently, server configurations should be updated directly, verified, then
updated within the repository to maintain parity.

#### logrotate.d

The `/etc/logrotate.d/18f-pages-server` file controls the log rotation
mechanism, `logrotate(8)`. This file is checked into this repository as
[`_deploy/etc/logrotate.d/18f-pages-server`](./_deploy/etc/logrotate.d/18f-pages-server).

#### Nginx

The [Nginx](http://nginx.org/) configuration for both `https://pages.18f.gov/`
and `https://pages-staging.18f.gov` is in the `/etc/nginx/vhosts/pages.conf`
file, checked into this repository as
[`_deploy/etc/nginx/vhosts/pages.conf`](./_deploy/etc/nginx/vhosts/pages.conf).

This file is imported into `/etc/nginx/nginx.conf` and includes other files
containing configuration directives for SSL, New Relic, and authentication.
The paths to these other files are relative to `/etc/nginx`. These other files
can be seen in the [`18F/hub nginx configuration
directory`](https://github.com/18F/hub/tree/master/deploy/etc/nginx), as they
are served from the same Nginx instance as `hub.18f.gov`.

## Contributing

1. Fork the repo (or just clone it if you're an 18F team member)
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request

Feel free to [file an issue](https://github.com/18F/pages/issues) or to ping
[@mbland](https://github.com/mbland) with any questions you may have,
especially if the current documentation should've addressed your needs, but
didn't.

## Public domain

This project is in the worldwide [public domain](LICENSE.md). As stated in [CONTRIBUTING](CONTRIBUTING.md):

> This project is in the public domain within the United States, and copyright
> and related rights in the work worldwide are waived through the [CC0 1.0
> Universal public domain
> dedication](https://creativecommons.org/publicdomain/zero/1.0/).
>
> All contributions to this project will be released under the CC0 dedication.
> By submitting a pull request, you are agreeing to comply with this waiver of
> copyright interest.
