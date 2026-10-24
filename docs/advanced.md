# Advanced reference

Brave Acrylic 3.3 is alpha software. Translucent Windows supplies the backdrop for brave.exe. Version 3 ignores the former color list.

## Areas and focus

**Vertical tabs background** controls the frame and vertical-tab backing. **Toolbar** controls the toolbar, bookmarks bar, and unfocused address field. **Webpage background** controls both the native content backing and the renderer fallback canvas. All three default on; the common transparent browser root is needed when any area is selected. Unselected child areas keep native painting.

Focused address fields retain their theme background. Buttons, tab highlights, labels, menus, and website-painted colors are preserved by the native path.

Restart Brave after changing Vertical tabs background or Toolbar. Webpage background is set on tab attachment, so selecting an existing tab applies it without a refresh. Restart after disabling Webpage background to restore its previously stored base color. Some backgrounds and compositor opacity are initialized with their windows; disabling a setting does not recreate a destroyed native Background object in an existing window. Exit any remaining background instance normally as well.

## Website styling

Use [Zen Internet](https://chromewebstore.google.com/detail/zen-internet/dpkamhkboipomecencjpammmjdfkgjha) for website-specific background removal. In the extension, open **Advanced Settings** and turn **Disable Transparency** off under **Global Feature Controls**. Keep **Webpage background** enabled in Brave Acrylic. Apply extension changes to a newly opened or reloaded page.

Alternatively, use [Stylus](https://chromewebstore.google.com/detail/stylus/clngdbkpkpeebahjckkjfobafhncgmne) to create a style for an individual website. It does not remove backgrounds out of the box: write or paste CSS rules for the elements you want transparent, or install a suitable userstyle. Keep **Webpage background** enabled in Brave Acrylic. The [Stylus writing guide](https://github.com/openstyles/stylus/wiki/Writing-styles) explains CSS and website scope.

The mod clears only Chromium's native webpage-area backing and default white fallback; it does not modify website HTML, CSS or content. Explicit CSS backgrounds remain unless an extension changes them. Website coverage, contrast and images depend on its styles. The mod contains no website-code settings, load observer, JavaScript execution helper or URL-scheme helper. Older saved website-code values are ignored.

## Native dependencies

| Slot | Dependency | Hooked? |
| --- | --- | --- |
| 0 | View::OnPaintBackground | Yes: selected background roles. |
| 1 | Canvas::DrawColor | No: clear the native clip. |
| 2 | View::GetClassNameW | No: exact View role. |
| 3 | Browser-host transparency predicate | Yes: native transparent compositor path. |
| 4 | Vertical-tab container constructor | Yes: exact anonymous backing View. |
| 5 | View::SetBackground | No: native background ownership. |
| 6 | LocationBarView::HasFocus | No. |
| 7 | View::HasFocus | No. |
| 8 | ContentsWebView::OnThemeChanged | Yes: scope backing-color updates. |
| 9 | ContentsWebView::RenderViewReady | Yes: scope initial renderer setup. |
| 10 | LayerAnimator::SetColor | Yes: clear backing only inside that scope. |
| 11 | WebContentsImpl::SetPageBaseBackgroundColor | No: store and broadcast a persistent transparent canvas. |
| 12 | ContentsWebView::SetWebContents | Yes: set the supplied page base before attaching a tab. |

All thirteen slots are required; seven dependencies are private hooks. Format 6 includes their exact decorated names and x64 ABI. Native string-view returns, indirectly passed empty unique pointers, 16-byte colors, and an 8-byte optional color passed by value follow the matching Brave build. The optional color is explicitly present with transparent ARGB; nullopt would restore Chromium's white default. No private object-member offsets are read. These contracts still need review if Brave changes its ABI.

The page base is applied through the canonical WebContents pointer supplied to ContentsWebView::SetWebContents, before original attachment notifications. Chromium stores it on that page and broadcasts it to current renderers; future renderers inherit it. No refresh, timer, retained tab pointer, or extra window is involved. Explicit author CSS remains unchanged.

Direct E9 stubs are supported at any named slot if they lead directly to a unique validated normal body or the already-approved host/focus leaf for that slot. Both the stub and body are checked. Indirect jumps, this-adjustors, jump chains, shared bodies, unsupported leaves, missing required functions and changed ABIs remain unsupported.

Only the browser process installs hooks. GPU, renderer and utility processes are excluded. There are no color-provider, GPU, DWM, color-key or overlay-window hooks; normal DirectComposition remains enabled.

## Compatibility and lifecycle

Embedded and cached format-6 maps are checked against the loaded DLL before readiness is published. The exact PDB identity and PE properties matter; display version strings alone do not establish compatibility. Legacy formats are separate.

For unknown builds, an optional worker makes a bounded request, then waits 30 minutes before retrying missing or invalid data. Waiting is cancellable, disabling downloads prevents further requests, and a successful cache write ends retries. The worker never installs live hooks; use a normal restart after a download. Known builds do no network work.

Loader installation and shutdown share a lock and readiness barrier. Resource-only DLL mappings are ignored. Shutdown disables readiness, cancels the worker, and waits outside the installation lock; HTTP handles close in their owning thread. No late hook batch can activate after shutdown.

The caption option hides only the recorded native system-menu bit on eligible resizable, unowned Chrome_WidgetWin_1 frames. Chromium sees its logical style; resize/minimize/maximize bits remain. Existing frames update immediately, and disabling/unloading restores recorded bits. Tool windows and dialogs are excluded.

For diagnostics, look for **Brave Acrylic 3.3**, **13/13 native functions**, the build key and cache messages. Compatibility details and the two-hour workflow are in [compatibility.md](compatibility.md). Version-matched rendering sources are in [webview-background.md](webview-background.md).
