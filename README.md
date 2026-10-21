<div align="center">

# Brave Acrylic

**Your browser, with a little more desktop.**

![Status: alpha](https://img.shields.io/badge/status-alpha-orange)
![Windows 11](https://img.shields.io/badge/Windows-11-0078D4)
![Brave x64](https://img.shields.io/badge/Brave-x64-FB542B)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Fast setup](#fast-setup) · [Custom themes](#advanced-setup) · [How it works](#how-it-works) · [Troubleshooting](#troubleshooting)

</div>

![Brave Acrylic with the built-in blue theme](assets/brave-acrylic-v2.8.png)

Brave Acrylic makes selected toolbar and vertical-tab backgrounds transparent so the desktop backdrop shows through. Regular, private, and Tor windows are checked against their own themes, so blue, purple, and pink windows can work together.

> **Alpha software.** This mod is still being tested and may need fixes after Brave updates. **[Translucent Windows](https://windhawk.net/mods/translucent-windows) is required** and must be enabled for `brave.exe` to provide the background effect.

## Requirements

- Windows 11 and the **x64 version of Brave**.
- [Windhawk](https://windhawk.net/) with **Brave Acrylic** enabled.
- The **[Translucent Windows](https://windhawk.net/mods/translucent-windows)** mod, configured to apply a translucent background effect to `brave.exe`.
- Windows **Transparency effects** enabled.

## Fast setup

**Go to Brave Settings → Appearance, select Dark appearance, then choose the built-in Blue color theme.** The default color list is already configured for it.

1. Enable **Brave Acrylic** and the required **Translucent Windows** mod. In Translucent Windows, apply the background effect you want to `brave.exe`.
2. Open `brave://settings/appearance`, select **Dark** appearance, and choose the built-in **Blue** theme.
3. Enable **vertical tabs** for the layout in the screenshot.
4. Close all Brave windows normally and reopen Brave.

> **Seeing two sets of minimize, maximize, and close buttons?** Enable Brave's **Use compact mode** option in Appearance. The same fix is explained in the mod's Settings tab.

### Install before the Windhawk submission is merged

Open [brave-acrylic.wh.cpp](brave-acrylic.wh.cpp), choose **Raw**, and copy the source. In Windhawk, open **Create a new mod**, replace the editor contents with that source, then compile and install it. No additional headers or DLLs are needed.

Once the mod is accepted into Windhawk's catalog, it can be installed from the catalog normally.

## Advanced setup

### Choose your own colors

Open Brave Acrylic's **Settings** tab and edit **Colours to make transparent**. Add one six-digit RGB value per row, without an alpha channel.

| Default color | Surface in the built-in Dark + Blue theme |
| --- | --- |
| `333C4D` | Vertical tab strip |
| `1D2636` | Main toolbar |

**The window's original main toolbar color must be in the list.** That enables the effect for its palette. Other configured colors can then become transparent in that palette.

To find another theme's colors:

1. Temporarily disable Brave Acrylic and restart Brave to restore its original, opaque UI colors.
2. Take a screenshot and sample a flat area of the toolbar and sidebar. Avoid text, icons, borders, shadows, and hover effects.
3. Add the sampled RGB values to the mod's settings, enable the mod, and restart Brave normally.

Sample the **original paint color**, not an area already blended with acrylic. Enter colors as `RRGGBB`; a leading `#` is also accepted. Up to **16 colors** are supported. An empty list retains the built-in defaults.

Matching is exact. There is no tolerance setting that could also remove nearby colors.

### Blue, purple, and pink together

Keep the blue theme's entries and add the original toolbar and sidebar colors for a purple private window or a pink Tor window. Each window uses its own native color provider, so enabling one theme does not blindly clear another window's background.

An unlisted toolbar color keeps that palette's normal background painting. There are no hardcoded purple or pink presets: private and Tor windows use the same check as ordinary windows.

The color list is shared across eligible palettes. An exact listed color can also appear in text, buttons, or popup backgrounds. Add colors carefully: adding a common foreground color such as pure white can remove text too.

### Restart after changing colors

Brave caches brushes and opacity information when windows are created. Saving new colors does not rebuild every cached surface. Close **all** Brave windows normally and reopen Brave. If Brave is configured to keep running in the background, exit that background instance normally as well.

### Blur, tint, and backdrop

Use the required **Translucent Windows** mod to choose the background effect and tint for `brave.exe`. Brave Acrylic selects which original browser colors become transparent; Translucent Windows supplies the backdrop visible through them.

These are different controls: the color list selects paint to remove, while the backdrop settings control what you see behind it.

### Diagnostics and optional switches

Most users only need the color list. Optional switches are read at browser startup from `C:\ProgramData\Windhawk\brave-acrylic.cfg`.

For example, `logColors=1` reports native color IDs and original RGB values through **Windhawk's debug logging**. Use it temporarily when identifying a theme, then turn it off.

The [advanced reference](docs/advanced.md) explains every switch, log collection, and the resolver's safeguards.

## How it works

1. **Find Brave's native drawing functions.** The default resolver scans `chrome.dll` at actual x64 function entries. Each required function must have one unique signature match.
2. **Discover the toolbar color ID.** It finds `kColorToolbar` in Brave's own named-color tables. The enum number is discovered rather than fixed in the mod, and duplicate definitions must agree.
3. **Check the original palette for each window.** The window's native color provider supplies its original toolbar color. An unmatched or unavailable palette keeps its original background painting.
4. **Remove matching paint and clear old pixels.** Exact listed opaque colors become transparent. An allowlist of browser containers is cleared on repaint so previous tab labels and backgrounds do not leave trails. Interactive child views are not blanket-cleared.
5. **Let Windows composite the backdrop.** Frame adjustments apply to real browser windows. Owned menus and popups are excluded from those frame adjustments. Translucent Windows provides the configured background effect.

Function addresses are cached for the exact `chrome.dll` build and rechecked before use. The named-color table is checked once per browser launch. There is no screenshot polling, webpage injection, or recurring full-module scan.

Function discovery is local: **no Brave debug-symbol download is used**. The obsolete optional symbol-server path was removed in 2.8.1.

## Compatibility

- Tested on **Windows 11 26H2**, **Brave 1.97.59** / **Chromium 155.0.8059.85**, x64.
- The per-window check has been tested with regular, private, and Tor window themes.
- Native ARM64 and 32-bit Brave are not supported. Unsupported native processes are refused before any hooks are installed.
- Website backgrounds remain under the website's control. Ordinary webpages are not made transparent by this mod.

**This is an alpha release, not a guarantee of future Brave compatibility.** The resolver tolerates changing relocation addresses and validates cached function boundaries, but it still works with private Brave functions. If a required function or the named-color table cannot be identified, the transparency path stays disabled.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| No transparency | Enable **both mods**, apply Translucent Windows to `brave.exe`, choose Dark + built-in Blue, then restart Brave. |
| Two sets of minimize/maximize/close buttons | Enable Brave's **Use compact mode** in Appearance, as explained in the mod settings. |
| Private or Tor window stays opaque | Add that theme's **original main toolbar color** and any sidebar colors you want removed. An unmatched palette stays opaque deliberately. |
| Text or icons disappear | Remove the color that also matches those elements, then restart Brave. Avoid adding common foreground colors. |
| Effect stops after a Brave update | Collect [Windhawk debug output](docs/advanced.md#collect-logs) and include your exact Brave version in a bug report. |
| Old colors remain after saving settings | Exit every Brave window and any background instance normally, then reopen Brave. |

For a bug report, include Windows and Brave versions, the theme and window type, your color list, Translucent Windows settings, and steps to reproduce. Avoid sharing private browsing information in screenshots or logs.

## Credits and license

Created by [bardelyne](https://github.com/bardelyne) with AI assistance. Built for [Windhawk](https://windhawk.net/). The required [Translucent Windows](https://windhawk.net/mods/translucent-windows) mod provides the backdrop shown in the screenshot. Brave and Chromium provide the native UI and color-provider functions this mod works with.

[MIT license](LICENSE).
