# Advanced reference

Brave Acrylic is **alpha software** and requires **Translucent Windows** configured for `brave.exe`. Start with the built-in Dark + Blue theme before changing diagnostic switches.

## Color list and per-window detection

The Windhawk **Colours to make transparent** setting controls actual RGB matching. It accepts up to 16 entries. Each entry is six hexadecimal digits (`RRGGBB`); a leading `#` is accepted. Matching applies only to fully opaque colors.

The main toolbar color must be listed before a palette is eligible. The mod reads the original `kColorToolbar` value through Brave's unmodified color-provider function. It does not inspect the pixels of an already transparent window or reuse a global “private window” flag.

Clearing uses Brave's native `View::GetColorProvider()` accessor instead of reading presumed private object members. The current provider is queried on relevant paints; provider pointers are not kept in a lifetime cache. A theme change or newly created private window therefore gets its own check.

If the provider is missing, the toolbar color is not listed, or Chromium returns its missing-color placeholder, the original paint path is retained. A shared secondary color cannot enable an otherwise unmatched palette.

The setting is a shared list, not a list of pairs. There is no separate toolbar/sidebar association in the settings. Any exact listed color returned by an eligible palette can become transparent, including a foreground color used elsewhere. Keep the list specific.

## Optional configuration file

The optional file is `C:\ProgramData\Windhawk\brave-acrylic.cfg`. It is read when the mod loads; editing it does not change an already running browser. A missing file uses the compiled defaults. Changing a file in this protected location may require administrator access.

Use `key=value`, one setting per line. Blank lines and lines starting with `#` are accepted. Numeric values are decimal except `bgColor`, which is hexadecimal. The color list itself belongs in Windhawk's Settings tab, not this file.

A minimal diagnostic example:

```ini
useSignatures=1
useSymbols=0
logColors=1
```

After collecting colors, set `logColors=0` and restart Brave normally.

| Key | Default | Purpose |
| --- | --- | --- |
| `useSignatures` | `1` | Discover the required functions by validated byte signatures. This is the normal path. |
| `useSymbols` | `0` | Use Brave's symbol server instead. Overrides the signature path and can download a multi-gigabyte PDB. Leave off unless diagnosing a resolver issue. |
| `logColors` | `0` | Log distinct opaque color ID/RGB pairs, capped at 256 pairs per process. No page contents or URLs are recorded by this feature. |
| `colorProvider` | `1` | Enable exact configured-color substitution. A complete clearing path is also required. |
| `clearViews` | `1` | Clear eligible browser-container backgrounds before repainting. Turning this off disables the transparency path to avoid stale pixels. |
| `clearFrame` | `1` | Enable the optional theme-checked frame-paint hooks when resolved through symbols. |
| `backdropType` | `3` | DWM backdrop request: `-1` leaves it alone, `1` none, `2` Mica, `3` acrylic, `4` Mica Alt. Keep the required Translucent Windows setup consistent with the effect you want. |
| `heartbeat` | `1` | Recheck browser frames periodically for window-style maintenance and new frames. It does not rescan `chrome.dll` or sample background pixels. |
| `keepThickFrame` | `1` | Preserve the resize-frame style if Brave removes it. |
| `dwmExtend` | `0` | Extend the DWM frame across the client area. Diagnostic option; it can expose a second set of caption buttons. Leave off normally. |
| `gpuAlpha` | `1` | Request premultiplied alpha on intercepted DXGI swapchain creation. Whether these hooks are used depends on Brave's rendering path. |
| `transparentContents` | `1` | Optional symbol-only hook for the native window-transparency gate. Some Brave builds do not call this function. It does not inject transparency into webpage DOM or CSS. |
| `translucentHandler` | `0` | Optional symbol-only HWND handler translucency override. Experimental; leave off normally. |
| `auraTransparent` | `0` | Optional symbol-only Aura transparency override. Experimental; leave off normally. |
| `traceColor` | `0` | Log native call-stack offsets for the color selected by `bgColor`. For maintainer diagnostics. |
| `bgColor` | `333C4D` | Hex RGB filter for `traceColor`; **does not replace the Windhawk color list**. |
| `traceLimit` | `25` | Maximum number of trace stacks to record per process. |

Both `colorProvider=1` and `clearViews=1` are needed for normal transparency. The options are diagnostic controls, not independent appearance presets.

## Collect logs

Use Windhawk's own log viewer; the published source has no local-header dependency or hardcoded developer log file.

1. Open Brave Acrylic in Windhawk and temporarily disable it.
2. Open **Advanced**, set **Debug logging** to **Detailed debug logs**, and select **Show log output**.
3. Enable the mod and restart Brave normally to capture initialization.
4. Reproduce the issue, then save the output.
5. Restore debug logging to **None**. If you enabled `logColors`, turn it off and restart Brave too.

These steps follow [Windhawk's troubleshooting guide](https://github.com/ramensoftware/windhawk/wiki/Troubleshooting#some-or-all-windhawk-mods-dont-work).

Look for:

- The discovered `kColorToolbar` ID. Its numeric value can change between Brave builds; never assume a number from an old log.
- A signature scan/cache report resolving all **five** required functions.
- Messages about missing, ambiguous, or unhookable functions. The transparency path remains off when a required dependency is unavailable.
- With `logColors=1`, original color ID/RGB pairs. Match the discovered toolbar ID to find its original color in that palette. Activate the relevant regular/private/Tor window while collecting colors.

## Cache and update safeguards

Resolved function addresses are saved in `%LOCALAPPDATA%\brave-acrylic.cache`. The key includes the exact `chrome.dll` timestamp, image size, and signature-set revision. Every cached target must still match the signature and begin at a sufficiently large native x64 function entry.

The resolver accepts exactly one match per required function. It excludes relocation addresses and selected changing operands from signatures. A missing or ambiguous match does not fall back to an arbitrary address.

The toolbar ID comes from read-only named-color tables, with bounded pointer/string reads, adjacent-entry checks, and agreement between duplicate definitions. Its lookup runs once at browser startup. A table format change disables the effect rather than guessing an ID.

These checks improve resistance to updates; they cannot make private Brave APIs permanent. A major compiler or rendering change can still require a mod update.

## Rendering scope

The mod targets `brave.exe`, requests window composition changes, replaces selected native colors, and clears an explicit set of browser containers. Menus and popups are excluded from top-level frame-style adjustments, although exact color replacement can still affect elements sharing an eligible palette.

Webpage-transparency experiments are not included. No website script, DOM override, extension, screenshot sampler, or webpage-background hook is installed.

The tested setup uses Translucent Windows for the visible backdrop. If you see duplicate minimize/maximize/close controls, enable **Use compact mode** in Brave's Appearance settings. This advice also appears directly in the mod's Settings tab.
