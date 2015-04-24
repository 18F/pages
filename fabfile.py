#! /usr/bin/env python2.7

import fabric.api

# Specifies the hook to manage. Defaults to internal; override with:
#   fab [command] --set instance=public"
INSTANCE = fabric.api.env.get('instance', 'internal')

SETTINGS = {
  'internal': {
    'host': '18f-hub', 'port': 5000, 'home': '/home/ubuntu',
    'rbenv': '/usr/local/rbenv'
  },
}[INSTANCE]

fabric.api.env.use_ssh_config = True
fabric.api.env.hosts = [SETTINGS['host']]

LOG = "%s/pages.log" % SETTINGS['home']
CMD = "pages/hookshot.js --port %i --home %s --rbenv %s" % (
  SETTINGS['port'], SETTINGS['home'], SETTINGS['rbenv'])

def start():
  fabric.api.run("forever start -l %s -a %s" % (LOG, CMD))

def stop():
  fabric.api.run("forever stop %s" % CMD)

def restart():
  fabric.api.run("forever restart %s" % CMD)
