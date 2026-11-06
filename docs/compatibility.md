# Native feature compatibility

Brave Acrylic 4.0 uses Windhawk’s named-symbol fetching. The current contract contains 36 functions and one immutable background-class vtable. Windhawk can fall back to Brave’s official PDB server when the user enables the option. Local structural checks apply to both sources. See [hosting and trust](trusted-pipeline.md) for details on the author-controlled cache.

The format is `1#chrome.dll#x86-64_<timestamp>_<size>#<full-symbol-name>#<decimal-RVA>#...`. All 37 names have a fixed order. An empty RVA explicitly marks an unavailable optional target. The producer publishes only addresses serving complete features.

| Feature | Required slots |
| --- | --- |
| verticalTabs | 0, 1, 2, 3, 4, 5 |
| toolbar | 0, 1, 2, 3 |
| addressBar | 0, 1, 2, 3, 6, 7, 36 |
| webpage | 0, 1, 2, 3, 8, 9, 10, 11, 12 |
| roundedWebpage | 0, 1, 2, 3, 8, 9, 10, 11, 12, 30, 31 |
| menus | 13, 14, 15, 17 |
| popups | 0, 1, 2, 13, 14, 16, 17, 25, 26, 27, 32, 33, 34, 35 |
| suggestions | 5, 13, 14, 18, 19, 20, 21, 22, 23, 24, 28, 29 |

The names and decorated PDB inputs are defined in [feature-cache.cjs](../tools/feature-cache.cjs). Twenty-four functions are hooked when every feature is supported; twelve are called as helpers. The solid-background vtable identifies its native background class and must lie in immutable .rdata with executable method entries.

Chromium 157 made the popup layer opacity setter virtual. The extractor recognizes the two exact decorated names for the same x64 member-call arguments. It requires one unique address and publishes it under the existing cache key.

Rounded content is an independent extension of webpage transparency. The native border-paint scope suppresses the rounded container's backing fill; its following thin outline stroke and Brave's rounded native-view clipping are preserved. The separate MainBackgroundRegionView surround clears through the existing background hook. Missing either new paint function leaves rounded backing native without disabling the other feature groups. Generic controls, popup borders, webpage paint paths and authored website colors are outside this scope.

Blurred bubble windows use the native visibility controller with a short fade instead of scale animations. A marker set by the bubble frame limits this policy to identified popup windows; native menu windows keep their original path. The Windows backdrop fades on its own compositor using the same duration. There is no timer or per-frame private callback. The native no-animation/reduced-motion result makes the backdrop transition immediately. New call-only helpers are checked as complete native leaf layouts or unwind-backed entries; an unsafe dependency disables the popup group alone.

Native suggestions use the desktop-popup factory, actual local/screen bounds and native header height. Windows supplies the host backdrop. Superseded Chromium backdrop-filter, widget-layer and rounded-filter-construction helpers are no longer dependencies. A rounded OS region keeps the popup and blur below the typed input, follows resizing/DPI, and restores the actual previous region on cleanup.

The original background interfaces retain their approved short-leaf and direct-jump rules. The local-bounds helper accepts its exact observed leaf or a normal unwind-backed entry. Unrelated aliases on patched functions are rejected. A folded background setter may remain callable for vertical tabs while disabling suggestions. Corrupt inputs, mismatched GUID/DBI age and unsupported symbol remapping abort generation.

## Workflow

The hourly workflow first check the stable release, asset identity and native contract. Unchanged releases skip all large downloads. Both jobs check out the run's same source revision, and external actions remain pinned. The runner downloads the checksum-verified official archive and matching PDB once; neither downloaded browser code nor source-server commands are executed.

Availability and reasons are reported per feature. Missing or unsupported functions disable dependent features while other validated features are published. Even a build with no supported features gets an explicit diagnostic-only cache with no usable addresses. Network failures, corrupt files, test failures and publication failures remain errors.

Publication writes `brave-acrylic-features-v9/pdb_<GUID-age>.txt` and `feature-releases-v9/v<version>.json` to the `symbol-cache` branch, preserving older namespaces. No new proof locator or raw-proof artifact is published. The record retains official asset provenance, cache hash, extractor/native-contract identity and feature status for diagnostics and unchanged-release checks.

Restart Brave after applying the mod or settings, and after new data becomes available for a previously unsupported build. See [the compiler studies](compiler-resilience.md) for their precise version/contract coverage; the older multi-major studies do not validate the complete new contract.
