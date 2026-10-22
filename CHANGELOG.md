# Changelog

## 2.8.4 — Alpha

- Hide Windows' duplicate caption buttons while keeping Brave's controls, acrylic, and resize borders.
- Apply the caption option to existing and new browser frames without polling, preserve Chromium's logical fullscreen style, and restore the native bit when disabled.
- Stop process-switch parsing at `--single-argument` so file-association paths containing ` --type=` cannot disable the browser hooks.
- Clarify custom-color setup with Snipping Tool instructions and reorganize requirements and compatibility.

## 2.8.3 — Alpha

- Parse process switches as complete Windows arguments so URLs cannot disable the browser hooks.
- Skip repeated module lookups after attempting Chrome hook installation.
- Cache and revalidate the named toolbar-color entry to avoid rescanning the full table on every launch.
- Keep source-installation instructions in the GitHub README and simplify the README shown in Windhawk.
- Document the GPU alpha hook's independence from per-window theme detection.

## 2.8.2 — Alpha

- Initialize hooks directly when Chrome loads; remove startup polling and synchronize shutdown.
- Remove the HWND swap-chain override; limit composition alpha to compatible RGBA surfaces, with driver fallback.
- Remove window restyling, fullscreen interference, backdrop overrides, and the heartbeat thread.
- Move the signature cache into Windhawk storage and color diagnostics into visible mod settings.
- Publish color settings safely, restore empty-list defaults, and skip invalid rows with strict RGB parsing.
- Strengthen native signatures beyond their prologues and remove unused dependencies and tracing tools.

## 2.8.1 — Alpha

- Remove the unused optional symbol-download path and its diagnostic-only hooks. The working local resolver remains the normal rendering path.
- Use the standard architecture declaration and explicitly refuse unsupported native processors before installing hooks.
- Retain the updated setup README, required Translucent Windows notice, and alpha status.

## 2.8 — Alpha

First public submission.

- Transparent toolbar and vertical-tab backgrounds over the required Translucent Windows backdrop.
- Built-in Dark + Blue theme configured by default, with an editable list of exact RGB colors.
- Per-window checks for regular, private, and Tor themes; unmatched palettes retain original background painting.
- Native container clearing to prevent stale labels and paint trails.
- Validated x64 function discovery, exact-build caching, and dynamic toolbar-color ID lookup.
- Standalone Windhawk source with native debug logging.
- Setup guide, screenshot, troubleshooting, and advanced configuration reference.
