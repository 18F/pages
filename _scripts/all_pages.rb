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
repos = client.org_repos '18F'

pages_repos = []

repos.each do |repo|
  repo_name = repo.full_name
  branches = client.branches(repo_name).map { |b| b.name }
  pages_repos << repo_name if branches.include? '18f-pages'
end

pages_repos.sort.each { |repo| puts repo }
