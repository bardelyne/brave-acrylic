# Brave Acrylic

![Brave Acrylic](https://raw.githubusercontent.com/bardelyne/brave-acrylic/main/assets/brave-acrylic-v3.3.png)

Reveal the Windows backdrop through Brave's vertical tab area, frame, toolbar, address field, and webpage area. Add rounded acrylic menus and native popups, plus blur behind address-bar suggestions. Native background targeting replaces the old color list. Use a website-styling extension for backgrounds painted by websites.

> **Alpha software.** **[Translucent Windows](https://windhawk.net/mods/translucent-windows) is required**, configured for `brave.exe`. Brave Acrylic exposes the background; Translucent Windows supplies the effect.

## Requirements

- x64 version of Brave.
- Windhawk with Brave Acrylic enabled.
- Translucent Windows configured to apply a translucent effect to `brave.exe`.
- Windows Transparency effects enabled.

## Compatibility

Windows 11 is the tested environment. Windows 10 is unverified; the backdrop provider and selected effect must support that Windows version. Native ARM64 Brave is unsupported.

The combined menu/suggestion build is tested with Brave 1.98.60; all native targets also validate on Brave 1.98.62 / Chromium 156. Other builds need valid compatibility data for their exact `chrome.dll`. Native interfaces and rendering behavior can change and may require a mod update.

The earlier background-only native contract was validated on seven official releases from Brave 1.93.138 through 1.98.62 (Chromium 151–156). This checks the native compatibility data; it is separate from visual testing. See the [compiler study](docs/compiler-resilience.md).

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
| **Acrylic menus** | On | Blur native context menus, the main menu, and submenus. Text, icons, selection, and input stay native. |
| **Acrylic popups** | On | Blur supported native browser bubbles. Extension and website HTML overlays keep their own styling. |
| **Blur search suggestions** | On | Blur the address-bar results below the input cutout, keeping typed text and result text sharp. |
| **Hide duplicate Windows buttons** | Off | Optional workaround that removes the real Windows system-menu style. It can affect Alt+Space, taskbar menus and other window tools. Prefer Brave's **Use compact mode** option in Appearance. |
| **Use verified online symbol cache** | On | Download and verify exact-build data against the approved GitHub pipeline before accepting any Windhawk symbol addresses. Turn off for previously verified builds only. |

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

The full native path uses **27 functions**, of which **16 are private hooks**, and one immutable background-class vtable. Each feature has its own dependency set; unavailable features keep their native appearance. The implementation uses no sampled colors, private object-member offsets, guessed screen rectangles, screenshot polling, extra backing windows, or GPU hooks. Normal DirectComposition stays enabled, with no special browser launch flag. Windows supplies one backdrop. Acrylic can turn gray when inactive; choose a suitable blur mode in Translucent Windows if you prefer a persistent effect.

## Menus, popups and suggestions

Native menus and bubbles keep their own theme colors with reduced background alpha. A Windows host-backdrop visual sits underneath Chromium in the same popup window and follows its actual rounded background geometry. There are no extra overlay windows or input forwarding. A private composition worker owns its own dispatcher; disabling the mod closes its targets and joins that worker without changing Brave's dispatcher. If Windows cannot read the host-backdrop capability flag, cleanup removes the visual effect without guessing a prior flag value.

Suggestions use Chromium's existing rounded compositor layer. Blur is restricted to results below the native input cutout, so typed text stays sharp. Native layer changes are restored on their owning UI thread when the mod unloads. These options affect native browser surfaces; they do not turn website dialogs or extension HTML into acrylic. Windows high contrast and the transparency preference are respected.

## Symbol resolution, privacy and updates

Brave Acrylic resolves the exact C++ prototypes and background-class identity with Windhawk's supported `HookSymbols` / `WH_HOOK_SYMBOLS_OPTIONS::onlineCacheUrl` mechanism. Before accepting any returned address, the mod requires compatibility data authenticated against its approved generation pipeline. No build-specific addresses are embedded and remote PDB downloads remain disabled.

The small feature cache and proof locator are published under `brave-acrylic-features/` on this repository's [`symbol-cache` branch](https://github.com/bardelyne/brave-acrylic/tree/symbol-cache). Branch contents alone are not trusted. On first use of a build, the mod checks GitHub's HTTPS API for the immutable artifact's SHA256, exact PDB identity, original repository, successful run and GitHub-hosted job attempts. It fetches the workflow at that run's immutable commit and checks its complete bytes against a SHA256 compiled into the mod. The approved workflow checks out fixed extractor and action revisions. Every Windhawk-resolved address must then match the verified named entry and pass local executable-boundary, leaf, thunk and overlap checks.

**Cache ownership:** this service is operated by bardelyne, the mod's author. It is not an official Windhawk cache. The approved workflow and its dependencies remain part of the trust boundary.

Editing the cache branch, replacing the locator, changing the workflow, or changing tools on main cannot silently authorize different functions. A pipeline change requires a reviewed mod update approving the new policy. This trusts GitHub's API/TLS and hosted infrastructure plus the approved extractor and official Brave inputs; it is not a proof that a native ABI can never change. The data is author-hosted, not the official Windhawk cache, and maintainer acceptance remains a separate decision. See the [trust design](https://github.com/bardelyne/brave-acrylic/blob/main/docs/trusted-pipeline.md).

Successfully verified data is retained in Windhawk's per-mod storage, scoped to the exact PDB identity and approved workflow. Warm launches reuse it offline. Old Windhawk entries without this proof cannot bypass the gate. If proof, rate limits, networking or function validation prevent a first-time verification, transparency stays off rather than using unverified addresses. There is no polling or retry thread in the mod.

**No telemetry, uploads or login:** requests are download-only GETs to GitHub. No token, browser cookies, history, page content, settings, account details or analytics are sent. GitHub necessarily sees the requester's IP and requested URLs, including the build identity. Turn **Use verified online symbol cache** off and re-enable the mod for offline-only operation; a build must have been verified previously. Initial verification adds several small API requests at startup and can be affected by GitHub's anonymous rate limits. Existing requests cannot be withdrawn by changing the setting.

The workflow requests a check **every two hours, with a backup 30 minutes later**. GitHub can delay or drop scheduled starts, so this is not an exact timer. Unchanged releases skip all browser and PDB downloads. Large official files stay on the GitHub runner. The raw exact-PDB artifact is retained for 90 days; local verified entries continue working if upstream metadata later becomes unavailable. Re-enable the mod or reopen Brave normally after new data becomes available.

The extractor handles verified compiler folding according to each function's role, while rejecting unrelated sharing on patched functions. The workflow reports compatibility separately for vertical tabs, the toolbar, webpage backing, menus, popups, and suggestions. A missing or changed function disables only its dependent features. Validated features are still published, and the workflow summary lists unavailable features with their reasons. Invalid files, mismatched symbols, failed downloads, and publishing errors still stop publication.

## Duplicate corner buttons

If two sets of minimize/maximize/close buttons appear, first enable **Use compact mode** in Brave **Settings → Appearance**. The optional **Hide duplicate Windows buttons** workaround is off on a fresh install because it removes the window's actual `WS_SYSMENU` style. Windows system menus, taskbar interactions, accessibility tools or other window managers may be affected. Previously saved preferences are preserved. Disabling the option or unloading the mod restores its recorded style changes.

## Troubleshooting

Reopen Brave normally after installation or native-area changes. Enable Windhawk debug logging to check the availability messages for each native feature or a Windhawk symbol-cache message. For website styling, check Zen Internet's transparency setting and whether that site has a supported style, or check the CSS and site scope of your Stylus style.

For reports, include Windows/Brave versions, window type, enabled areas, backdrop configuration, and reproduction steps. See the [advanced reference](docs/advanced.md), [compatibility data](docs/compatibility.md), [webview investigation](docs/webview-background.md), and [changelog](CHANGELOG.md).
