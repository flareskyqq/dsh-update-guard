# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-14

### Fixed

- **Release notes now follow new versions.** Previously the "latest version"
  field was resolved dynamically from the official feed / GitHub, but the
  changelog only read the bundled static snapshot. When a new release was
  published, the version number updated while the changelog stayed frozen.
  `resolveData()` now fetches the GitHub Releases **bodies** at the same time,
  parses them with the shared parser, and merges them into the runtime release
  list; the changelog, the version dropdown and the version number all read
  from that single merged list.
- **Live release bodies replace stale snapshot entries** for the same version.
- **Graceful degradation on GitHub rate limiting / offline:** the last
  successful live fetch is cached in `localStorage` and reused instead of
  falling straight back to the stale snapshot. The settings page now shows
  whether notes came from GitHub, cache, or the bundled snapshot.
- **Feed-ahead-of-GitHub case:** if the official feed announces a version whose
  release notes are not published yet, a placeholder row is added so the new
  version still appears in the changelog.
- **Parser fix:** `splitBilingual` used to slice the Chinese section at the
  keyword `新增功能`, cutting off the `<h3 ...>` prefix and silently dropping
  that heading's items into "other". It now aligns the slice to the heading
  line start. Verified against real releases (rc.1 still groups to
  13 / 31 / 53 / 29 with zero items in "other").

### Changed

- Extracted the release-body parser into `tools/release-parser.js`, shared by
  `build-snapshot.mjs` (maintenance) and the inlined runtime copy in
  `client.js`, so offline and live data can no longer drift.
- `build-snapshot.mjs` accepts `GITHUB_TOKEN` / `GH_TOKEN` to avoid the
  unauthenticated 60 req/hour limit. Token is never logged or stored.
- Bundled snapshot refreshed to 39 releases (latest `0.2.2-rc.3`, 2026-11-13).
- Added `tools/verify-runtime.mjs`: headless regression test covering the
  refresh bug, feed-only stub, live override, and parser sanity.

## [0.1.0] - 2026-11-09

### Added

- Hide/show toggle for the desktop "new version" button, persisted in
  `localStorage`. Matching is text-based (`新版本` / `Update`) and intentionally
  narrow so it does not touch the plugin manager's "有新版本" status labels.
- Optional extra CSS selector as a fallback when the host changes its DOM.
- Settings section (`settings.section`) with:
  - the visibility toggle and its current state;
  - current version read from `window.__DSH_BOOT__.release.version`, with a
    manual dropdown override when detection is unavailable;
  - latest version resolved via official nightly feed → GitHub Releases API →
    bundled offline snapshot, with the active source shown;
  - build commit and a link to the release on GitHub.
- Accumulated release notes between the current and latest version, split per
  release into 新增功能 / 体验优化 / 问题修复 / 其他变更, plus a merged view.
  Each release row is collapsible; "expand all" / "collapse all" included.
- Bundled `releases-snapshot.json` covering 37 published DSH releases, so the
  changelog works offline or when GitHub is rate-limited.
- `tools/build-snapshot.mjs` and `tools/inline-data.mjs` maintainer scripts.

### Notes

- Purely additive browser-side plugin. The host half is an empty `apply(){}`.
- No network requests on a timer; fetching happens only when the settings page
  opens or the user clicks Refresh.
- Never downloads or installs an update, never edits `app-update.yml`, never
  writes into `$DSH_HOME`.
