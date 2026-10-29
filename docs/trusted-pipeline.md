# Approved compatibility pipeline

Brave Acrylic uses a gate inside the Windhawk mod. An author's branch is a
download location, not an authority for selecting functions. This design protects
against replacing published data or changing the publisher through control of the
project's GitHub account. It is not an assurance that native hooks cannot crash.

## What is approved

- Repository numeric ID: `1428612836` (`bardelyne/brave-acrylic`).
- Workflow numeric ID: `394997888`, `.github/workflows/compatibility.yml`.
- Approved workflow Git blob: `c8057565c2897f659753f2c268661c33e1cd5aa4`.
- SHA256 of the committed LF workflow bytes:
  `b56a45836113e06588dc02db2313e52f6f045cc8f5b12e86e8e9febf35f88a26`.
- The approved YAML checks out extractor/tests/tools commit
  `526df5a5c0fddd16bdbfe4f628d1a6a28266234e`, rather than the current main branch.
- Checkout and artifact-transfer actions are pinned to complete commit IDs.
- The runner downloads official stable Brave archives, verifies their checksums,
  matches PE/PDB GUID and age, and resolves the exact decorated feature names.
  Source-server commands and downloaded browser code are never executed. Python
  ZIP extraction uses isolated mode, so files on main cannot shadow its modules.

The extractor distinguishes callable helpers from patched functions when
checking compiler folding. Unrelated aliases on hooks remain rejected. See the
[twelve-release compiler study](compiler-resilience.md) for the exact permitted
forwarder and regression evidence. The six feature groups, exact native prototypes and approved helper leaves are part of the pinned contract. The background-only compiler study is historical evidence; menus and suggestions have separate tests.

Changing unrelated README or mod source on main does not change the pinned
generation code. Editing the workflow, source pin or action pins changes the
workflow's hash and requires a reviewed mod update. An account owner can still
stop publishing or delete data; this is an availability failure, not permission
to supply replacement function addresses.

## Verification in the mod

1. Read the loaded DLL's CodeView GUID/age and PE identity. Look for previously
   verified data in Windhawk's per-mod storage, under a key containing that PDB
   identity and the approved workflow blob. Stored SHA256 detects corruption;
   local storage assumes the user's own machine and installed mods are trusted.
2. Otherwise, if online access is enabled, GET the small text cache and its proof
   locator. The locator's artifact ID is only a lookup hint; its claimed hashes,
   version, run ID and source are not trusted.
3. GET GitHub's public artifact API. Require a raw artifact named
   `pdb_<exact-local-GUID-age>.txt`, the matching byte count and SHA256, and the
   original repository/head-repository IDs and main branch. A valid artifact for
   another PDB cannot be reused even if a PE timestamp or image size collides.
4. GET that artifact's original workflow run. Require the approved repository,
   workflow ID/path, matching head revision, successful completion and an allowed
   schedule/push/manual event. A cancelled, incomplete, fork or other workflow run
   cannot authorize data.
5. GET all recorded job attempts, with a finite response/count limit. Require
   GitHub-hosted runner metadata (reserved group ID zero) for every executed job,
   known job names, and a successful generation job. A later hosted rerun cannot
   conceal an earlier self-hosted attempt. Changes to GitHub's metadata contract
   fail closed and may require a mod update.
6. GET the workflow file at the run's immutable head commit. Require the approved
   Git blob and SHA256 of its decoded contents. Neither the mutable main branch
   nor a hash written into the downloaded locator is authoritative.
7. Parse all 28 fixed feature names and canonical RVAs, checking the live PE identity. Empty optional slots disable their dependent features. Reject orphan entries.
   Ask Windhawk for the same named symbols, but compare every returned address
   with the verified entry before using it. Prior unverified Windhawk cache entries
   and a payload changed between downloads cannot bypass this comparison.
8. Apply the independent local executable-range, unwind-boundary, approved-leaf,
   E9-thunk and overlap checks. Register hooks only after the complete group
   succeeds. No native function is called merely because a download named it.

The trust source is GitHub's authenticated HTTPS API and immutable artifact/run
records. This is not a custom signature key controlled by the author and not a
Sigstore/DSSE attestation verifier. GitHub infrastructure, its hosted tools, the
approved extractor/actions and official Brave inputs remain trusted. A flaw in
that trusted code or infrastructure is outside the account-only protection.
Function names and boundaries do not prove that future implementations keep the
same ABI or affect appearance only. The maintainer still decides whether this
author-hosted service/design is acceptable for the Windhawk catalog.

## Offline, timing and privacy

Previously verified builds and standard Windhawk symbols can be reused offline.
An old standard cache by itself is insufficient on first use of this gate. If
the APIs are unavailable, rate limited, deleted, oversized or inconsistent, a new
verification is refused. No fallback to unverified addresses or large PDBs exists.

All proof requests are bounded HTTPS GETs to `raw.githubusercontent.com` and
`api.github.com`. Redirects, cookies and HTTP authentication are disabled. No user
token or login is requested. The first verification uses four small metadata
lookups plus the two branch files; warm use needs none of those proof requests.
GitHub sees the public IP and URLs, including the requested Brave build. There
are no uploads, browsing data or analytics. Anonymous API limits apply per public
IP and can affect users sharing a connection. The request time budget and native
timeouts limit startup waiting; no periodic downloader or retry worker is added.

Raw artifacts are retained for 90 days. Verification uses their immutable metadata
even if the stored artifact payload has expired, provided GitHub still serves
that metadata and the matching branch payload exists. Deleting the metadata
blocks first-time verification; an existing verified local entry still works.
Retaining or backfilling very old Brave builds may require regenerating them from
their official assets. The client never needs authenticated artifact downloads.

The main schedule requests a run every two hours at minute 17, with a backup at
minute 47 in the same hours. GitHub schedules can be delayed or dropped. Both
checks are metadata-only when no official release/asset/contract changed. A log
records the requested cron and actual UTC start. Manual backfill remains available.

## Approval and tests

To change the pipeline, review the new YAML, extractor and action revisions,
publish/test an exact-build artifact, and update both compiled workflow hashes in
a new reviewed mod version. Do not make approval a server-side switch: branch
files cannot update the trust policy of an installed client.

`node tests/run-pipeline-trust.cjs` runs the real verification/parser/storage code
against fake API responses, including replaced payloads, cross-PDB substitutions,
wrong hashes/repos/branches/runs, failed or incomplete runs, changed workflow
bytes, hidden self-hosted attempts and offline storage corruption. It performs no
network requests. Pass an output directory followed by `--live <chrome.dll>` to
explicitly verify real published data anonymously, mapping the DLL without
executing it and installing no hooks.
