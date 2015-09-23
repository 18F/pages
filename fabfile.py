#! /usr/bin/env python2.7

import fabric.api

fabric.api.env.use_ssh_config = True
fabric.api.env.hosts = ['18f-pages']
PAGES_DIR = "pages"
CMD = "pages.js"

def start():
  with fabric.api.cd("pages"):
    fabric.api.run("forever start -l $HOME/pages.log -a %s" % CMD)

def stop():
  with fabric.api.cd("pages"):
    fabric.api.run("forever stop %s" % CMD)

def restart():
  with fabric.api.cd("pages"):
    fabric.api.run("forever restart %s" % CMD)
