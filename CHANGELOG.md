# Changelog

## 3.6 — Alpha

- Study twelve official Brave releases spanning Chromium 146–156. Validate the current native contract on seven releases from Brave 1.93.138 through 1.98.62; reject older builds with a different vertical-tab architecture. Accept compiler-folded callable helpers while retaining rejection of unrelated hook aliases and all native identity/boundary checks.
- Admit the verified same-class background forwarder used by four historical releases, only at its validated direct-jump body. Keep every required ABI name and function slot mandatory.
- Recognize both observed focus-helper branch orders with exact instruction and branch-target checks in the extractor and native client. Retain compact instruction samples from all twelve releases as regression fixtures.
- Add a manual multi-release symbol research workflow and small automatic diagnostics for future failed extraction, reusing the official inputs already downloaded by the regular workflow.
- Approve the updated fixed extractor/workflow in the client and fix the local build helper to link the libraries declared by the mod.

## 3.5 — Alpha

- Gate every native address on an approved workflow and exact-PDB artifact, authenticated using GitHub API metadata, SHA256 and fixed extractor/action revisions. Reject replaced data, unapproved workflows, forks, failed runs, non-hosted runner attempts and cross-build substitutions.
- Preserve standard Windhawk named-symbol lookup, but compare all thirteen results with verified entries before local ABI checks and hook registration. Old unverified local entries cannot bypass the gate.
- Cache authenticated builds in Windhawk mod storage for offline reuse. Keep proof downloads bounded and download-only, with no login, uploads, telemetry, remote PDB fallback or retry thread.
- Add a staggered backup to the two-hour workflow schedule and record requested versus actual starts. GitHub scheduling remains best-effort; unchanged releases still skip large downloads.
- Document the trust boundary, anonymous API limits, offline behavior and pipeline approval procedure.

## 3.4.1 — Alpha

- Remove the embedded Brave 1.98.60 function-address table and its special-case resolver. Every build now uses Windhawk's local or online symbol cache.
- Keep complete-group validation, offline-only control and remote PDB downloads disabled. Clarify that uncached builds require an initial cache download or matching local symbols.

## 3.4 — Alpha

- Replace custom runtime map downloads, binary-map storage and retry worker with Windhawk's standard named-symbol cache mechanism. Disable remote PDB fallback and keep an offline-only setting.
- Publish standard `pdb_<GUID-age>.txt` caches through the two-hour workflow; retain strict official DLL/PDB checks and skip unchanged releases.
- Resolve all thirteen names before registering native hooks, with local PE, function-boundary, leaf, thunk and overlap validation. Preserve the persistent white-fallback fix.
- Default duplicate-caption hiding off, restore compact-mode guidance, disclose system-menu effects, and restore real styles before hook teardown.
- Use the build version macro in logs, clarify cache hosting/trust and request metadata, and expand failure, offline, shutdown and caption regression tests.

## 3.3 — Alpha

- Rename Window background to Vertical tabs background and Webpage canvas to Webpage background; simplify the settings descriptions and clarify the default white fallback.
- Remove website-code injection, its two settings, load hook and three native scripting dependencies. Retain native background transparency and the persistent tab-switch fix.
- Clarify that Webpage background changes only Chromium's backing layer, leaving website HTML, CSS and content unchanged. Add Zen Internet website-styling instructions, including Advanced Settings → Disable Transparency off, and Stylus guidance requiring custom CSS or a suitable userstyle.
- Use a smaller 1,080-byte format-6 map with thirteen required functions and seven private hooks. Preserve direct-jump validation and separate legacy client data.
- Explain compatibility downloads and the network opt-out; keep known builds offline.
- Update pinned artifact-transfer actions to Node.js 24 and enforce download digest checks.
- Replace the repository and embedded README screenshot with the new transparency example under a fresh image filename.

## 3.2 — Alpha

- Resolve direct named compiler jump stubs across all native slots, checking both the stub and exact target. Preserve full validation for the approved short host/focus leaves.
- Separate the thirteen required transparency functions from the optional three-function website-code path. Missing or unsupported scripting can no longer disable otherwise valid native transparency.
- Keep required-function, alias, fingerprint, ABI and whole-group validation strict through separate format-5 data. No additional native functions or timers.
- Add compiler-wrapper, partial-map, optional hook failure and fallback regression tests.

## 3.1.1 — Alpha

- Fix the default white canvas returning during tab switching by storing Chromium's persistent page-base color before tab attachment. Existing tabs are corrected on selection without refreshing.
- Replace the temporary renderer-background override with the native page-base API; preserve explicit website colors and optional website code.
- Validate the 16-function contract through separate format-4 compatibility data, retaining older client formats.
- Add tab-attachment ordering, null/disabled paths, repeated-switch and author-color regression checks.

## 3.1 — Alpha

- Clear the unfocused address field while preserving its focused theme background.
- Add Webpage canvas control for both the native theme backing and default renderer canvas, preserving author CSS backgrounds.
- Add optional editable website JavaScript, with a background-removal example and multiline code through Advanced settings.
- Use exact-build format-3 maps for 15 native dependencies, validating focus leaves, named thunks, fingerprints and aliases.
- Retry unavailable compatibility data every 30 minutes until cached; cancel cleanly and keep known builds offline.
- Extend native-scope, address-focus, user-code, settings-boundary and compatibility tests.

## 3.0 — Alpha

- Replace global color matching with native background-container targeting. Add independent Window background and Toolbar options.
- Use the browser host's existing transparent compositor path and the exact sidebar backing view; remove the old color-provider, color-table, and GPU composition hooks.
- Validate six native functions against built-in or cached exact-build format-2 data. Download only 520 bytes for an unknown build; retain offline use and leave legacy data separate.
- Check official Brave releases every two hours; skip binary/symbol downloads when release assets and the extractor/ABI contract are unchanged.
- Trace Chromium's default white webpage canvas separately from native browser backgrounds.
- Expand area-selection, symbol-alias, short-leaf, version, transport, cancellation, and shutdown tests.

## 2.10 — Alpha

- Add optional background recovery using a 256-byte compatibility file for the exact Brave build.
- Validate the PDB identity, function boundaries, fingerprints, and cached toolbar entry before using downloaded addresses. Keep valid data available offline.
- Generate compatibility data from official Brave releases and symbols with a GitHub Actions workflow every six hours; publish generated files separately from source history.
- Keep large symbol downloads on GitHub runners. Recovery data applies after a normal Brave restart; working builds make no compatibility request.
- Add extractor, transport, cache, cancellation, and shutdown tests.

## 2.9 — Alpha

- Restore transparency on Brave 1.98.60 / Chromium 156 with three private drawing functions instead of five.
- Remove the private View color-provider and class-name dependencies, including the getter changed by this Brave update.
- Track matched color requests during native background paints and clear after painting to remove stale opaque pixels. Nested paints keep independent state.
- Preserve per-window palette checks, custom color settings, the composition-alpha hook, and the native caption option.

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
