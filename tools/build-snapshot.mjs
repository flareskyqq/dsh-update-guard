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

const REPO = 'deepseek-ai/deepseek-harness';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=100`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'releases-snapshot.json');

const HEADINGS = [
  ['features', /^新增功能$/],
  ['improvements', /^体验优化$/],
  ['fixes', /^问题修复$/],
  ['chores', /^其他变更$|^Chores$/],
];

/**
 * Strip HTML tags / anchors, returning the visible text. DSH release bodies
 * use `<h3 id="...">新增功能</h3>` (heading and text on one line) as well as
 * plain `### 新增功能`, so both forms must be recognised.
 */
function visibleText(line) {
  return line
    .replace(/<[^>]*>/g, '')
    .replace(/^\s*#{1,4}\s*/, '')
    .trim();
}

function headingKey(line) {
  const label = visibleText(line);
  const isHeading = /^\s*#{1,4}\s/.test(line) || /<h[1-4]\b/i.test(line);
  if (!isHeading) return null;
  const found = HEADINGS.find(([, re]) => re.test(label));
  return found ? found[0] : 'other';
}

function splitGroups(bodyZh) {
  const groups = { features: [], improvements: [], fixes: [], chores: [], other: [] };
  if (!bodyZh) return groups;
  let current = 'other';
  for (const raw of bodyZh.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const key = headingKey(line);
    if (key) {
      current = key;
      // A line can be a heading AND carry the first item, e.g.
      // `<h3 id="x">新增功能</h3> - something`. Keep the tail if present.
      const tail = line.replace(/<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/i, '').trim();
      if (/^[-*]\s+/.test(tail)) groups[current].push(tail.replace(/^[-*]\s+/, '').trim());
      continue;
    }

    if (/^\[中文\]|^\[English\]|^This first release candidate|^Full Changelog|^作为\s/.test(line)) continue;
    if (/^[-*]\s+/.test(line)) {
      groups[current].push(line.replace(/^[-*]\s+/, '').trim());
    }
  }
  return groups;
}

function splitBilingual(body) {
  if (!body) return { bodyZh: '', bodyEn: '' };
  // The Chinese section starts at the 中文 anchor / first 新增功能 heading,
  // the English section starts at "This first release candidate" or the
  // English "New Features" heading. Keep both raw halves for reference.
  const zhStart = body.search(/新增功能|## 新增|<h3 id="cn-/);
  const enStart = body.search(/New Features|<h3 id="en-|This first release candidate/);
  const bodyZh = zhStart >= 0 ? body.slice(zhStart, enStart > zhStart ? enStart : undefined) : body;
  const bodyEn = enStart >= 0 ? body.slice(enStart) : '';
  return { bodyZh, bodyEn };
}

async function main() {
  const res = await fetch(API, {
    headers: { 'User-Agent': 'dsh-update-guard', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const releases = data
    .filter((r) => /^dsh-v/.test(r.tag_name))
    .map((r) => {
      const { bodyZh, bodyEn } = splitBilingual(r.body || '');
      return {
        tag: r.tag_name,
        version: r.tag_name.replace(/^dsh-v/, ''),
        name: r.name || r.tag_name,
        publishedAt: r.published_at || r.created_at,
        prerelease: !!r.prerelease,
        url: r.html_url,
        bodyZh,
        bodyEn,
        groups: splitGroups(bodyZh),
      };
    })
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
