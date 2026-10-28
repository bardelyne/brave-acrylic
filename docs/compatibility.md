# Verified Windhawk symbol-cache compatibility

Brave Acrylic 3.6 retains Windhawk named-symbol resolution and the approved-pipeline gate. All thirteen named entries must match data verified against GitHub's immutable artifact and run records before any function is used. No build-specific address table is embedded and no remote PDB fallback is allowed.

See [trusted-pipeline.md](trusted-pipeline.md) for the complete account-compromise threat model, trusted revisions, HTTPS verification sequence, offline behavior, rate/retention limits, and approval procedure.

The standard cache format remains `1#chrome.dll#x86-64_<timestamp>_<size>#<full-prototype>#<decimal-RVA>#...`, with exactly thirteen entries. The immutable artifact's name binds that payload to the exact PDB GUID/age; the live PE header and executable ranges are independently checked. The author-hosted branch is only a download location, not the trust anchor. Windhawk may return earlier cached entries, but the gate compares each address against the approved data before using it.

Legacy binary maps and 3.4's unverified cache-only path are not accepted as proof. A new build needs an initial anonymous verification. Successfully verified entries in per-mod storage can be reused offline. Missing/deleted metadata or anonymous rate limits fail closed on a first use; no user token is requested.

## Fixed native ABI

| Slot | Required symbol |
| --- | --- |
| 0 | `?OnPaintBackground@View@views@@MEAAXPEAVCanvas@gfx@@@Z` |
| 1 | `?DrawColor@Canvas@gfx@@QEAAXIW4SkBlendMode@@@Z` |
| 2 | `?GetClassNameW@View@views@@QEBA?AV?$basic_string_view@DU?$char_traits@D@__Cr@std@@@__Cr@std@@XZ` |
| 3 | `?ShouldWindowContentsBeTransparent@BrowserDesktopWindowTreeHostWin_ChromiumImpl@@EEBA_NXZ` |
| 4 | `??0BraveVerticalTabStripContainerView@@QEAA@PEAVBrowserView@@PEAVView@views@@@Z` |
| 5 | `?SetBackground@View@views@@QEAAXV?$unique_ptr@VBackground@views@@U?$default_delete@VBackground@views@@@__Cr@std@@@__Cr@std@@@Z` |
| 6 | `?HasFocus@LocationBarView@@UEBA_NXZ` |
| 7 | `?HasFocus@View@views@@UEBA_NXZ` |
| 8 | `?OnThemeChanged@ContentsWebView@@UEAAXXZ` |
| 9 | `?RenderViewReady@ContentsWebView@@UEAAXXZ` |
| 10 | `?SetColor@LayerAnimator@ui@@UEAAXU?$SkRGBA4f@$02@@@Z` |
| 11 | `?SetPageBaseBackgroundColor@WebContentsImpl@content@@UEAAXV?$optional@I@__Cr@std@@@Z` |
| 12 | `?SetWebContents@ContentsWebView@@UEAAXPEAVWebContents@content@@@Z` |

The table above lists the producer's exact mangled PDB inputs. The cache and client use their full readable C++ prototypes with Windhawk's default DIA undecoration (without pointer-width markers). Both ordered lists are fixed by the native contract. All thirteen functions are required. Seven are hooked; six are called helpers. Native contracts include x64 string-view returns, an indirectly passed empty background unique pointer, 16-byte float colors and an eight-byte optional ARGB color passed by value in RDX (presence in byte four). The tab-attachment hook supplies the canonical WebContents pointer before native notifications. No guessed object-member offsets or retained tab pointers are used.

The producer resolves exact names from the official matching DLL/PDB, rejects unsafe hook aliases and ambiguous names, checks GUID and DBI age against CodeView, and allows a newer stripped-PDB Info age. Callable helpers may use compiler-folded code. One exact same-class background-forwarder alias is allowed only at its validated direct-jump body. All required names, distinct function slots, boundaries, direct thunks and supported short leaf layouts remain checked. Missing names, unsupported OMAP remapping or unsupported code shapes fail generation. It never evaluates PDB source-server commands or runs downloaded Brave binaries. See the [twelve-release study](compiler-resilience.md).

## Two-hour workflow

The primary cron is `17 */2 * * *`, with a staggered `47 */2 * * *` backup. GitHub can delay or drop scheduled runs; these are requested checks, not an exact two-hour timer. A manual dispatch can backfill a stable tag or force regeneration.

Preparation compares the official stable release and archive/checksum asset IDs, sizes, update times and available digests, plus the text-cache format, extractor, native ABI revision, client version and explicit contract hash. Unchanged releases skip binary downloads, extraction and publication. Source hashes record provenance without making cosmetic documentation changes trigger large downloads.

When needed, a read-only 35-minute job downloads the official ZIP/checksum, verifies sizes, SHA256 and available digests, extracts only chrome.dll to a fixed path, and downloads its exact PDB on the runner. The PDB parser validates all required functions before generating cache.txt and record.json. A raw artifact named for the exact PDB identity records the original payload SHA256 in GitHub metadata; only small files are retained.

If extraction fails, a diagnostic step inspects those existing downloads and retains a small report for fourteen days. It records missing/ambiguous names, aliases, jumps, instruction samples and boundary failures. No unsupported cache is published and no second PDB download is made. The separate manual compiler-research workflow can compare up to twelve selected stable tags; it does not run on the two-hour schedule.

A separate five-minute publisher receives only those two small files. It independently validates their types, sizes, ASCII schema, names, RVAs, identity/provenance metadata, hashes and source contract, then rechecks official release assets. Only `bardelyne/brave-acrylic` on `main` can publish non-forced Git updates to `symbol-cache`. Files are `brave-acrylic/pdb_<GUID-age>.txt`, its `.proof.json` locator, and `releases/<stable-tag>.json`; older caches remain. The publisher checks the raw artifact digest, name, repository, run and head revision before publishing. The mod independently authenticates that run and its approved workflow through GitHub. Actions are pinned and checkout credentials are not persisted. Beta/nightly/custom builds are outside this schedule.

## Local verification

```text
node --test tests/*.test.cjs
node tests/run-client.cjs
node tests/run-pipeline-trust.cjs
node tools/build.cjs
node tools/symbol-cache.cjs chrome.dll chrome.dll.pdb cache.txt
```

The Windows test runner optionally accepts a real DLL and a matching PDB-derived validation fixture. It maps the DLL without running its initialization. Tests cover complete and partial symbol resolution, offline options, missing/invalid addresses, shutdown ordering, caption-style restoration, native background roles, focused address fields and repeated tab selection preserving author CSS. The separate real-engine probe also checks online cache misses, incomplete/wrong-name caches, successful resolution and subsequent offline reuse. It does not execute mapped browser functions or replace visual testing in Brave.

Do not commit browser ZIPs, DLLs or PDBs or pass them to the publishing job. See [advanced.md](advanced.md) for area settings and native ownership, and [webview-background.md](webview-background.md) for the persistent white-fallback investigation.
