# The white webpage canvas

Source revisions for Brave 1.98.60 / Chromium 156:
Chromium `d0c02bfad08ec92a6ffcf989e53cd995e6381a4c`,
Brave `52db4b25c0aa3038e9a1c6021428b136cc3cb5fc`.

## Renderer default

The matching [`WebViewImpl` constructor](https://chromium.googlesource.com/chromium/src.git/+/d0c02bfad08ec92a6ffcf989e53cd995e6381a4c/third_party/blink/renderer/core/exported/web_view_impl.cc#594)
initializes an unspecified page base with `SK_ColorWHITE`. The frame view receives
that base underneath the page's CSS.

[`ViewPainter::PaintRootElementGroup`](https://chromium.googlesource.com/chromium/src.git/+/d0c02bfad08ec92a6ffcf989e53cd995e6381a4c/third_party/blink/renderer/core/paint/view_painter.cc#264)
combines the CSS root background with the frame base and fills the canvas.
Transparent CSS over opaque white still produces white. Dark color schemes and
forced-color handling can select another base; it is not universally white.

The browser also has a separate native content backing.
[`ContentsWebView::UpdateBackgroundColor`](https://chromium.googlesource.com/chromium/src.git/+/d0c02bfad08ec92a6ffcf989e53cd995e6381a4c/chrome/browser/ui/views/frame/contents_web_view.cc#189)
uses the native web-content background color. The initial Aura surface can also
[fall back to white](https://chromium.googlesource.com/chromium/src.git/+/d0c02bfad08ec92a6ffcf989e53cd995e6381a4c/content/browser/renderer_host/render_widget_host_view_aura.cc#3106).
Clearing a native browser background therefore does not establish a transparent
webpage canvas.

## The implemented path

Since version 3.1.1, the mod scopes ContentsWebView::OnThemeChanged and RenderViewReady to clear the native backing through LayerAnimator::SetColor. The renderer canvas uses a different path: before ContentsWebView::SetWebContents attaches a tab, the mod calls WebContentsImpl::SetPageBaseBackgroundColor with an explicitly present transparent color. That native API stores the base and broadcasts it to existing views. RenderViewHostImpl also copies that value into newly created renderer parameters. Explicit author CSS colors and images remain unchanged. Version 3.3 retains this path as the Webpage background setting.

UpdateBackgroundColor and LayerSolidColor::SetColor are inlined in this build; their names are not usable standalone hook entries. The resolved LayerAnimator setter is reached by the real backing update. This scope avoids global color replacement and preserves author CSS colors and images.

## The toolbar's actual background

[`ToolbarView::Init`](https://chromium.googlesource.com/chromium/src.git/+/d0c02bfad08ec92a6ffcf989e53cd995e6381a4c/chrome/browser/ui/views/toolbar/toolbar_view.cc#365)
installs `CustomCornersBackground`. The inherited View background painter reaches
that object, whose [`ThemedBackground` painter](https://chromium.googlesource.com/chromium/src.git/+/d0c02bfad08ec92a6ffcf989e53cd995e6381a4c/chrome/browser/ui/views/frame/themed_background.cc#106)
draws a toolbar theme image or the current toolbar color. **Toolbar** selects that
background role, clearing its native clip before foregrounds and children draw.

Vertical tabs have separate [backing](https://github.com/brave/brave-core/blob/52db4b25c0aa3038e9a1c6021428b136cc3cb5fc/browser/ui/views/frame/brave_browser_view.cc#L394)
and [region](https://github.com/brave/brave-core/blob/52db4b25c0aa3038e9a1c6021428b136cc3cb5fc/browser/ui/views/frame/vertical_tabs/vertical_tab_strip_region_view.cc#L331)
backgrounds. They share a toolbar color ID but have distinct paint objects, so
**Vertical tabs background** can control them independently.

## Address field and website styling

The address field has its own background. Native LocationBarView::HasFocus and View::HasFocus checks clear only unfocused address fields; focused fields retain native painting.

Website-code injection was removed in version 3.3, including its three native dependencies. Website backgrounds can instead be customized through an extension such as Zen Internet or Stylus. In Zen Internet's Advanced Settings, turn Disable Transparency off. Stylus requires custom CSS rules or a suitable userstyle; it does not remove backgrounds out of the box. Keep the mod's Webpage background option on so transparent website areas reveal the backdrop. The mod changes only Chromium's backing layer, leaving website HTML, CSS and content unchanged.

## Scope and verification

The native path was checked in an isolated browser with normal DirectComposition: persistent backdrop after resizing, a transparent fallback canvas, and preserved explicit white, theme-blue, black and translucent CSS samples. Earlier optional stylesheet-injection experiments removed those author-painted backgrounds; that feature is no longer part of the mod. Current tests cover focus, scope nesting/thread isolation, disabled areas, settings, tab-attachment ordering and repeated tab selection with authored colors preserved.

Address validation does not guarantee future rendering semantics. Website extension styles can need site-specific changes. Private/Tor, fullscreen, alternate themes and future builds still need live testing. Some frame classes paint their own titlebar outside the inherited background painter; not every browser surface is selected.

## Why white returned when switching tabs

The original scoped RenderWidgetHostViewBase::SetBackgroundColor override was temporary. Chromium's WebContentsSetBackgroundColor observer can set another opaque default during RenderFrameCreated, outside the theme/ready scopes. Reusing a renderer also need not trigger another RenderViewReady. A later load can therefore start with the ordinary white Blink page base again.

Trace logs showed those out-of-scope updates, and switching between two already-loaded local test tabs reproduced the white canvas with transparent CSS. Extending the setter override alone did not solve it. The persistent page-base API did; applying it on tab attachment corrected an existing white tab without refreshing. Explicit white, blue, black and translucent CSS samples retained their colors.

Matching source: [frame-created background observer](https://chromium.googlesource.com/chromium/src.git/+/d0c02bfad08ec92a6ffcf989e53cd995e6381a4c/ui/views/controls/webview/web_contents_set_background_color.cc), [persistent page-base setter](https://chromium.googlesource.com/chromium/src.git/+/d0c02bfad08ec92a6ffcf989e53cd995e6381a4c/content/browser/web_contents/web_contents_impl.cc#2275), and [new-renderer parameters](https://chromium.googlesource.com/chromium/src.git/+/d0c02bfad08ec92a6ffcf989e53cd995e6381a4c/content/browser/renderer_host/render_view_host_impl.cc#576).
