/* eslint-disable */
/**
 * release-parser.js — shared, dependency-free DSH Release body parser.
 *
 * Used by BOTH:
 *   - tools/build-snapshot.mjs (Node, at maintenance time)
 *   - client.js (browser, at runtime, inlined by tools/inline-data.mjs)
 *
 * Keeping one implementation avoids drift between the bundled offline
 * snapshot and the live releases fetched from the GitHub API.
 *
 * UMD-ish: works as an ES module export and as a browser global. The inline
 * tool strips the `export` line when injecting it into client.js.
 */

var HEADINGS = [
  ['features', /^新增功能$/],
  ['improvements', /^体验优化$/],
  ['fixes', /^问题修复$/],
  ['chores', /^其他变更$|^Chores$/],
];

/** Strip HTML tags / anchors, returning the visible text. */
function visibleText(line) {
  return line
    .replace(/<[^>]*>/g, '')
    .replace(/^\s*#{1,4}\s*/, '')
    .trim();
}

function headingKey(line) {
  var label = visibleText(line);
  var isHeading = /^\s*#{1,4}\s/.test(line) || /<h[1-4]\b/i.test(line);
  if (!isHeading) return null;
  for (var i = 0; i < HEADINGS.length; i++) {
    if (HEADINGS[i][1].test(label)) return HEADINGS[i][0];
  }
  return 'other';
}

/**
 * Split the Chinese half of a DSH release body into the four groups.
 * Handles both `<h3 id="...">新增功能</h3>` and `### 新增功能`.
 * Unmatched lines are kept in `other` so nothing is silently dropped.
 */
function splitGroups(bodyZh) {
  var groups = { features: [], improvements: [], fixes: [], chores: [], other: [] };
  if (!bodyZh) return groups;
  var current = 'other';
  var lines = bodyZh.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var key = headingKey(line);
    if (key) {
      current = key;
      // A line can be a heading AND carry the first item.
      var tail = line.replace(/<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/i, '').trim();
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

/**
 * Split a bilingual release body into Chinese and English halves.
 * DSH bodies start with `[中文](...) | [English](...)`, then the Chinese
 * headings, then the English translation.
 */
function splitBilingual(body) {
  if (!body) return { bodyZh: '', bodyEn: '' };

  // Find the Chinese section by its first HEADING LINE (not by a keyword in
  // the middle of it). Slicing at the keyword would cut off the `<h3 ...>`
  // prefix and make the heading unrecognisable, silently dumping its items
  // into `other`.
  var zhStart = -1;
  var zhRe = /^\s*(?:<h[1-4][^>]*>\s*)?(?:新增功能|体验优化|问题修复|其他变更)\s*(?:<\/h[1-4]>)?\s*$/gm;
  var zhMatch = zhRe.exec(body);
  if (zhMatch) zhStart = zhMatch.index;
  if (zhStart < 0) {
    // Fallback: the `[中文](...)` anchor line, or an explicit cn- heading.
    var anchor = body.search(/^\s*\[中文\]/m);
    if (anchor >= 0) {
      var after = body.indexOf('\n', anchor);
      zhStart = after >= 0 ? after + 1 : anchor;
    }
  }

  var enStart = -1;
  var enRe = /^\s*(?:<h[1-4][^>]*>\s*)?(?:New Features|Improvements|Bug Fixes|Chores)\s*(?:<\/h[1-4]>)?\s*$/gm;
  var enMatch = enRe.exec(body);
  if (enMatch) enStart = enMatch.index;
  if (enStart < 0) enStart = body.search(/This first release candidate/);

  var bodyZh = zhStart >= 0 ? body.slice(zhStart, enStart > zhStart ? enStart : undefined) : body;
  var bodyEn = enStart >= 0 ? body.slice(enStart) : '';
  return { bodyZh: bodyZh, bodyEn: bodyEn };
}

/** Convert one raw GitHub API release object into our normalized shape. */
function normalizeRelease(r) {
  if (!r || !/^dsh-v/.test(r.tag_name || '')) return null;
  var split = splitBilingual(r.body || '');
  return {
    tag: r.tag_name,
    version: String(r.tag_name).replace(/^dsh-v/, ''),
    name: r.name || r.tag_name,
    publishedAt: r.published_at || r.created_at || null,
    prerelease: !!r.prerelease,
    url: r.html_url || null,
    bodyZh: split.bodyZh,
    bodyEn: split.bodyEn,
    groups: splitGroups(split.bodyZh),
  };
}

var ReleaseParser = {
  visibleText: visibleText,
  headingKey: headingKey,
  splitGroups: splitGroups,
  splitBilingual: splitBilingual,
  normalizeRelease: normalizeRelease,
};

/* __PARSER_EXPORT_START__ */
export { ReleaseParser, splitGroups, splitBilingual, normalizeRelease };
/* __PARSER_EXPORT_END__ */
