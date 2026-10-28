# Compiler compatibility study

GitHub Actions downloaded official Windows archives and matching multi-gigabyte
PDBs for six stable releases. The archives were checked against official SHA256
assets; the DLL's GUID/DBI age selected and authenticated its PDB identity.
Downloaded browser code and PDB source-server commands were never executed.
Only small analysis reports and candidate text caches left the runners.

| Brave | Chromium | Previous rules | Revised rules |
| --- | --- | --- | --- |
| 1.94.121 | 152.0.7977.83 | Rejected background forwarder | Pass |
| 1.95.104 | 153.0.8010.53 | Rejected background forwarder | Pass |
| 1.96.61 | 154.0.8037.98 | Pass | Pass |
| 1.97.59 | 155.0.8059.85 | Rejected background forwarder | Pass |
| 1.98.60 | 156.0.8078.48 | Pass | Pass |
| 1.98.62 | 156.0.8078.74 | Rejected callable helper alias | Pass |

The [baseline study](https://github.com/bardelyne/brave-acrylic/actions/runs/40774103779)
found the differences. The [validation run](https://github.com/bardelyne/brave-acrylic/actions/runs/40775254632)
required the revised extractor to validate all thirteen native functions and
generate a complete text cache for every release.

## What changed

Seven functions are patched and six are called. The extractor now distinguishes
those roles. Compiler folding of a called helper is accepted because invoking
that exact named function does not modify any of the aliases' instructions.
Every required prototype, executable boundary, identity, supported leaf layout,
direct-jump relationship and nonoverlap check still applies. Required function
slots must remain distinct; aliases do not authorize missing or renamed ABIs.

Patched functions still reject unrelated aliases. One precise exception is
allowed: the validated direct E9 entry of `ContentsWebView::OnThemeChanged`
forwards to `ContentsWebView::UpdateBackgroundColor` on the observed older
builds. The known alias is accepted only at that exact validated body, with the
same `void(this)` calling convention. It is not accepted at an arbitrary entry,
on another hook, through another thunk, or under a similar class/method name.

Matching Chromium source confirms `OnThemeChanged` calls the base method and
then `UpdateBackgroundColor`. The emitted direct jump and exact public symbols
prove the forwarding relationship for each admitted build. Source examples:
[Chromium 155](https://github.com/chromium/chromium/blob/155.0.8059.85/chrome/browser/ui/views/frame/contents_web_view.cc),
[Chromium 153](https://github.com/chromium/chromium/blob/153.0.8010.53/chrome/browser/ui/views/frame/contents_web_view.cc).

No release-specific addresses or wildcard name guesses were added. Normal code
fingerprints continue to be generated from the actual matching build. Register
allocation and changed addresses in ordinary unwind-backed functions therefore
do not need a new hardcoded instruction pattern.

## Ongoing checks

The ordinary two-hour workflow first checks metadata and skips unchanged builds.
If extraction fails after official inputs were downloaded, it inspects those
same files and uploads a small diagnostic report. Unsupported output is not
published. The report records missing/ambiguous names, aliases, forwarding jumps,
code samples, disassembly and boundary failures without another large download.

The separate manual compiler-research workflow accepts up to twelve unique
stable release tags. It verifies each official release, inspects its exact PDB,
and requires the candidate extractor to pass. This historical study is not run
every two hours. Large inputs are neither committed nor uploaded as artifacts.

Six passing builds demonstrate coverage of these observed variations. They do
not establish a percentage for future updates. Inlining that removes a needed
hook, signature/object-layout changes, unknown leaf forms, unrelated hook-body
sharing and unsupported jump chains still require review and may disable the
effect rather than guessing addresses.
