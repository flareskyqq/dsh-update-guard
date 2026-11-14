#!/usr/bin/env node
/**
 * build-snapshot.mjs — regenerate releases-snapshot.json from GitHub.
 *
 * Usage (optional, needs network):
 *   node tools/build-snapshot.mjs
 *
 * The plugin never runs this script. It is a maintainer tool so the bundled
 * offline snapshot can be refreshed when new DSH releases are published.
 *
 * Output shape:
 *   { generatedAt, repo, current, latest, releases: [ { tag, version, name,
 *     publishedAt, prerelease, url, bodyZh, bodyEn, groups } ] }
 *
 * `groups` splits the Chinese release body into the four headings DSH uses:
 * 新增功能 / 体验优化 / 问题修复 / 其他变更. Parsing is lenient: anything that
 * does not match a known heading lands in "other" so nothing is lost.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeRelease } from './release-parser.js';

const REPO = 'deepseek-ai/deepseek-harness';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=100`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'releases-snapshot.json');

async function main() {
  // Unauthenticated GitHub API allows only 60 req/hour per IP. A token from
  // `gh auth token` (or GITHUB_TOKEN) raises the limit; never log the token.
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const headers = {
    'User-Agent': 'dsh-update-guard',
    Accept: 'application/vnd.github+json',
  };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const releases = data
    .map(normalizeRelease)
    .filter(Boolean)
    .sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''));

  const payload = {
    generatedAt: new Date().toISOString(),
    repo: REPO,
    // Filled by the plugin at runtime from window.__DSH_BOOT__.release.
    // These two are hints only, never authoritative.
    current: null,
    latest: releases.length ? releases[releases.length - 1].version : null,
    releases,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`wrote ${OUT} (${releases.length} releases)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
