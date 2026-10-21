# Changelog

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
- Retain the updated setup README, required Translucent Windows notice, alpha status, and compact-mode advice.

## 2.8 — Alpha

First public submission.

- Transparent toolbar and vertical-tab backgrounds over the required Translucent Windows backdrop.
- Built-in Dark + Blue theme configured by default, with an editable list of exact RGB colors.
- Per-window checks for regular, private, and Tor themes; unmatched palettes retain original background painting.
- Native container clearing to prevent stale labels and paint trails.
- Validated x64 function discovery, exact-build caching, and dynamic toolbar-color ID lookup.
- Standalone Windhawk source with native debug logging.
- Setup guide, screenshot, troubleshooting, and advanced configuration reference.
