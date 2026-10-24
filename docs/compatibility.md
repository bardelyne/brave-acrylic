# Exact-build compatibility data

Brave Acrylic normally discovers three native drawing functions locally. A compiler update can change their byte patterns while retaining the same ABI. The optional compatibility path can recover those addresses from data generated using the official PDB for the exact DLL.

This is address recovery, not a guarantee that future rendering changes need no code changes.

## What happens on the user's PC

1. Check the existing signature cache and local signatures, or a previously validated compatibility cache. Successful local discovery makes **no compatibility network request**.
2. If the required function patterns fail but the toolbar-color table and CodeView identity can be read, start one background attempt after mod initialization. The request is a fixed HTTPS GET to `raw.githubusercontent.com/bardelyne/brave-acrylic/compatibility-v1/maps/<GUID-age>.bin`.
3. Accept only HTTP 200 and exactly **256 bytes**. Redirects, cookies, and ambient HTTP authentication are disabled. There is an eight-second attempt budget and two-second stage timeouts. An in-flight system call can finish after cancellation; unloading waits for the worker rather than closing another thread's HTTP handle.
4. Validate format/ABI revision, AMD64 machine type, CodeView PDB GUID and age, PE timestamp and image size. Each of the three addresses must start a complete x64 function inside `.text`, have the expected bounded fingerprint, and differ from the other two addresses. Relocation bytes can be masked; at least 16 fixed bytes are required per function.
5. Recheck the named toolbar-color entry and save the map through Windhawk's storage API. The worker registers no paint hooks. A **normal restart of all Brave windows** applies the saved data before new browser UI is created.

Disable **Download compatibility data after Brave updates** to prevent network checks. An already validated cache still works offline. There are no browser restarts, recurring polling timers, debug-symbol downloads, screenshot captures, arbitrary download URLs, or executable updates on the client.

The request reveals the normal connection information and the installed DLL's build identity to GitHub. It includes no browsing history, page URL, color settings, or account token. Only the browser process can start a recovery check; renderer and GPU processes do not perform these downloads.

If a map is unavailable, the mod stays opaque. The next browser process may check again. Once a map has been downloaded successfully, the log says to restart normally. If data was not published on the first attempt, wait for a successful workflow run before trying again.

## What GitHub Actions does

The workflow checks the latest stable x64 Brave release every six hours, at 00:17, 06:17, 12:17, and 18:17 UTC. This gives four checks per day while avoiding the busy start of each hour. GitHub schedules can be delayed, so a new release can wait roughly six hours plus queue and processing time. Already processed releases skip the large downloads, and a manual run can check immediately.

This public repository uses standard Ubuntu runners, which [GitHub provides without charging Actions minutes](https://docs.github.com/en/actions/concepts/billing-and-usage). The generation and publishing jobs retain their 35-minute and five-minute timeouts, well below the [six-hour hosted-job limit](https://docs.github.com/en/actions/reference/limits). The six-hour check interval is a resource and update-delay tradeoff, not a requirement of that job limit.

The generation job has read-only repository access. It downloads the official x64 ZIP and its SHA256 file, verifies the archive, and extracts only `chrome.dll` to a fixed path. It does not execute Brave. The DLL's CodeView identity determines the exact symbol-server URL on [Brave's official symbol server](https://github.com/brave/brave-browser/wiki/Brave-symbol-server).

The parser streams the public symbol records instead of loading the entire PDB. It never evaluates source-server commands. It requires these exact decorated names, including the two-argument canvas-clear overload:

| Slot | Required ABI |
| --- | --- |
| 0 | `?GetColor@ColorProvider@ui@@QEBAIH@Z` |
| 1 | `?OnPaintBackground@View@views@@MEAAXPEAVCanvas@gfx@@@Z` |
| 2 | `?DrawColor@Canvas@gfx@@QEAAXIW4SkBlendMode@@@Z` |

Missing or ambiguous symbols, unsupported OMAP remapping, short functions, insufficient fingerprints, mismatched identities, or invalid binary ranges fail generation. Public/stripped PDBs can have a different Info-stream age; the GUID and DBI age must match the DLL, and the Info age cannot be older.

Only the small map and its provenance record pass to the publishing job. That job has write access, independently checks their format/hash/provenance, and updates the **`compatibility-v1` data branch** without force-pushing. Older maps remain available. Source commits and their contributor history stay on `main`; the separate generated branch uses GitHub's automation bot.

## Operator setup

Once this workflow is on `main` and Actions is enabled for the repository, its push trigger generates the initial stable map. No custom signing key or personal access token is needed; publishing uses the scoped job token. The workflow is restricted to `bardelyne/brave-acrylic` on `main`.

For a missed or older stable build, open **Actions → Brave compatibility data → Run workflow** and enter a tag such as `v1.98.60`. Leave the tag blank for the current stable release. Use **Regenerate an existing release record** when repairing the extractor for a build that already has data. A failed job does not overwrite working maps.

The schedule follows the latest stable release. It does not promise coverage of every intermediate, beta, nightly, or custom build. Backfill exact stable releases manually when needed. GitHub may disable scheduled workflows in inactive public repositories; check the Actions page if updates stop.

## Format and local checks

All fields are little-endian. The 256-byte payload contains a 40-byte header followed by three 72-byte entries. Each entry stores an RVA, fingerprint length, 32 code bytes, and a 32-byte mask. Mask bytes must be 0 or 255; unused bytes must be zero. The format version also identifies the client's fixed ABI slot order. An ABI change requires a new format and a mod update.

Run the portable extractor tests:

```text
node --test tests/symbol-map.test.cjs
```

On Windows with Windhawk's compiler installed, run the client tests:

```text
node tests/run-client.cjs
```

`WINDHAWK_CXX` can select a compatible x64 MinGW compiler. `BRAVE_TEST_TEMP` can select a writable compiler temporary directory. Optional arguments `chrome.dll map.bin` also validate an actual mapped Brave DLL without running its initialization code.

Generate a local map from existing files:

```text
node tools/symbol-map.cjs chrome.dll chrome.dll.pdb output.bin
```

Do not redistribute the large downloaded browser archives or PDBs through this repository. The Actions artifact contains only `map.bin` and `record.json`.
