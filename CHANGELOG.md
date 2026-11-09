# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
