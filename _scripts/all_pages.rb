#! /usr/bin/env ruby

require 'octokit'

TOKEN_PATH = File.join(ENV['HOME'], '.github_token')

unless File.exist? TOKEN_PATH
  $stderr.puts "No GitHub token found at #{TOKEN_PATH}"
  exit 1
end

access_token = File.read TOKEN_PATH
Octokit.auto_paginate = true
client = Octokit::Client.new access_token: access_token
repos = client.org_repos('18F').collect { |repo| repo.full_name }

pages_repos = repos.select do |name|
  client.branches(name).any? { |b| b.name == '18f-pages' }
end.sort

pages_repos.each { |repo| puts repo }
