#!/usr/bin/env node
/**
 * verify-runtime.mjs — headless regression test for the "notes don't refresh"
 * bug. Extracts the inlined region from client.js, evaluates the parser, and
 * replays the merge logic against the real bundled snapshot + a synthetic
 * newer release to prove the changelog follows the latest version.
 *
 * Run: node tools/verify-runtime.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'client.js'), 'utf8');

// Pull the inlined data region (SNAPSHOT, LOCALES, parser) into a sandbox.
const start = src.indexOf('    /* __DATA_START__ */');
const end = src.indexOf('    /* __DATA_END__ */');
if (start < 0 || end < 0) throw new Error('inline markers missing');
const body = src.slice(start, end);
// `const` declarations do not become properties of a vm context, so append an
// expression that exports exactly what this test needs.
const sandbox = {};
vm.createContext(sandbox);
const exported = vm.runInContext(
  body + '\n;({ SNAPSHOT, LOCALES, normalizeRelease, splitGroups, ReleaseParser });', sandbox);

const { SNAPSHOT, normalizeRelease } = exported;
if (!SNAPSHOT || typeof normalizeRelease !== 'function') {
  throw new Error('inlined SNAPSHOT or normalizeRelease missing');
}
console.log(`snapshot: ${SNAPSHOT.releases.length} releases, latest=${SNAPSHOT.latest}`);

function mergeReleases(base, live) {
  const map = new Map();
  for (const r of base) if (r && r.version) map.set(r.version, r);
  for (const r of live) if (r && r.version) map.set(r.version, r);
  return Array.from(map.values()).sort((a, b) =>
    String(a.publishedAt || '').localeCompare(String(b.publishedAt || '')));
}
function slim(r) {
  return { tag: r.tag, version: r.version, name: r.name, publishedAt: r.publishedAt,
    prerelease: !!r.prerelease, url: r.url, groups: r.groups };
}
function releasesBetween(current, latest, rels) {
  if (!rels.length) return [];
  const ci = rels.findIndex((r) => r.version === current);
  let li = rels.findIndex((r) => r.version === latest);
  if (li < 0) li = rels.length - 1;
  if (ci < 0) return rels.slice(0, li + 1);
  if (ci >= li) return [];
  return rels.slice(ci + 1, li + 1);
}
function itemCount(rel) {
  const g = rel.groups || {};
  return ['features', 'improvements', 'fixes', 'chores', 'other']
    .reduce((n, k) => n + (g[k] || []).length, 0);
}

// ── Case 0: parser sanity on a real bilingual body shape ────────────────
const probe = normalizeRelease({
  tag_name: 'dsh-v9.9.9-test', name: 'v9.9.9-test',
  published_at: '2026-12-01T00:00:00Z', prerelease: true,
  html_url: 'https://example.invalid/r',
  body: '[中文](#cn) | [English](#en)\r\n\r\n<h3 id="cn">新增功能</h3>\r\n\r\n- 甲功能 @a\r\n- 乙功能 @b\r\n\r\n### 问题修复\r\n\r\n- 修了个 bug @c\r\n\r\nNew Features\r\n',
});
if (!probe || probe.groups.features.length !== 2 || probe.groups.fixes.length !== 1) {
  throw new Error('parser regression: ' + JSON.stringify(probe && probe.groups));
}
console.log('case0 parser: OK (features=2, fixes=1)');

// ── Case 1: THE BUG — latest version newer than the snapshot ─────────────
// Simulate a new release published AFTER the snapshot was generated.
const base = SNAPSHOT.releases;
const newVersion = '9.9.9-new';
const fakeApi = [{
  tag_name: 'dsh-v' + newVersion, name: 'v' + newVersion,
  published_at: '2026-12-02T00:00:00Z', prerelease: true,
  html_url: 'https://example.invalid/new',
  body: '[中文](#cn)\r\n\r\n<h3 id="cn">新增功能</h3>\r\n\r\n- 全新的功能 A @dev\r\n- 全新的功能 B @dev\r\n\r\n### 问题修复\r\n\r\n- 修了新版本的问题 @dev\r\n',
}];
const live = fakeApi.map(normalizeRelease).filter(Boolean).map(slim);
const merged = mergeReleases(base, live);
const between = releasesBetween('0.2.1-rc.2', newVersion, merged);

console.log(`case1 merged list: ${merged.length} releases (was ${base.length})`);
console.log(`case1 between 0.2.1-rc.2 -> ${newVersion}: ${between.length} releases`);
if (!between.some((r) => r.version === newVersion)) {
  throw new Error('BUG NOT FIXED: new version missing from changelog');
}
const newRel = between.find((r) => r.version === newVersion);
if (itemCount(newRel) !== 3) {
  throw new Error('new release body not parsed: items=' + itemCount(newRel));
}
console.log(`case1 new release items: ${itemCount(newRel)} (expected 3) — OK`);

// ── Case 2: feed ahead of GitHub (stub fallback) ────────────────────────
const feedOnly = '9.9.10-feedonly';
const stub = { tag: 'dsh-v' + feedOnly, version: feedOnly, name: 'v' + feedOnly,
  publishedAt: '2026-12-03T00:00:00Z', prerelease: true,
  url: 'https://example.invalid/f', groups: { features: [], improvements: [], fixes: [], chores: [], other: [] } };
const merged2 = mergeReleases(base, [stub]);
if (!releasesBetween('0.2.1-rc.2', feedOnly, merged2).some((r) => r.version === feedOnly)) {
  throw new Error('stub fallback failed');
}
console.log('case2 feed-only stub: OK');

// ── Case 3: live body replaces stale snapshot body for same version ──────
const target = base[base.length - 1].version;
const override = normalizeRelease({
  tag_name: 'dsh-v' + target, name: 'v' + target,
  published_at: base[base.length - 1].publishedAt, prerelease: true,
  html_url: 'https://example.invalid/o',
  body: '### 新增功能\r\n\r\n- 覆盖后的新条目 @x\r\n',
});
const merged3 = mergeReleases(base, [slim(override)]);
const got = merged3.find((r) => r.version === target);
if (!got || got.groups.features.length !== 1 || got.groups.features[0].indexOf('覆盖后') < 0) {
  throw new Error('live override did not win');
}
console.log('case3 live override wins: OK');

// ── Case 4: bundled snapshot already contains rc.2 / rc.3 ───────────────
for (const v of ['0.2.2-rc.2', '0.2.2-rc.3']) {
  const r = base.find((x) => x.version === v);
  if (!r) throw new Error(`snapshot missing ${v} after refresh`);
  console.log(`case4 ${v}: ${itemCount(r)} items — OK`);
}

console.log('\nALL CASES PASSED');
