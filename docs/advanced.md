# Advanced reference

Brave Acrylic 3.7 is alpha software. Translucent Windows supplies the backdrop for the main browser window. Native menus and supported bubbles use their own clipped Windows host backdrop; suggestions use Chromium's existing layer filter.

## Areas and controls

Vertical tabs background, Toolbar and Webpage background independently control native browser backing. Focused address fields retain their theme. Some backing objects are created with their windows, so reopen Brave after changing the first two areas. Webpage backing applies on tab attachment; selecting a tab does not refresh its contents. Reopen Brave after disabling webpage backing to restore existing renderer defaults.

Acrylic menus, Acrylic popups and Blur search suggestions are separate options. Apply menu changes by closing and reopening the menu. Website dialogs and extension HTML retain their own styling. Typed text, result text, icons, selection and native input remain Chromium's responsibility. High contrast and Windows' transparency preference are respected.

## Geometry and ownership

Popup clipping comes from the actual Skia rounded background, scaled by its window DPI. A composition worker owns its own dispatcher and targets in the same popup HWND, behind Chromium. It changes no window styles, opacity, focus, mouse capture or hit tests, and creates no overlay window. Native background alpha is set on the first paint because Chromium retains display lists and later repaints only damaged rows.

The worker closes targets and shuts down only its own queue before DLL unload. Where Windows cannot read the host-backdrop capability flag, cleanup removes the visual effect without guessing that flag's prior state.

Suggestion construction captures exactly one solid background and rounded layer, using a validated immutable class vtable. The real HWND is discovered on first paint after Widget attachment. Native bounds and input-header height restrict blur below the input cutout. Normal repaints reuse the filter; resized results update it. Frame destruction removes registrations, and unload restores layer blur and removes window subclasses on their owning UI thread.

## Compatibility and privacy

The six feature groups are validated independently. Missing or changed native functions leave dependent features native; they do not disable unrelated working features. All addresses still require the approved GitHub pipeline proof and independent local range, unwind, leaf and overlap checks. No downloaded native code or multi-GB PDB is loaded by users. See [compatibility](compatibility.md) and [trusted pipeline](trusted-pipeline.md).

Online requests are download-only GETs to GitHub. GitHub sees the requester IP and requested exact-build URLs. No history, website content, accounts, settings, analytics or tokens are uploaded. Offline mode requires data previously verified under the same approved workflow. There is no periodic downloader or networking worker; the composition worker is only for local graphics.

## Website backgrounds

The webpage option removes Chromium's backing and white fallback, without editing website HTML/CSS. Use Zen Internet with Disable Transparency off, or write site-scoped CSS in Stylus, for backgrounds painted by sites. Complex sites need specific styling.

The optional native-caption workaround retains the earlier default-off behavior and may affect system menus and window tools. Existing preferences are preserved. See the main README for setup and limitations.
