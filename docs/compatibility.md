# Verified feature compatibility

Brave Acrylic 3.7 keeps Windhawk's named-symbol resolution and the approved-pipeline gate. The contract contains 27 exact functions and one immutable background-class vtable. All returned addresses must match authenticated data before any native hook is registered. Remote PDB fallback remains disabled.

The cache uses Windhawk's ordinary format: `1#chrome.dll#x86-64_<timestamp>_<size>#<full-symbol-name>#<decimal-RVA>#...`. All 28 names have a fixed order. An empty RVA explicitly marks an unavailable optional target. Orphan targets that do not serve any complete feature are rejected.

## Independent features

| Feature | Required slots |
| --- | --- |
| verticalTabs | 0, 1, 2, 3, 4, 5 |
| toolbar | 0, 1, 2, 3, 6, 7 |
| webpage | 0, 1, 2, 3, 8, 9, 10, 11, 12 |
| menus | 13, 14, 15, 17 |
| popups | 13, 14, 16, 17 |
| suggestions | 5, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27 |

The full decorated and readable names are defined in [feature-cache.cjs](../tools/feature-cache.cjs). Both producer and native parser are tested against the same contract. Sixteen functions are hooked when every feature is supported; eleven are call-only helpers. The vtable is only used to identify the native solid background, and must be in immutable .rdata with executable method entries.

The original background interfaces retain their validated short-leaf and direct-jump rules. Additional helpers accept only their exact observed leaf instruction layouts or normal unwind-backed entries. Unrelated aliases on patched functions are rejected. A folded background setter may remain usable as a call-only helper for vertical tabs while suggestions are disabled. Global PE/PDB corruption, GUID/DBI-age mismatch and unsupported symbol remapping always abort generation.

## Workflow behavior

The primary schedule and staggered backup remain every two hours. Official release/asset/contract checks skip large downloads when unchanged. A needed run downloads the official archive and matching PDB once, keeps large inputs on the hosted runner, and never executes downloaded browser code or source-server commands.

Each feature gets an availability result and a reason in the run summary and release record. A missing, renamed, aliased or unsupported native target disables its dependent features; the other complete features are still published. Even a build with no supported features produces an explicit diagnostic-only cache with no usable addresses. Such a build installs no native feature hooks. Network failures, corrupt inputs, test failures and publishing failures remain real errors; they are not converted into successful compatibility claims.

Publication uses `brave-acrylic-features/pdb_<GUID-age>.txt`, its proof locator, and `feature-releases/<tag>.json` on the symbol-cache branch. The older thirteen-symbol cache files are preserved for installed older mod versions. The independently validated raw artifact binds the exact cache bytes to the approved immutable run/workflow. See [the trust design](trusted-pipeline.md).

## Tests

The combined native targets validate on official Brave 1.98.60 and 1.98.62. The menu/suggestion browser test uses a separate profile; no personal Brave data is copied. Tests cover all 64 feature combinations, removal of every dependency, malformed and ambiguous symbols, native boundary/leaf checks, first-paint menu alpha, sharp input cutouts, native input/styles, composition ownership and unload cleanup.

```text
node --test tests/*.test.cjs
node tests/run-client.cjs
node tests/run-pipeline-trust.cjs
node tests/run-native-ui.cjs --material
node tools/feature-cache.cjs chrome.dll chrome.dll.pdb cache.txt
node tools/build.cjs
```

The older [twelve-release study](compiler-resilience.md) describes the background-only contract and is not a claim that the new menu/suggestion interfaces were tested on every historical release. Do not commit browser archives, DLLs or PDBs.
