# Brave Acrylic

![Brave Acrylic](https://raw.githubusercontent.com/bardelyne/brave-acrylic/main/assets/brave-acrylic-v3.3.png)

Reveal the Windows backdrop through Brave's vertical tab area, frame, toolbar, address field, and webpage area. Native background targeting replaces the old color list. Use a website-styling extension for backgrounds painted by websites.

> **Alpha software.** **[Translucent Windows](https://windhawk.net/mods/translucent-windows) is required**, configured for `brave.exe`. Brave Acrylic exposes the background; Translucent Windows supplies the effect.

## Requirements

- x64 version of Brave.
- Windhawk with Brave Acrylic enabled.
- Translucent Windows configured to apply a translucent effect to `brave.exe`.
- Windows Transparency effects enabled.

## Compatibility

Windows 11 is the tested environment. Windows 10 is unverified; the backdrop provider and selected effect must support that Windows version. Native ARM64 Brave is unsupported.

Tested with Brave 1.98.60 / Chromium 156. Other builds need valid compatibility data for their exact `chrome.dll`. Native interfaces and rendering behavior can change and may require a mod update.

## Fast setup

1. Enable Translucent Windows for `brave.exe` and choose the desired backdrop.
2. Enable Brave Acrylic. Leave **Vertical tabs background**, **Toolbar**, and **Webpage background** on.
3. Close all Brave windows normally and reopen Brave. Exit its background instance too if it stays running.
4. Optionally use Zen Internet or Stylus to remove backgrounds inside websites, as explained below. Stylus requires custom CSS.

No theme-color setup is required. Old saved color-list and website-code settings are ignored by this version.

## Controls

| Setting | Default | Purpose |
| --- | --- | --- |
| **Vertical tabs background** | On | Reveal the backdrop behind the vertical tab area and browser frame. |
| **Toolbar** | On | Clear the toolbar, bookmarks bar, and unfocused address-field backgrounds. Focused address fields keep their native theme. |
| **Webpage background** | On | Clear only Chromium's background behind the webpage area, including its default white fallback. Website HTML, CSS, and content are unchanged. Use Zen Internet or Stylus for website backgrounds; Stylus requires custom CSS. |
| **Hide duplicate Windows buttons** | Off | Optional workaround that removes the real Windows system-menu style. It can affect Alt+Space, taskbar menus and other window tools. Prefer Brave's **Use compact mode** option in Appearance. |
| **Use Windhawk online symbol cache** | On | Let Windhawk fetch a small named-symbol cache when exact-build data is missing locally. Turn off and re-enable the mod to use only locally cached data. |

Some backing views and compositor properties are created with the window, so changing Vertical tabs background or Toolbar may require reopening Brave. Enabling Webpage background applies when a tab is selected, without refreshing the page. Reopening Brave after disabling it restores existing renderer defaults. The caption-button option applies immediately.

## Website backgrounds with extensions

**Webpage background** clears only Chromium's backing layer underneath websites, including the default white fallback. It does not modify website HTML, CSS, or content. To remove backgrounds painted by a website, use a styling extension such as Zen Internet or Stylus.

### Zen Internet

For backgrounds inside websites, install [Zen Internet from the Chrome Web Store](https://chromewebstore.google.com/detail/zen-internet/dpkamhkboipomecencjpammmjdfkgjha). Open the extension, go to **Advanced Settings**, and turn **Disable Transparency** **off** under **Global Feature Controls**. Keep **Webpage background** enabled in Brave Acrylic. Open a new tab or reload an existing page to apply extension setting changes.

Zen Internet applies website-specific styles; coverage and results vary by site. Brave Acrylic removes the browser's backing and white fallback so CSS-transparent page areas can reveal the Windows backdrop. The extension handles website styling. Brave Acrylic does not inject JavaScript or CSS into pages.

The extension's store page cautions that ordinary Chromium does not support transparent pages. Brave Acrylic provides the native transparency path; an extension alone cannot provide the Windows effect. The extension's [source](https://github.com/sameerasw/zeninternet) and [website styles](https://github.com/sameerasw/my-internet) are available separately.

### Stylus

[Stylus from the Chrome Web Store](https://chromewebstore.google.com/detail/stylus/clngdbkpkpeebahjckkjfobafhncgmne) lets you create and manage custom CSS styles for individual websites. **It does not remove website backgrounds out of the box.** You must write or paste CSS rules that make the desired backgrounds transparent, or install a suitable existing userstyle. Complex websites may need rules for several background elements. Keep **Webpage background** enabled in Brave Acrylic so those transparent areas reveal the backdrop.

See the [Stylus guide to writing styles](https://github.com/openstyles/stylus/wiki/Writing-styles) for creating a style and limiting it to a particular website.

## How it works

Brave's existing transparent-host path enables its compositor to preserve transparency. The mod removes the actual vertical-tab backing through Brave's own setter and clears selected native background roles within their paint clip. Child controls and text retain their original painting. Native focus checks preserve the focused address field.

The webpage option clears the native backing during content-view updates and sets Chromium's persistent page-base color when a tab is attached. That value is also used by future renderers, so switching or restoring tabs does not bring the default white background back. Explicit website backgrounds remain visible unless a website-styling extension changes them.

The native path uses **13 functions**, of which **7 are private hooks**. The implementation uses no sampled colors, private object-member offsets, guessed screen rectangles, screenshot polling, extra backing windows, or GPU hooks. Normal DirectComposition stays enabled, with no special browser launch flag. Windows supplies one backdrop. Acrylic can turn gray when inactive; choose a suitable blur mode in Translucent Windows if you prefer a persistent effect.

## Symbol resolution, privacy and updates

Brave Acrylic uses Windhawk's supported `HookSymbols` / `WH_HOOK_SYMBOLS_OPTIONS::onlineCacheUrl` mechanism. Every build uses Windhawk's local symbol cache first, then optionally a small text file containing the thirteen full C++ prototypes and their locations. No build-specific function addresses are embedded in the mod. Remote PDB downloads are disabled, including when a cache file is missing. There is no custom downloader or 30-minute retry thread.

The cache is published on this repository's [`symbol-cache` branch](https://github.com/bardelyne/brave-acrylic/tree/symbol-cache), under `brave-acrylic/pdb_<GUID-and-age>.txt`. It is about **1 KB** for the reference build. It is hosted by this project's author, not the official Windhawk cache repository. The publisher is trusted: local function-boundary, leaf-layout, jump-target and overlap checks are safeguards, not cryptographic proof of function identity. Native ABI or rendering changes can still require a mod update.

**No telemetry or uploads:** the mod sends no browsing history, page content, settings, account details or analytics. Windhawk makes the cache download request; the server necessarily sees the requester's IP address and the build-specific URL. Turn **Use Windhawk online symbol cache** off and re-enable the mod for offline-only resolution. Already cached symbols continue to work offline. The first use of a build needs a cache download unless matching symbols are already available locally. Existing requests cannot be withdrawn by changing a setting.

The workflow checks official stable releases **every two hours**. It downloads Brave and its large symbols only on the GitHub runner, and only when release assets or the native compatibility contract change. It verifies the DLL/PDB identity and exact names before publishing the small text cache. GitHub can delay scheduled runs. If data is unavailable, transparency remains off; re-enable the mod or reopen Brave normally after data becomes available. Older binary-map branches are retained only for older clients.

## Duplicate corner buttons

If two sets of minimize/maximize/close buttons appear, first enable **Use compact mode** in Brave **Settings → Appearance**. The optional **Hide duplicate Windows buttons** workaround is off on a fresh install because it removes the window's actual `WS_SYSMENU` style. Windows system menus, taskbar interactions, accessibility tools or other window managers may be affected. Previously saved preferences are preserved. Disabling the option or unloading the mod restores its recorded style changes.

## Troubleshooting

Reopen Brave normally after installation or native-area changes. Enable Windhawk debug logging to check **13/13 native functions** or a Windhawk symbol-cache message. For website styling, check Zen Internet's transparency setting and whether that site has a supported style, or check the CSS and site scope of your Stylus style.

For reports, include Windows/Brave versions, window type, enabled areas, backdrop configuration, and reproduction steps. See the [advanced reference](docs/advanced.md), [compatibility data](docs/compatibility.md), [webview investigation](docs/webview-background.md), and [changelog](CHANGELOG.md).
