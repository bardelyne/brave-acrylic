# Advanced reference

Brave Acrylic is **alpha software** and requires **Translucent Windows** configured for `brave.exe`. Start with the built-in Dark + Blue theme.

## Settings

All user settings are in Windhawk. No separate configuration file or administrator access is needed to edit them.

| Setting | Default | Purpose |
| --- | --- | --- |
| **Colours to make transparent** | `333C4D`, `1D2636` | Up to 16 original RGB colors. Include the theme's main toolbar color to enable its palette. |
| **Log colours (diagnostics)** | Off | Report native color IDs and original RGB values through Windhawk's log. Enable temporarily when identifying a theme. |

Colors must contain exactly six hexadecimal digits (`RRGGBB`), optionally preceded by `#`. Leading and trailing whitespace are accepted. Alpha channels, extra digits, and invalid characters are rejected. A bad row is logged and skipped without hiding later valid entries. If there are no usable entries, the built-in defaults are restored.

Settings are parsed into a local snapshot and published under a shared/exclusive lock. Paint readers see a complete list. The hook does not hold that lock while calling Brave's native functions.

Earlier experimental configuration and external-cache files are no longer read. The current settings and signature cache use Windhawk's managed storage.

## Per-window detection

The mod queries the original `kColorToolbar` value through Brave's unmodified color provider. Its numeric ID is discovered from Brave's named-color tables; no fixed enum number or private View-member offset is used.

Clearing uses the native `View::GetColorProvider()` accessor. The current provider is queried on relevant paints, so a theme change or newly opened private/Tor window gets its own check. Provider pointers are not kept in a lifetime cache.

If the provider is missing, the toolbar color is not listed, or Chromium returns its missing-color placeholder, the original painting is retained. A shared secondary color cannot enable an otherwise unmatched palette. Color replacement rechecks the requested color and toolbar color against one settings snapshot.

The setting is a shared color list, not toolbar/sidebar pairs. An exact listed color returned by an eligible palette can affect text, buttons, or popup backgrounds too. Keep entries specific and avoid common foreground colors such as pure white.

## Startup and shutdown

In the browser process, the mod hooks `LoadLibraryExW` from `kernelbase.dll` when `chrome.dll` is not already loaded. It installs and activates the native hooks before returning the newly loaded module to Brave's caller. Resource-only or unresolved library mappings are ignored.

If `chrome.dll` is already present, the initial hook batch is registered in `Wh_ModInit` and activated through Windhawk's normal initialization sequence. A post-init check covers loading between the initial module check and activation of the loader hook. Repeated loads do not install duplicate hooks.

Installation and `Wh_ModBeforeUninit` share a barrier. Disabling the mod stops activation and waits for any in-flight installation before the callback returns. There are no startup polling threads, worker-thread timeouts, or background window-restyling loops.

Process types are read from complete Windows command-line arguments. A URL containing `--type=` cannot be mistaken for a process switch. Renderer and utility processes are skipped before reading settings. The GPU process only installs the narrowly scoped composition hook; it does not read browser color settings.

## GPU behavior

The mod never hooks `CreateSwapChainForHwnd`. HWND swap chains retain Brave's original descriptors.

For composition swap chains, alpha is requested only for compatible RGBA formats: BGRA8, RGBA8, RGBA16 float, and RGB10A2. YUV/opaque formats, protected or restricted video surfaces, and existing explicit alpha choices are left alone. The caller's descriptor is copied, not modified.

If the driver rejects the adjusted alpha mode as invalid or unsupported, creation is retried with the original descriptor. Device failures are returned unchanged.

The GPU hook runs independently of the browser's theme detection and native-function resolver. Eligible composition surfaces can receive the alpha override even when the browser paint path is disabled or a window uses an unmatched theme. Opaque pixels stay opaque. If you see unintended transparent areas while the paint path is inactive, include that detail in your report; the GPU override is a separate place to investigate.

`dxgi.dll` is loaded from System32, and its module reference is kept until Windhawk removes the hook. Translucent Windows controls backdrop selection. Brave Acrylic does not set DWM backdrop attributes, extend frames, add resize borders, or interfere with fullscreen window styles.

## Collect logs

1. Open Brave Acrylic in Windhawk and temporarily disable it.
2. Open **Advanced**, set **Debug logging** to **Detailed debug logs**, and select **Show log output**.
3. Enable the mod and restart Brave normally to capture initialization.
4. Reproduce the issue and save the output. For theme discovery, also enable **Log colours (diagnostics)** in the mod's Settings tab.
5. Restore debug logging to **None** and disable color diagnostics after collecting the information.

These steps follow [Windhawk's troubleshooting guide](https://github.com/ramensoftware/windhawk/wiki/Troubleshooting#some-or-all-windhawk-mods-dont-work).

Look for the discovered `kColorToolbar` ID and a **5/5** signature scan/cache report. The enum ID can change between Brave builds. When collecting colors, activate the relevant regular/private/Tor window and find the original RGB value for that reported ID. Color diagnostics are capped at 256 distinct ID/RGB pairs per process and do not record webpage contents or URLs.

## Cache and update safeguards

One small binary value named `signatureCache` is stored through Windhawk's per-mod storage API. It records the build key, Brave version, five function addresses, and the relative address of the named toolbar-color entry. Windhawk owns the storage and removes it with the mod.

The key includes the exact `chrome.dll` timestamp, image size, and signature revision. Cached addresses must remain inside executable code, start at complete x64 function entries, and match the current byte signatures. Invalid or incomplete values trigger a fresh scan before any native hook is registered.

Each signature must have exactly one function match. Color lookup, class-name lookup, and background-paint signatures extend beyond their prologues into native operations. Changing relocations and selected operands are excluded from matching. A missing or ambiguous match keeps transparency disabled.

The toolbar ID comes from bounded read-only tables. A full scan requires agreement between duplicate definitions. On subsequent launches, the cached entry must still have the exact `kColorToolbar` name, valid read-only pointers, and consecutive neighboring color IDs. An invalid entry triggers the full scan again. A valid cache avoids the full table scan; no screen sampling or recurring module scan is used.

These checks reduce the chance of a bad match; they cannot make private Brave functions permanent. Compiler or rendering changes can still require a mod update.

## Rendering scope

Only explicitly allowed browser containers are cleared. Interactive child views are not blanket-cleared. Exact color replacement can still affect other elements that share an eligible palette and a configured color.

No website scripts, DOM overrides, extensions, or webpage-background hooks are installed. Restart Brave normally after enabling, disabling, or changing the mod because Brave caches native brushes and opacity information.

If minimize/maximize/close buttons appear twice, enable **Use compact mode** in Brave's Appearance settings. This advice also appears in the mod's Settings tab.
