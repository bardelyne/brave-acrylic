# Brave Acrylic

> **Very important — Symbol cache:** Controlled and maintained by **bardelyne**, the author of Brave Acrylic. This is an author-hosted cache, not an official Windhawk service. Our GitHub Actions workflow checks for new Brave releases and prepares small compatibility files from Brave’s official symbols. Windhawk downloads the matching file for your installed Brave build and caches it locally. The large symbol files are processed by the workflow; your PC receives only the small compatibility data.

![Brave Acrylic](https://raw.githubusercontent.com/bardelyne/brave-acrylic/main/assets/brave-acrylic-v3.3.png)

Reveal the Windows backdrop through Brave's vertical tab area, frame, toolbar, address field, and webpage area. Add rounded acrylic menus and native popups, plus blur behind address-bar suggestions. Native background targeting works across theme colors. Use a website-styling extension for backgrounds painted by websites.

> **Alpha software.** **[Translucent Windows](https://windhawk.net/mods/translucent-windows) is required**, configured for `brave.exe`. Brave Acrylic exposes the background; Translucent Windows supplies the effect.

**Restart Brave after applying the mod, updating it, or changing its settings.** Close all Brave windows normally and exit any remaining background Brave instance, then reopen it. This rebuilds native windows and their cached backgrounds.

## Requirements

- x64 version of Brave.
- Windhawk with Brave Acrylic enabled.
- Translucent Windows configured to apply a translucent effect to `brave.exe`.
- Windows Transparency effects enabled.

## Compatibility

Windows 11 is the tested environment. Windows 10 is unverified; the backdrop provider and selected effect must support that Windows version. Native ARM64 Brave is unsupported.

The native-popup suggestion method was tested with Brave 1.98.60 and with regular Brave 1.98.62 / Chromium 156, including YouTube with Zen Internet transparency enabled. The current native contract is validated separately against those two official DLL/PDB pairs. Other builds need valid compatibility data for their exact `chrome.dll`. Native interfaces and rendering behavior can change and may require a mod update.

The earlier background-only native contract was validated on seven official releases from Brave 1.93.138 through 1.98.62 (Chromium 151–156). This checks the native compatibility data; it is separate from visual testing. See the [compiler study](https://github.com/bardelyne/brave-acrylic/blob/main/docs/compiler-resilience.md).

## Fast setup

1. Enable Translucent Windows for `brave.exe` and choose the desired backdrop.
2. Enable Brave Acrylic. Leave **Vertical tabs background**, **Toolbar**, and **Webpage background** on.
3. Close all Brave windows normally and reopen Brave. Exit its background instance too if it stays running.
4. Optionally use Zen Internet or Stylus to remove backgrounds inside websites, as explained below. Stylus requires custom CSS.

No theme-color setup is required.

## Controls

| Setting | Default | Purpose |
| --- | --- | --- |
| **Vertical tabs background** | On | Reveal the backdrop behind the vertical tab area and browser frame. |
| **Toolbar** | On | Clear the toolbar, bookmarks bar, and unfocused address-field backgrounds. Focused address fields keep their native theme. |
| **Webpage background** | On | Clear only Chromium's background behind the webpage area, including its default white fallback. Website HTML, CSS, and content are unchanged. Use Zen Internet or Stylus for website backgrounds; Stylus requires custom CSS. |
| **Acrylic menus** | On | Blur native context menus, the main menu, and submenus. Text, icons, selection, and input stay native. |
| **Acrylic popups** | On | Blur supported native browser bubbles and the native Extensions manager. Extension and website HTML overlays keep their own styling. |
| **Blur search suggestions** | On | Use a native results popup with Windows blur below the input cutout. Typed text, result text and input remain native and sharp. |
| **Hide duplicate Windows buttons** | Off | Optional workaround that removes the real Windows system-menu style. It can affect Alt+Space, taskbar menus and other window tools. Prefer Brave's **Use compact mode** option in Appearance. |
| **Use online symbol cache** | On | Let Windhawk download small exact-build files from the author-controlled cache. Turn off to use existing local cached symbols only, then restart Brave. |

Restart Brave after applying settings, even when a change appears immediately. Some backing views and native popup choices are created with their windows. Webpage backing can apply on tab selection without refreshing the page; restarting after disabling it restores existing renderer defaults. The caption-button option can apply immediately.

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

The full native path uses **29 functions**, of which **20 are private hooks**, and one immutable background-class vtable. Each feature has its own dependency set; unavailable features keep their native appearance. The implementation uses no sampled colors, private object-member offsets, guessed screen rectangles, screenshot polling, input forwarding, or GPU hooks. Normal DirectComposition stays enabled, with no special browser launch flag. Windows supplies the backdrop. Acrylic can turn gray when inactive; choose a suitable blur mode in Translucent Windows for the main window if you prefer a persistent effect.

## Menus, popups and suggestions

Native menus and bubbles keep their own theme colors with reduced background alpha. A Windows host-backdrop visual sits underneath Chromium in the same popup window and follows its actual rounded background geometry. There are no extra overlay windows or input forwarding. A private composition worker owns its own dispatcher; disabling the mod closes its targets and joins that worker without changing Brave's dispatcher. If Windows cannot read the host-backdrop capability flag, cleanup removes the visual effect without guessing a prior flag value.

Tab and group hover cards, including their fading text and memory icons, keep their foreground painting. Their separate client and footer backgrounds are removed, while a tint derived from Brave’s own background color sits beneath Chromium’s content. This keeps the tint consistent during transitions and avoids black fade masks. The same native-popup path covers dialogs such as **Restore pages?**. Windows-drawn popup borders are suppressed where supported and their previous value is restored on unload.

The native **Extensions** manager also clears its repeated scroll-container backgrounds so they cannot cover the blur. Extension names, icons, pin buttons, menus and the Manage extensions button keep their native painting and input. This does not alter HTML content inside an extension's own popup.

Suggestions use Chromium's normal desktop-popup factory instead of its in-window Aura override. Windows supplies the blur behind that native results popup, which also works with the tested Zen Internet transparency setup. Chromium still owns its contents, layout, keyboard navigation and mouse input. Native view bounds and header height define a rounded window region below the address field; there is no input catcher or separate overlay. Resizing and DPI changes update the region, and cleanup restores the actual prior region on the owning UI thread. Restart Brave after applying this option so existing results widgets are rebuilt. These options do not turn website dialogs or extension HTML into acrylic. Windows high contrast and transparency preferences are cached and updated from Windows notifications off Brave’s paint path.

## Symbol resolution, privacy and updates

Brave Acrylic resolves exact C++ prototypes and the background-class identity with Windhawk's supported `HookSymbols` / `WH_HOOK_SYMBOLS_OPTIONS::onlineCacheUrl` mechanism. Windhawk handles its ordinary local cache and optional online download. No build-specific addresses are embedded and remote PDB downloads remain disabled. The mod retains local executable-range, unwind-boundary, approved-leaf, thunk and overlap checks before registering hooks.

Small named-symbol files are published under `brave-acrylic-features-v7/` on our [`symbol-cache` branch](https://github.com/bardelyne/brave-acrylic/tree/symbol-cache). They contain the native function locations needed for each Brave build. The service and publishing workflow are controlled and maintained by bardelyne.

Windhawk handles compatibility downloads and local caching through its standard mechanism. Our workflow uses pinned actions and checks the official Brave archive and matching symbols before publishing. See [cache hosting](https://github.com/bardelyne/brave-acrylic/blob/main/docs/trusted-pipeline.md) for the technical details.

**No telemetry, uploads or login:** the mod only downloads compatibility data through Windhawk. Browser cookies, history, page content, settings and account details stay on your PC. Turn **Use online symbol cache** off and restart Brave to use suitable existing local cached symbols only.

The workflow requests a check **every two hours, with a backup 30 minutes later**. GitHub can delay or drop scheduled starts, so this is not an exact timer. It checks the stable release, asset identities and native contract before downloading large files. Unchanged releases skip browser and PDB downloads. Both generation and publication use the run's same source revision; large official files stay on the GitHub runner. Restart Brave after newly required compatibility data becomes available.

The extractor handles verified compiler folding according to each function's role, while rejecting unrelated sharing on patched functions. The workflow reports compatibility separately for vertical tabs, the toolbar, webpage backing, menus, popups, and suggestions. A missing or changed function disables only its dependent features. Validated features are still published, and the workflow summary lists unavailable features with their reasons. Invalid files, mismatched symbols, failed downloads, and publishing errors still stop publication.

## Duplicate corner buttons

If two sets of minimize/maximize/close buttons appear, first enable **Use compact mode** in Brave **Settings → Appearance**. The optional **Hide duplicate Windows buttons** workaround is off on a fresh install because it removes the window's actual `WS_SYSMENU` style. Windows system menus, taskbar interactions, accessibility tools or other window managers may be affected. Disabling the option or unloading the mod restores its recorded style changes.

## Troubleshooting

Restart Brave after installing or applying changes: close all windows and its background instance, then reopen normally. Enable Windhawk debug logging to check each feature's availability or a symbol-cache message. For website styling, check Zen Internet's transparency setting and whether that site has a supported style, or check the CSS and site scope of your Stylus style.

For reports, include Windows/Brave versions, window type, enabled areas, backdrop configuration, and reproduction steps. See the [advanced reference](https://github.com/bardelyne/brave-acrylic/blob/main/docs/advanced.md), [compatibility data](https://github.com/bardelyne/brave-acrylic/blob/main/docs/compatibility.md), [webview investigation](https://github.com/bardelyne/brave-acrylic/blob/main/docs/webview-background.md), and [changelog](https://github.com/bardelyne/brave-acrylic/blob/main/CHANGELOG.md).
