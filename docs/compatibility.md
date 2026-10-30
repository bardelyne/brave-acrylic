# Native feature compatibility

Brave Acrylic 3.9 uses ordinary Windhawk named-symbol fetching. The current contract contains 29 functions and one immutable background-class vtable. Remote PDB fallback is disabled. Local structural checks remain; there is no workflow/artifact verification gate. The symbol service is controlled by the author: see [hosting and trust](trusted-pipeline.md).

The format is `1#chrome.dll#x86-64_<timestamp>_<size>#<full-symbol-name>#<decimal-RVA>#...`. All 30 names have a fixed order. An empty RVA explicitly marks an unavailable optional target. The producer publishes only addresses serving complete features.

| Feature | Required slots |
| --- | --- |
| verticalTabs | 0, 1, 2, 3, 4, 5 |
| toolbar | 0, 1, 2, 3, 6, 7 |
| webpage | 0, 1, 2, 3, 8, 9, 10, 11, 12 |
| menus | 13, 14, 15, 17 |
| popups | 0, 1, 2, 13, 14, 16, 17, 25, 26, 27 |
| suggestions | 5, 13, 14, 18, 19, 20, 21, 22, 23, 24, 28, 29 |

The names and decorated PDB inputs are defined in [feature-cache.cjs](../tools/feature-cache.cjs). Twenty functions are hooked when every feature is supported; nine are called as helpers. The solid-background vtable identifies its native background class and must lie in immutable .rdata with executable method entries.

Native suggestions use the desktop-popup factory, actual local/screen bounds and native header height. Windows supplies the host backdrop. Superseded Chromium backdrop-filter, widget-layer and rounded-filter-construction helpers are no longer dependencies. A rounded OS region keeps the popup and blur below the typed input, follows resizing/DPI, and restores the actual previous region on cleanup.

The original background interfaces retain their approved short-leaf and direct-jump rules. The local-bounds helper accepts its exact observed leaf or a normal unwind-backed entry. Unrelated aliases on patched functions are rejected. A folded background setter may remain callable for vertical tabs while disabling suggestions. Corrupt inputs, mismatched GUID/DBI age and unsupported symbol remapping abort generation.

## Workflow

The primary two-hour schedule and its staggered backup first check the stable release, asset identity and native contract. Unchanged releases skip all large downloads. Both jobs check out the run's same source revision, and external actions remain pinned. The runner downloads the checksum-verified official archive and matching PDB once; neither downloaded browser code nor source-server commands are executed.

Availability and reasons are reported per feature. Missing or unsupported functions disable dependent features while other validated features are published. Even a build with no supported features gets an explicit diagnostic-only cache with no usable addresses. Network failures, corrupt files, test failures and publication failures remain errors.

Publication writes `brave-acrylic-features-v7/pdb_<GUID-age>.txt` and `feature-releases-v7/v<version>.json` to the `symbol-cache` branch, preserving older namespaces. No new proof locator or raw-proof artifact is published. The record retains official asset provenance, cache hash, extractor/native-contract identity and feature status for diagnostics and unchanged-release checks.

Restart Brave after applying the mod or settings, and after new data becomes available for a previously unsupported build. See [the compiler studies](compiler-resilience.md) for their precise version/contract coverage; the older multi-major studies do not validate the complete new contract.
