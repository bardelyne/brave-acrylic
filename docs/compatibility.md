# Exact-build compatibility data

Brave Acrylic 3.3 uses format 6 for thirteen native dependencies. Address recovery handles changed compiled locations; a changed native ABI or rendering behavior can still require a mod update.

## Client contract

The fixed endpoint is https://raw.githubusercontent.com/bardelyne/brave-acrylic/compatibility-v6/maps/<GUID-age>.bin. The key is the DLL's CodeView GUID in symbol-server spelling followed by hexadecimal age. Exactly **1,080 bytes** are accepted. The entire identity and every fingerprint are checked before any address is exposed. Downloaded fingerprint bytes are compared, never executed.

Built-in or cached data works offline. For unknown builds, an optional worker makes a bounded HTTPS request, retrying missing, invalid or unsaved data every 30 minutes. Successful caching ends retries. Shutdown cancels the wait; disabling downloads prevents further requests. The worker never changes live hooks. Restart Brave normally to use downloaded data. Known builds make no compatibility request.

Legacy compatibility-v1, compatibility-v2, compatibility-v3, compatibility-v4 and compatibility-v5 branches remain separate for older clients. This producer writes only compatibility-v6. Old parser modules and fixture tests remain available; this client rejects their formats.

## Wire format

All integers are little-endian uint32. The header is 40 bytes:

| Offset | Bytes | Field |
| --- | --- | --- |
| 0 | 4 | Magic BAMP (0x504d4142) |
| 4 | 4 | Format 6 |
| 8 | 16 | Raw CodeView PDB GUID |
| 24 | 4 | PDB age |
| 28 | 4 | Machine 0x8664 (AMD64) |
| 32 | 4 | PE timestamp |
| 36 | 4 | PE image size |

All thirteen entries are required. Missing or all-zero entries are rejected. There are no website-code dependencies or optional scripting groups.

Thirteen 80-byte entries follow; entry i begins at 40 + i * 80.

| Entry offset | Bytes | Field |
| --- | --- | --- |
| 0 | 4 | Named symbol RVA |
| 4 | 4 | Fingerprint length |
| 8 | 4 | Kind |
| 12 | 4 | Zero, except kind 3's body RVA |
| 16 | 32 | Code fingerprint |
| 48 | 32 | Mask |

Masks contain only 00 or FF. Both arrays are zero after the fingerprint length. Machine, GUID, age, timestamp and image size must match the loaded DLL. Code fits executable .text. Fingerprints and separate jump-stub ranges must be distinct and non-overlapping. Rejected maps publish no partial address set.

- **Kind 0:** exact unwind-backed start, 16–32 bytes, at least 16 fixed bytes. Supported loader relocations may be masked.
- **Kind 1:** slot 3 only, exactly 13 bytes: 48 83 B9 <four displacement bytes> 00 74 03 31 C0 C3. All bytes, including displacement, are fixed. No unwind range may overlap it.
- **Kind 2:** slot 6 only, exactly 32 fixed bytes matching the tested LocationBarView::HasFocus leaf layout. Layout validation permits its two displacements to differ between builds, but fingerprints fix their actual values for that exact DLL. No overlapping unwind range is allowed.
- **Kind 3:** any slot, a five-byte direct E9 stub outside unwind ranges, jumping directly to the body RVA in the fourth field. The body follows kind 0 rules, or the exact approved kind-1/kind-2 leaf rules for slots 3/6. Leaf body bytes remain fully fixed. Both source and body are checked, including aliases and overlaps. The resolved body keeps the original entry ABI because no register adjustment is followed. Indirect jumps, adjusting thunks and jump chains are rejected.

Slots 3, 6 and 8 may also use kind 0 for an exact normal function start. Other short stubs are rejected.

## Fixed native ABI

Exact decorated names and slot order are part of the format:

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

The reference is Brave 1.98.60, key 75D8DB6BA8EC43F64C4C44205044422E1. Its 1,080-byte map SHA256 is 79d26e466b3d1d3e71921507d17af8a55646ba16d3048bcfdc5b4c067223109e. These references apply only to that build.

Native contracts include x64 string-view returns, an indirectly passed empty background unique pointer, 16-byte float colors, and an 8-byte optional ARGB color passed by value in RDX (has-value in byte 4). Slot 12 supplies a canonical WebContents pointer; no interface-subobject adjustment is guessed. No private object-member offsets are read. These contracts belong in the explicit ABI hash and need review after native ABI changes.

The producer resolves all thirteen required background names in one strict pass. Any missing or unsupported required function stops generation. The bounded MSF7 parser resolves names and fingerprints, then scans every public symbol again for differently named aliases. This includes a named thunk's body and other public E9 thunks leading to it. Identical names at one address are allowed; ambiguous required names fail generation. GUID and DBI age must match CodeView; stripped PDB Info age may be newer, not older. Missing symbols, unsupported OMAP remapping and invalid ranges fail closed. PDB source-server commands are never evaluated.

## Smart two-hour workflow

Cron is `17 */2 * * *`: twelve metadata checks daily, at 00:17, 02:17, through 22:17 UTC. GitHub can delay scheduled runs. Manual dispatch can check immediately or backfill a stable tag.

The prepare step compares the official stable tag; archive and checksum names, IDs, sizes, update times and available digests; format 6; extractor 1; ABI revision 1; client version 3.3; and the explicit native-contract hash. Matching records skip binary downloads, extraction, artifacts and publication. Source hash records provenance separately, so cosmetic comments and README changes do not trigger large downloads. Semantic changes must update the contract/revision; incompatible wire layouts need a new format/client. Manual force can regenerate a matching release. Drafts, prereleases, nightly and malformed tags are rejected.

When needed, the producer rechecks official assets, downloads the ZIP/checksum, verifies sizes/SHA256 and available digests, and extracts only chrome.dll to a fixed path. It never runs Brave. CodeView determines the official Brave PDB URL. Large symbols download on the runner, not users' PCs.

The producer has read-only permissions and a 35-minute timeout. Only map.bin and record.json pass to a separate five-minute publisher with contents:write. Jobs use the same source commit, pinned Actions, and no persisted credentials. The publisher independently validates files, sizes, format, identities, hashes, ordered symbol metadata including thunk bodies, explicit contract and official provenance. It rechecks official assets before non-forced updates to compatibility-v6, restricted to bardelyne/brave-acrylic on main. Older maps are retained. Failures publish no replacement.

Records include format/extractor/ABI/client versions, contract and source hashes, asset snapshots, PDB ages/identity, PE identity, ordered {name,rva,length,kind,reserved} metadata, map SHA256 and official source URLs/hashes. The schedule tracks stable releases; beta/nightly/custom builds are outside this workflow.

## Local verification

```text
node --test tests/*.test.cjs
node tests/run-client.cjs
node tools/build.cjs
```

The Windows runner accepts an optional real DLL/map pair. It maps the DLL without running its initialization. It also tests transport, cache, retries/cancellation, native roles, focus, scoped webview updates and area-setting boundaries.

Generate directly from existing files without downloading:

```text
node tools/symbol-map-v6.cjs chrome.dll chrome.dll.pdb map.bin
```

Legacy CLI modules remain for old data only. Do not commit browser ZIPs, DLLs or PDBs or include them in the Actions artifact. See [advanced.md](advanced.md) for native dependency use and website-extension setup.
