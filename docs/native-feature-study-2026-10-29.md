# Brave Acrylic 3.8: native feature compatibility study

The [read-only GitHub Actions study](https://github.com/bardelyne/brave-acrylic/actions/runs/40912205937)
tested **12 official Windows x64 builds across 11 Brave major versions**. It used
the current 31-target feature extractor: 30 native functions and one immutable
background vtable, with separate dependencies for all six feature groups.

The research revision is
[`8cebebf23dae85654fd71a7e632ca6e8bef6e284`](https://github.com/bardelyne/brave-acrylic/commit/8cebebf23dae85654fd71a7e632ca6e8bef6e284),
on a separate test branch. The production branch, Windhawk PR, approved workflow
and published compatibility data were not changed by this study.

## Results

| Brave | Chromium | Vertical tabs | Toolbar | Webpage backing | Menus | Popups | Suggestions |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.88.138 | 146.0.7680.178 | Unavailable | Pass | Pass | Unavailable | Unavailable | Unavailable |
| 1.89.145 | 147.0.7727.137 | Unavailable | Pass | Pass | Unavailable | Unavailable | Unavailable |
| 1.90.128 | 148.0.7778.217 | Unavailable | Pass | Pass | Unavailable | Unavailable | Pass |
| 1.91.180 | 149.0.7827.201 | Unavailable | Pass | Pass | Unavailable | Unavailable | Pass |
| 1.92.144 | 150.0.7871.186 | Unavailable | Pass | Pass | Unavailable | Unavailable | Pass |
| 1.93.138 | 151.0.7922.173 | Pass | Pass | Pass | Pass | Pass | Pass |
| 1.94.121 | 152.0.7977.83 | Pass | Pass | Pass | Pass | Pass | Pass |
| 1.95.104 | 153.0.8010.53 | Pass | Pass | Pass | Pass | Pass | Pass |
| 1.96.61 | 154.0.8037.98 | Pass | Pass | Pass | Pass | Pass | Pass |
| 1.97.59 | 155.0.8059.85 | Pass | Pass | Pass | Pass | Pass | Pass |
| 1.98.60 | 156.0.8078.48 | Pass | Pass | Pass | Pass | Pass | Pass |
| 1.98.62 | 156.0.8078.74 | Pass | Pass | Pass | Pass | Pass | Pass |

Seven builds validate all six groups. Five older builds validate a subset. The
workflow completes the analysis and reports unavailable features instead of
discarding the groups that passed.

Older-build limitations are explicit:

- Brave 1.88–1.92 lack the exact vertical-tab constructor used by this mod. This
  concerns the internal implementation, not the existence of vertical tabs.
- Their native rounded-rectangle drawing function has an unsupported entry
  layout, so menus and popups are left unavailable.
- Brave 1.88–1.89 also lack the exact suggestions-frame constructor prototype.

No unknown entry layout, missing prototype or unrelated alias was approved to
improve these results.

## Checks and limits

Each job verifies the official archive checksum and asset metadata, selects the
matching PDB using the DLL's identity, and runs the production feature extractor
twice. Both passes must produce identical maps and records. Every enabled group
must contain all its validated dependencies. Missing groups produce explicit
empty entries in the standard named-symbol map.

Only small maps, reports, instruction samples and summaries are uploaded. The
official DLL and multi-gigabyte PDB remain on the runner and are deleted after
analysis. Downloaded browser code and PDB source-server commands are never
executed. The workflow has read-only repository permissions and no production
publishing step.

All 12 downloaded report/map pairs were checked locally against their hashes,
feature declarations and the exact extractor source hashes from the research
commit. The Brave 1.98.62 map is byte-for-byte identical to the validated map used
for the local 3.8 installation:

`b1abf7501ad9c099810924ba8e5aaf7997f740b71a297c8ee9aee7749a064f2b`

**Pass means extraction and structural compatibility checks passed.** It does
not mean that all these older browsers were launched for visual or interaction
testing, and it is not a forecast of future Brave compatibility. Native UI/ABI
changes can still require a mod update. The local 1.98.60 and 1.98.62 targets also
passed the existing Windows client validation; popup appearance was tested
separately on the local test browser.
