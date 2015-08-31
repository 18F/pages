#! /usr/bin/env python2.7

import fabric.api

fabric.api.env.use_ssh_config = True
fabric.api.env.hosts = ['18f-pages']
CMD = "pages/hookshot.js"

def start():
  fabric.api.run("forever start -l $HOME/pages.log -a %s" % CMD)

def stop():
  fabric.api.run("forever stop %s" % CMD)

def restart():
  fabric.api.run("forever restart %s" % CMD)
