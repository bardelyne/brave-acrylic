# Advanced reference

Brave Acrylic 3.9 is alpha software. Translucent Windows supplies the main window's backdrop. Native menus, bubbles and the desktop suggestions popup use a clipped Windows host backdrop in their own Chromium-owned popup windows.

**Restart Brave after installing, updating or applying settings.** Close every Brave window normally and exit any background instance before reopening it. Existing widgets and cached native brushes need rebuilding even when some changes appear immediately.

## Geometry and ownership

Menu and bubble clipping comes from their actual Skia rounded background, scaled by window DPI. The composition worker owns its own dispatcher and targets behind Chromium in the same popup HWND. It creates no overlay window or input catcher and leaves Chromium's focus, capture and controls native. Background alpha is set on the first paint because Chromium retains display lists.

Suggestions leave Chromium's normal desktop-popup factory selected instead of its in-window Aura override. A validated solid-background vtable and construction callbacks identify their own backing. Native local/screen bounds and header height define the rounded results region below the real input field. The OS region routes address-field clicks directly to the existing field and follows result resizing and DPI changes. The actual prior region is restored on its owning UI thread; no private member offsets or screenshot rectangles are used.

The worker closes its targets and shuts down only its own queue before DLL unload. Where Windows cannot read a host-backdrop capability flag, cleanup removes the effect without guessing its previous flag value. High contrast and Windows' transparency preference are respected. Website dialogs and extension HTML retain their own styling.

## Compatibility and privacy

The six feature groups are independent. Missing native dependencies leave their features native while working features remain available. Windhawk performs ordinary symbol-cache fetching and local caching; the mod retains local range, unwind-entry, helper-leaf, thunk and overlap checks. It does not query workflow/artifact APIs or independently authenticate the author-controlled cache. See [compatibility](compatibility.md) and [hosting and trust](trusted-pipeline.md).

The mod downloads compatibility data only. It uploads no browsing content, credentials, settings or telemetry and requests no user login/token. GitHub sees the public IP and requested build URL. Turn off Use online symbol cache and restart for local-cache-only operation; suitable cached symbols must already exist. Remote PDB downloads and custom retry/polling workers are disabled.

## Website backgrounds

Webpage background removes Chromium's backing and white fallback without editing HTML/CSS. Use Zen Internet with Disable Transparency off, or write site-scoped Stylus rules, for website backgrounds. The native-popup suggestion method was tested with YouTube and Zen Internet enabled.

The optional caption-button workaround remains off by default and may affect Windows system menus or other window tools. Existing preferences are preserved.
