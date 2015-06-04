## 18F Pages

This repo contains tools and instructions to generate
[Jekyll](http://jekyllrb.com/)-based [18F](https://18f.gsa.gov/) sites
automatically from [GitHub](https://github.com/) repositories in a similar
fashion to [GitHub pages](https://pages.github.com/).

Pages will appear on `https://pages.18f.gov/$REPO-NAME`, where `$REPO-NAME` is
the name of the site repository on https://github.com/18F/. The status of the
most recent build attempt will be visible at
`https://pages.18f.gov/$REPO-NAME/build.log`.

### Publishing to `pages.18f.gov`

#### When to use this technique

The one condition test: "Is this site going to be for public (non-18F) consumption? If yes, use pages.18F.gov."

#### Adding a new site

In a nutshell, for each site repo:

- In `_config.yml`, set `baseurl:` to `/$REPO-NAME`.
- Create an `18f-pages` branch. If you already have a `gh-pages` branch, you
  can do this on the command line via:
```
$ git checkout -b 18f-pages gh-pages
$ git push origin 18f-pages
```
- If your repo is primarily a Jekyll site (as opposed to a project site with
  an `18f-pages` branch for documentation), you may optionally set the default
  branch on GitHub to `18f-pages`.
- Set a webhook for `https://pages.18f.gov/deploy`.  When doing this using the [repo settings on github.com](https://github.com/18F/THE-NAME-OF-YOUR-REPO/settings/hooks/new), `https://pages.18f.gov/deploy` should be used for the Payload URL and the rest of the fields can stay with their defaults. 
- Push a change to the `18f-pages` branch to publish your site.
- _Optional_: Add your site's `title:` and `url:` (relative to
  `https://pages.18f.gov`, e.g. `/guides`) to the `sites:` list at the top of
  `index.html` in this repo. You can use the [GitHub editing
  interface](https://github.com/18F/pages/edit/18f-pages/index.html) to do this.

For more complete instructions, see the [18F Guides
Template](https://pages.18f.gov/guides-template/), especially the _Post Your
Guide_ section.

#### Staging area

Any changes pushed to a `18f-pages-staging` branch will appear on
`https://pages-staging.18f.gov`, which requires authenticated access.

### Administering `pages.18f.gov`

#### Starting the webhook daemon

To start the [Hookshot](https://www.npmjs.com/package/hookshot) server as a
daemon using [Forever](https://www.npmjs.com/package/forever):

- Clone this repository on your local machine.
- Install [pip](https://pip.pypa.io/) if needed.
- Install [Fabric](http://www.fabfile.org/) via `pip install fabric`.
- Add the following stanza to `$HOME/.ssh/config`, replacing `$HOME` with the
  full path to your home directory:
```
Host 18f-pages
   Hostname pages.18f.gov
   User ubuntu
   IdentityFile $HOME/.ssh/id_rsa
   IdentitiesOnly yes
```
- Run `ssh 18f-pages git clone git@github.com:18F/pages.git` to clone this
  repository in the `$HOME` directory on `pages.18f.gov`.
- Launch the remote daemon by running `fab start` in the root directory of
  this repository.

For grotty details on how to set up Hookshot, Fabric, and Forever, see [the
18F Hub deploy/README
instructions](https://github.com/18F/hub/tree/master/deploy#preparing-for-automated-deployment).

#### Nginx config

The following excerpts are extacted from the [18F Hub nginx
configuration](https://github.com/18F/hub/blob/master/deploy/etc/nginx/vhosts/pages.conf).

Webhook:
```
location /deploy {
  proxy_pass http://localhost:5000/;
  proxy_http_version 1.1;
  proxy_redirect off;

  proxy_set_header Host   $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_max_temp_file_size 0;

  proxy_connect_timeout 10;
  proxy_send_timeout    30;
  proxy_read_timeout    30;
}
```

pages.18f.gov:
```
location / {
  root   /home/ubuntu/pages-generated;
  index  index.html;
  default_type text/html;
}
```

pages-staging.18f.gov:
```
location / {
  alias  /home/ubuntu/pages-staging/;
  index  index.html;
  default_type text/html;
}
```

#### Index page

`pages-generated/index.html` is a symlink to
`pages-generated/pages/index.html`.

### Contributing

1. Fork the repo (or just clone it if you're an 18F team member)
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request

Feel free to ping [@mbland](https://github.com/mbland) with any questions you
may have, especially if the current documentation should've addressed your
needs, but didn't.

### Public domain

This project is in the worldwide [public domain](LICENSE.md). As stated in [CONTRIBUTING](CONTRIBUTING.md):

> This project is in the public domain within the United States, and copyright
> and related rights in the work worldwide are waived through the [CC0 1.0
> Universal public domain
> dedication](https://creativecommons.org/publicdomain/zero/1.0/).
>
> All contributions to this project will be released under the CC0 dedication.
> By submitting a pull request, you are agreeing to comply with this waiver of
> copyright interest.
