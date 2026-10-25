# Windhawk symbol-cache compatibility

Brave Acrylic 3.4 uses Windhawk's supported `HookSymbols` / `WH_HOOK_SYMBOLS_OPTIONS::onlineCacheUrl` mechanism. It has no custom HTTP implementation, compatibility-download worker, periodic retry or writable binary-map cache. Native ABI or rendering changes can still require a mod update.

## Client resolution

1. Validate the reviewed, embedded Brave 1.98.60 table against the loaded DLL. This path makes no symbol-cache request.
2. Otherwise ask Windhawk to resolve all thirteen full C++ prototypes. Windhawk checks its own local cache first, then the configured online cache if enabled.
3. Set `symbolServer=L""` to prevent remote PDB fallback, and use Windhawk's default readable C++ prototypes for standard cache tooling. A missing cache cannot trigger a multi-GB download.
4. Validate the complete address group locally before registering any native hooks: executable `.text` bounds, exact unwind boundaries, approved short host/focus leaves, direct E9 entry/body ranges and overlap rejection. Resolve-only calls avoid partial native hook installation on failed name lookup. No callable helper is published on a missing or rejected group.
5. Register seven native hooks, then publish readiness only after Windhawk activates them. Initial discovery and teardown share a lock; no late installation can activate after BeforeUninit returns. Resource-only DLL loads are ignored.

The online base is `https://raw.githubusercontent.com/bardelyne/brave-acrylic/symbol-cache/brave-acrylic`. Windhawk appends `/pdb_<GUID-and-age>.txt`, deriving the identity from chrome.dll's CodeView record. This is the author's cache; it is **not** a deployment to `ramensoftware/windhawk-mod-symbol-cache`. Official hosting would require the maintainer's agreement and Brave support in that repository.

The symbol-cache publisher remains trusted. Function-boundary and shape checks constrain unsafe targets but do not independently prove a named RVA really belongs to that function. Downloading through Windhawk does not add a signature or online function-authentication service. The producer's official PDB checks and review of its publication pipeline matter.

## Standard text format

The file uses Windhawk's existing ASCII cache format:

```text
1#chrome.dll#x86-64_<PE-timestamp>_<image-size>#<full-C++-prototype>#<decimal-RVA>#...
```

There are exactly thirteen ordered name/RVA pairs and no trailing newline. The second and third fields are descriptive header comments in the online format; the PDB identity belongs in the requested filename. Windhawk rewrites the local cache into its own format. The reference build's cache is **approximately 1.5 KB**. The producer/publisher impose a 16 KiB limit, canonical decimal addresses, complete exact names, and no duplicate addresses. Named compiler E9 stubs retain their original public entry RVA; the client validates and normalizes a direct target from the actual DLL.

Legacy `compatibility-v1` through `compatibility-v6` branches remain separate for old clients. This client never reads their downloaded binary maps. The frozen v6 producer and old fixture tests remain for historical verification; the active workflow publishes standard text only.

## Privacy and offline use

The mod uploads no history, website content, settings, account data, diagnostic reports or analytics. It delegates the download to Windhawk. As with any direct download, the server sees the requester's IP address and exact-build cache URL. No claim of anonymous or metadata-free downloading is made.

Turn **Use Windhawk online symbol cache** off and re-enable the mod for offline-only resolution. The reviewed built-in table and Windhawk's existing local cache still work. A change cannot withdraw an already running request. Windhawk may perform its own short startup connection retries; the mod adds no timer. If exact data is unavailable or unsupported, transparency stays off. Re-enable the mod or reopen Brave normally after a cache is published.

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

The producer resolves exact names from the official matching DLL/PDB, rejects aliases and ambiguous names, checks GUID and DBI age against CodeView, and allows a newer stripped-PDB Info age. It verifies normal function boundaries, direct thunks and the supported short leaf layouts. Missing names, unsupported OMAP remapping or unsupported code shapes fail generation. It never evaluates PDB source-server commands or runs downloaded Brave binaries.

## Two-hour workflow

Cron is `17 */2 * * *`: twelve metadata checks daily. GitHub can delay scheduled runs. A manual dispatch can backfill a stable tag or force regeneration.

Preparation compares the official stable release and archive/checksum asset IDs, sizes, update times and available digests, plus the text-cache format, extractor, native ABI revision, client version and explicit contract hash. Unchanged releases skip binary downloads, extraction and publication. Source hashes record provenance without making cosmetic documentation changes trigger large downloads.

When needed, a read-only 35-minute job downloads the official ZIP/checksum, verifies sizes, SHA256 and available digests, extracts only chrome.dll to a fixed path, and downloads its exact PDB on the runner. The PDB parser validates all required functions before generating cache.txt and record.json.

A separate five-minute publisher receives only those two small files. It independently validates their types, sizes, ASCII schema, names, RVAs, identity/provenance metadata, hashes and source contract, then rechecks official release assets. Only `bardelyne/brave-acrylic` on `main` can publish non-forced Git updates to `symbol-cache`. Files are `brave-acrylic/pdb_<GUID-age>.txt` and `releases/<stable-tag>.json`; older caches remain. Actions are pinned and checkout credentials are not persisted. Beta/nightly/custom builds are outside this schedule.

## Local verification

```text
node --test tests/*.test.cjs
node tests/run-client.cjs
node tools/build.cjs
node tools/symbol-cache.cjs chrome.dll chrome.dll.pdb cache.txt
```

The Windows test runner optionally accepts a real DLL and its trusted embedded-map fixture. It maps the DLL without running its initialization. Tests cover complete and partial symbol resolution, offline options, missing/invalid addresses, shutdown ordering, caption-style restoration, native background roles, focused address fields and repeated tab selection preserving author CSS. The separate real-engine probe also checks online cache misses, incomplete/wrong-name caches, successful resolution and subsequent offline reuse. It does not execute mapped browser functions or replace visual testing in Brave.

Do not commit browser ZIPs, DLLs or PDBs or pass them to the publishing job. See [advanced.md](advanced.md) for area settings and native ownership, and [webview-background.md](webview-background.md) for the persistent white-fallback investigation.
