#define NOMINMAX
#include <windows.h>
#include <atomic>
static std::atomic<unsigned> settingsReads{0},contrastReads{0};
static std::atomic<bool> allowTransparency{true},highContrast{false};
static std::atomic<DWORD> settingsReaderThread{0};
static LSTATUS WINAPI TestRegGetValueW(HKEY,LPCWSTR,LPCWSTR,DWORD,LPDWORD,void* data,LPDWORD size) {
    ++settingsReads;settingsReaderThread=GetCurrentThreadId();
    if(!data||!size||*size<sizeof(DWORD))return ERROR_MORE_DATA;
    *static_cast<DWORD*>(data)=allowTransparency?1:0;*size=sizeof(DWORD);return ERROR_SUCCESS;
}
static BOOL WINAPI TestSystemParametersInfoW(UINT action,UINT,PVOID data,UINT) {
    if(action!=SPI_GETHIGHCONTRAST||!data)return FALSE;
    ++contrastReads;settingsReaderThread=GetCurrentThreadId();
    static_cast<HIGHCONTRASTW*>(data)->dwFlags=highContrast?HCF_HIGHCONTRASTON:0;return TRUE;
}
#define RegGetValueW TestRegGetValueW
#define SystemParametersInfoW TestSystemParametersInfoW
#include "../brave-acrylic.wh.cpp"
#undef RegGetValueW
#undef SystemParametersInfoW
#include "cache-contract.h"
#include <cstdio>
#include <cstdlib>
static unsigned checks=0;
static void Check(bool value,const char* label){if(!value){fprintf(stderr,"FAIL: %s\n",label);exit(1);}++checks;}
void TestLog(PCWSTR,...){}
PCWSTR Wh_GetStringSetting(PCWSTR,...){return L"";}
void Wh_FreeStringSetting(PCWSTR){}
int Wh_GetIntSetting(PCWSTR){return 0;}
size_t Wh_GetBinaryValue(PCWSTR,void*,size_t){return 0;}
BOOL Wh_SetBinaryValue(PCWSTR,const void*,size_t){return TRUE;}
BOOL Wh_SetFunctionHook(void*,void*,void**){return FALSE;}
BOOL Wh_ApplyHookOperations(){return FALSE;}
bool WindhawkUtils::HookSymbols(HMODULE,const SYMBOL_HOOK*,size_t,const WH_HOOK_SYMBOLS_OPTIONS*){return false;}
static NativeUi::Omnibox::Rect rect{0,0,600,350};
static int header=52;
static HWND testPopup=nullptr;
static const void* mockFrame=nullptr;
static int hostShift=16;
static unsigned initialMenuColor=0;
static HWND PopupForView(const void*){return testPopup;}
static unsigned NativeColorValue(const void*,int){return 0xff345678;}
static void InitialMenuPaint(void*,void*){initialMenuColor=NativeUi::ColorHook(nullptr,0);}
static NativeUi::Omnibox::Rect* Bounds(const void* view,NativeUi::Omnibox::Rect* result){*result=rect;
    if(view==mockFrame){result->width+=32;result->height+=28;}return result;}
static NativeUi::Omnibox::Rect* ScreenBounds(const void* view,NativeUi::Omnibox::Rect* result){Bounds(view,result);
    result->x=100+(view==mockFrame?0:hostShift);result->y=100;return result;}
static int Header(bool){return header;}
static void Pump(){MSG message{};while(PeekMessageW(&message,nullptr,0,0,PM_REMOVE)){TranslateMessage(&message);DispatchMessageW(&message);}}
static bool BackdropApplied(HWND hwnd){
    using namespace NativeUi::Material;
    AcquireSRWLockShared(&lock);
    const auto found=requests.find(hwnd);
    const bool applied=found!=requests.end()&&found->second.applied;
    ReleaseSRWLockShared(&lock);
    return applied;
}
static std::string fakeClass;
static int originalPaints=0,clears=0,fadePaints=0;
static bool layerOpaque=true;
static unsigned themeForeground=0,bubbleForeground=0,bubbleFeature=0,nativeRoundRects=0;
static BraveBackground::ClassName* ClassForView(const void*,BraveBackground::ClassName* out){*out={fakeClass.data(),fakeClass.size()};return out;}
static void PaintForView(void*,void*){++originalPaints;}
static void ClearForView(void*,unsigned color,int mode){Check(!color&&!mode,"only a transparent native clear is requested");++clears;}
static void PaintFade(void*,void*){++fadePaints;}
static void LayerOpacity(void*,bool value){layerOpaque=value;}
static void ThemeColors(void* view){themeForeground=NativeUi::ColorHook(nullptr,0);NativeUi::LayerOpaqueHook(view,true);}
static void BubbleColors(const void*,void*,void*){bubbleForeground=NativeUi::ColorHook(nullptr,0);bubbleFeature=NativeUi::paintFeature;}
static void NativeRectangle(void*,const NativeUi::RoundRect&,const void*){++nativeRoundRects;}
static unsigned animationCalls=0,fadeTypeCalls=0,fadeDurationCalls=0;
static bool animationResult=true;
static HWND NativeAnimationWindow(void*){return testPopup;}
static bool NativeAnimation(void*,bool){++animationCalls;return animationResult;}
static void NativeFadeType(void*,int type){Check(type==3,"bubble animation uses Chromium's native FADE type");++fadeTypeCalls;}
static void NativeFadeDuration(void*,const long long& duration){Check(duration==160000,"native fade and backdrop use the same microsecond duration");++fadeDurationCalls;}

int wmain(int argc,wchar_t** argv){
    HRESULT apartment=RoInitialize(RO_INIT_MULTITHREADED);Check(SUCCEEDED(apartment),"test apartment initialized");
    if(argc==4&&!wcscmp(argv[1],L"--validate")){
        HMODULE module=LoadLibraryExW(argv[2],nullptr,DONT_RESOLVE_DLL_REFERENCES);Check(module!=nullptr,"map exact Brave without executing it");
        BuildIdentity id{};Check(GetBuildIdentity(module,&id),"read exact native identity");
        FILE* file=_wfopen(argv[3],L"rb");Check(file!=nullptr,"open generated feature cache");
        std::string cache;char block[4096];size_t got;while((got=fread(block,1,sizeof(block),file)))cache.append(block,got);fclose(file);
        size_t entries[kFeatureSlots]{},normalized[kFeatureSlots]{};
        Check(SymbolCache::ParseFeatureCache(cache,id,entries),"native parser accepts exact producer feature contract");
        void* addresses[kFeatureSlots]{};auto* base=reinterpret_cast<unsigned char*>(module);
        for(unsigned i=0;i<kFeatureSlots;++i)if(entries[i])addresses[i]=base+entries[i];
        Check(ValidateFeatureAddresses(module,addresses,normalized),"all live functions, helpers and immutable vtable validate");
        std::array<size_t,kFeatureSlots> valid{};
        std::copy_n(normalized,kFeatureSlots,valid.begin());
        for(unsigned i=0;i<kFeatureSlots;++i)if(entries[i]){
            auto* saved=addresses[i];addresses[i]=base+entries[i]+1;
            auto expected=valid;expected[i]=0;
            Check(ValidateFeatureAddresses(module,addresses,normalized)&&
                  std::equal(expected.begin(),expected.end(),normalized),
                  "misaligned target rejected while unrelated slots remain valid");
            addresses[i]=saved;
        }
        addresses[15]=addresses[14];
        auto expected=valid;expected[14]=expected[15]=0;
        Check(ValidateFeatureAddresses(module,addresses,normalized)&&
              std::equal(expected.begin(),expected.end(),normalized),"both overlapping roles are rejected");
        const unsigned available=CompleteFeatures(valid.data());
        Check(available==255&&CompleteOptionalFeatures(valid.data(),available)==(kPopupFade|kAddressShadow),
              "all eight native features and both optional enhancements are available");
        FreeLibrary(module);printf("PASS: %u exact-build native checks; eight features; no hooks installed\n",checks);RoUninitialize();return 0;
    }
    using namespace NativeUi;
    RefreshTransparencyAllowed();
    ready=true;supported=63;enabled=Menus|Popups|Suggestions;
    for(unsigned alpha=0;alpha<256;++alpha){
        unsigned color=(alpha<<24)|0x345678;
        Check(Tint(color,false)==color,"foreground and unscoped colors unchanged");
        Check((Tint(color,true)&0xffffff)==0x345678,"native RGB preserved");
        Check((Tint(color,true)>>24)==(alpha*62+50)/100,"all theme alpha levels scaled correctly");
    }
    for(unsigned opacity:{0u,1u,25u,62u,85u,100u}) {
        s_popupOpacity=opacity;
        for(unsigned alpha=0;alpha<256;++alpha) {
            const unsigned color=(alpha<<24)|0x345678;
            Check(Tint(color,false)==color,"opacity never changes unscoped foreground colors");
            Check((Tint(color,true)&0xffffff)==0x345678,"custom opacity preserves theme RGB");
            Check((Tint(color,true)>>24)==(alpha*opacity+50)/100,"popup opacity applies exactly at every alpha level");
        }
    }
    s_popupOpacity=62;
    Check(backgroundScope==0,"background scope initially clear");
    {Scope one(true);Check(backgroundScope==1,"outer native background scope");
        {Scope two(true);Check(backgroundScope==2,"nested native paint scope");}
        Check(backgroundScope==1,"nested scope restored");}
    Check(backgroundScope==0,"foreground scope restored after painting");
    size_t entries[kFeatureSlots];std::fill(entries,entries+kFeatureSlots,1);
    Check(CompleteFeatures(entries)==255,"eight independent dependency groups");
    for(unsigned i=0;i<kFeatureSlots;++i){entries[i]=0;const unsigned mask=CompleteFeatures(entries);
        if(i>=13)Check((mask&7)==7,"new popup/suggestion dependency cannot break base background features");
        if(i<13&&i!=5)Check((mask&Menus)==Menus,"base feature dependency cannot break native menus");
        if(i==0||i==1||i==2)Check(!(mask&Popups),"missing shared popup painting helpers disable only their dependent popup feature");
        if(i==30||i==31)Check((mask&63)==63 && !(mask&kRoundedWebpage),"rounded-border dependencies cannot disable the existing six features");
        if(i==6||i==7)Check(mask==127,"address-bar dependencies cannot disable the other features");
        if(i>=32)Check(mask==255&&CompleteOptionalFeatures(entries,mask)==(i==36?kPopupFade:kAddressShadow),
                       "a missing enhancement leaves both base features enabled");
        entries[i]=1;
    }
    Omnibox::Rect region{};
    Check(Omnibox::SamplingBounds({100,100,800,450},{116,100,700,350},52,&region)&&region.y==52&&region.height==298,"results exclude the actual typed input");
    Check(!Omnibox::SamplingBounds({INT_MIN,0,600,400},{INT_MAX,0,600,400},52,&region),"screen-coordinate conversion cannot overflow");
    Check(!Omnibox::SamplingBounds({0,0,600,400},{0,0,600,400},500,&region),"empty results cannot cover typed text");
    int view=0;
    if(argc==2&&!wcscmp(argv[1],L"--material")){
        const auto queueBefore=winrt::Windows::System::DispatcherQueue::GetForCurrentThread();
        WNDCLASSW cls{};cls.lpfnWndProc=DefWindowProcW;cls.hInstance=GetModuleHandleW(nullptr);cls.lpszClassName=L"Chrome_WidgetWin_1";
        Check(RegisterClassW(&cls)!=0,"register separate native popup test class");
        HWND hwnd=CreateWindowExW(WS_EX_NOREDIRECTIONBITMAP,cls.lpszClassName,L"Material cleanup test",WS_POPUP,0,0,400,240,nullptr,nullptr,cls.hInstance,nullptr);
        Check(hwnd!=nullptr&&PopupWindow(hwnd),"classify own popup without changing input/styles");
        DWORD previousBorder=0;
        const bool borderKnown=SUCCEEDED(DwmGetWindowAttribute(hwnd,34,&previousBorder,sizeof(previousBorder)));
        testPopup=hwnd;windowForView=PopupForView;originalColor=NativeColorValue;originalMenu=InitialMenuPaint;
        Check(!BackdropApplied(hwnd),"first paint precedes asynchronous backdrop attachment");
        PopupTransition::original=NativeAnimation;
        PopupTransition::Mark(hwnd);
        Check(!GetPropW(hwnd,PopupTransition::kProperty)&&!Material::FadeBegin(hwnd,true)&&
              Material::requests.empty(),"an unavailable worker cannot mark or queue a popup");
        PopupTransition::original=nullptr;
        MenuHook(&view,nullptr);
        Check(initialMenuColor==Tint(0xff345678,true),"entire retained menu background is translucent on its first paint, without hover");
        Check(ColorHook(nullptr,0)==0xff345678,"foreground stays opaque after initial menu paint");
        const auto style=GetWindowLongPtrW(hwnd,GWL_STYLE),extended=GetWindowLongPtrW(hwnd,GWL_EXSTYLE);
        NativeUi::RoundRect shape{8,8,392,232,{12,12,12,12,12,12,12,12}};
        Material::Update(hwnd,shape,Menus);
        const auto deadline=GetTickCount64()+5000;
        while(!BackdropApplied(hwnd)&&GetTickCount64()<deadline){Pump();Sleep(10);}
        Check(BackdropApplied(hwnd),"owned worker attaches clipped host backdrop on another window thread");
        const HWND settingsWindow=FindWindowW(Material::kSettingsClass,L"");
        Check(settingsWindow&&!IsWindowVisible(settingsWindow),"worker owns an invisible setting-broadcast listener");
        HWND frameWindow=CreateWindowExW(0,cls.lpszClassName,L"Hidden main-frame test",WS_OVERLAPPEDWINDOW,
            0,0,400,240,nullptr,nullptr,cls.hInstance,nullptr);
        Check(frameWindow&&!PopupWindow(frameWindow),"main browser frames are not popup candidates");
        const auto registryBefore=settingsReads.load(),contrastBefore=contrastReads.load();
        testPopup=frameWindow;
        for(unsigned i=0;i<1000;++i)Check(!Candidate(&view,Popups),"main-frame paints reject popup effects cheaply");
        testPopup=hwnd;
        for(unsigned i=0;i<1000;++i)Check(Candidate(&view,Popups)==hwnd,"popup paints use cached Windows preferences");
        Check(settingsReads==registryBefore&&contrastReads==contrastBefore,"two thousand paint candidates perform no registry or SPI reads");
        DestroyWindow(frameWindow);
        const auto waitApplied=[&](bool expected){
            const auto until=GetTickCount64()+5000;
            while(BackdropApplied(hwnd)!=expected&&GetTickCount64()<until){Pump();Sleep(10);}
            Check(BackdropApplied(hwnd)==expected,"Windows preference changes recheck existing materials");
        };
        allowTransparency=false;SendMessageW(settingsWindow,WM_SETTINGCHANGE,0,0);
        Check(!UserAllowsTransparency()&&!Candidate(&view,Popups),"turning transparency off updates the cached paint decision");
        Check(settingsReaderThread==Material::threadId&&settingsReaderThread!=GetCurrentThreadId(),"preference reads run on the worker, not the browser paint thread");
        waitApplied(false);
        allowTransparency=true;SendMessageW(settingsWindow,WM_SETTINGCHANGE,0,0);waitApplied(true);
        highContrast=true;SendMessageW(settingsWindow,WM_SETTINGCHANGE,SPI_SETHIGHCONTRAST,0);
        Check(!UserAllowsTransparency(),"high contrast also disables cached popup transparency");waitApplied(false);
        highContrast=false;SendMessageW(settingsWindow,WM_THEMECHANGED,0,0);waitApplied(true);
        if(borderKnown){DWORD border=0;Check(SUCCEEDED(DwmGetWindowAttribute(hwnd,34,&border,sizeof(border)))&&border==0xfffffffeu,
            "owned popup material suppresses the Windows-drawn border where supported");}
        Check(GetWindowLongPtrW(hwnd,GWL_STYLE)==style&&GetWindowLongPtrW(hwnd,GWL_EXSTYLE)==extended,"popup input/window styles unchanged");
        Check(winrt::Windows::System::DispatcherQueue::GetForCurrentThread()==queueBefore,"Brave/UI dispatcher is untouched");
        s_background.getClass=ClassForView;s_background.clear=ClearForView;s_background.originalPaint=PaintForView;
        s_background.ready=false;originalLayerOpaque=LayerOpacity;originalBubbleTheme=ThemeColors;originalFadeBackground=PaintFade;
        PopupTransition::windowForNative=NativeAnimationWindow;
        PopupTransition::original=NativeAnimation;
        PopupTransition::setType=NativeFadeType;PopupTransition::setDuration=NativeFadeDuration;
        BubbleThemeHook(&view);
        Check(GetPropW(hwnd,PopupTransition::kProperty)==PopupTransition::Owner(),"bubble theme marks only our own popup for the fade policy");
        PopupTransition::Mark(hwnd);
        Check(PopupTransition::windows.size()==1,"repeated theme changes do not duplicate popup lifetime records");
        Check(PopupTransition::AnimateHook(&view,true),"native show fade remains enabled");
        auto fade=Material::requests.at(hwnd).fade;
        Check(fade.from==0&&fade.to==1&&fade.duration==160,"first popup show starts a short fade with no scaling");
        Check(Material::FadeValue(fade,fade.start)==0&&Material::FadeValue(fade,fade.start+80)==.5f&&
              Material::FadeValue(fade,fade.start+160)==1&&Material::FadeValue(fade,fade.start+999)==1,
              "backdrop fade is bounded and reaches the exact final opacity even after delayed worker attachment");
        const auto firstFade=fade.serial;
        Check(PopupTransition::AnimateHook(&view,false),"native hide fade remains enabled");
        fade=Material::requests.at(hwnd).fade;
        Check(fade.serial>firstFade&&fade.to==0,"quick dismissal reverses toward zero opacity");
        const auto secondFade=fade.serial;
        Material::FadeImmediate(hwnd,firstFade);
        Check(Material::requests.at(hwnd).fade.serial==secondFade,"a stale fade completion cannot overwrite a newer transition");
        animationResult=false;
        Check(!PopupTransition::AnimateHook(&view,true),"native reduced-motion path is preserved");
        Check(Material::requests.at(hwnd).fade.duration==0&&Material::FadeValue(Material::requests.at(hwnd).fade,GetTickCount64())==1,
              "when Chromium skips animation the backdrop appears immediately too");
        animationResult=true;
        const unsigned calls=fadeTypeCalls;
        enabled=Menus;PopupTransition::AnimateHook(&view,true);enabled=Menus|Popups|Suggestions;
        Check(fadeTypeCalls==calls,"disabled popup feature cannot change native animations");
        HWND menuWindow=CreateWindowExW(0,cls.lpszClassName,L"Unmarked native menu",WS_POPUP,0,0,200,120,nullptr,nullptr,cls.hInstance,nullptr);
        Check(menuWindow!=nullptr,"create an independent native menu window");
        testPopup=menuWindow;PopupTransition::AnimateHook(&view,true);testPopup=hwnd;
        Check(fadeTypeCalls==calls&&fadeTypeCalls==fadeDurationCalls,"context, bookmark and main menus keep the native animation path");
        DestroyWindow(menuWindow);
        Check(themeForeground==0xff345678&&!layerOpaque,"popup opacity changes cannot dim cached text or icon colors");
        LayerOpaqueHook(&view,true);Check(layerOpaque,"unrelated layers keep their original opacity flag");
        AcquireSRWLockExclusive(&Material::lock);Material::requests[hwnd].feature=Popups;ReleaseSRWLockExclusive(&Material::lock);
        int canvas=0;
        fakeClass="DialogClientView";ViewOnPaintBackground_Hook(&view,&canvas);
        Check(clears==1&&!originalPaints,"a separate popup client canvas is explicitly cleared");
        fakeClass="FooterView";ViewOnPaintBackground_Hook(&view,&canvas);
        Check(clears==1&&!originalPaints,"footer background suppression preserves the existing native tint");
        fakeClass="ImageView";Check(!SuppressPopupBackground(&view),"image backgrounds outside a tab hover card are preserved");
        fakeClass="TabHoverCardBubbleView";Check(!SuppressPopupBackground(&view),"hover root marks its window without suppressing the root paint");
        fakeClass="ImageView";ViewOnPaintBackground_Hook(&view,&canvas);
        Check(clears==2&&!originalPaints,"memory-icon backing is cleared, including its separate fading layer");
        fakeClass="FadeLabel";FadeBackgroundHook(&view,&canvas);
        Check(!fadePaints&&clears==2,"cross-fade cannot paint a black mask or erase the background tint");
        fakeClass="Label";ViewOnPaintBackground_Hook(&view,&canvas);
        Check(originalPaints==1,"ordinary label painting remains native");
        originalBubble=BubbleColors;fakeClass="MenuScrollViewContainer";
        {Scope menu(true,hwnd);paintFeature=Menus;BubbleHook(nullptr,&canvas,&view);paintFeature=0;}
        Check(bubbleFeature==Menus&&bubbleForeground==Tint(0xff345678,true),"menu background retains its own feature and native tint");
        fakeClass="BubbleFrameView";BubbleHook(nullptr,&canvas,&view);
        Check(bubbleFeature==Popups&&bubbleForeground==Tint(0xff345678,true),"popup outer fill retains its native theme tint");
        Check(ColorHook(nullptr,0)==0xff345678,"foreground remains opaque after popup painting");
        Check(!popupTintKnown,"native popup color capture does not leak into another view");
        // ScrollView repeats the solid background on its viewport and contents.
        // Clear every native backing only inside an identified Extensions menu.
        const auto beforeExtensions=Material::requests.at(hwnd);
        const char* extensionContainers[]={"ScrollView","ScrollView::Viewport","View","BoxLayoutView","FlexLayoutView","SectionContainer"};
        for(const char* name:extensionContainers){fakeClass=name;Check(!SuppressPopupBackground(&view),"generic backing in another popup stays native");}
        for(const char* root:{"ExtensionsMenuView","ExtensionsMenuMainPageView","ExtensionsMenuSitePermissionsPageView"}){
            Material::requests[hwnd]=beforeExtensions;fakeClass=root;
            Check(SuppressPopupBackground(&view),"native Extensions root identifies its own popup");
            const int previousClears=clears,previousPaints=originalPaints;
            ViewOnPaintBackground_Hook(&view,&canvas);
            Check(clears==previousClears+1&&originalPaints==previousPaints,"native Extensions root clears only its backing paint");
            for(const char* name:extensionContainers){
                fakeClass=name;const int count=clears;
                ViewOnPaintBackground_Hook(&view,&canvas);
                Check(clears==count+1&&originalPaints==previousPaints,"all repeated Extensions scroll backgrounds clear transparently");
            }
            for(const char* name:{"Label","ImageView","BraveExtensionMenuItemView","ExtensionsMenuButton","HoverButton","BubbleMenuItemButton","ExtensionPopup"}){
                fakeClass=name;
                // Hover-card state belongs to a different popup in real use.
                Material::requests[hwnd].hoverCard=false;
                Check(!SuppressPopupBackground(&view),"extension controls, icons and HTML popup views remain native");
            }
            Material::requests[hwnd].feature=Menus;fakeClass="ScrollView";
            Check(!SuppressPopupBackground(&view),"Extensions identification cannot affect a menu feature window");
        }
        Material::requests[hwnd]=beforeExtensions;
        // Page information and downloads repeat their fills on native child
        // containers. Do not touch permission controls, file rows or alerts.
        for(const char* root:{"BravePageInfoBubbleView","PageInfoBubbleView","InternalPageInfoBubbleView","PageInfoMainView",
                             "DownloadBubbleContentsView","DownloadDialogView","DownloadBubblePrimaryView","DownloadBubblePartialView",
                             "MediaDialogView","MediaItemUIListView","MediaItemUIUpdatedView","MediaItemUIView"}) {
            Material::requests[hwnd]=beforeExtensions;
            Material::requests[hwnd].hoverCard=false;fakeClass=root;
            Check(SuppressPopupBackground(&view),"site information/download roots identify their shaped native popup");
            for(const char* child:{"ScrollView","ScrollView::Viewport"}) {
                fakeClass=child;Check(SuppressPopupBackground(&view),"identified popup scrolling backings are cleared");
            }
            for(const char* child:{"Label","ImageView","PageInfoPermissionContentView","DownloadBubbleRowView",
                                  "DownloadBubbleSecurityView","ToggleButton","ShowAllDownloadsButton","BoxLayoutView"}) {
                fakeClass=child;Check(!SuppressPopupBackground(&view),"permissions, warning cards, download rows and controls retain native painting");
            }
            fakeClass="PageSwitcherView";
            Check(SuppressPopupBackground(&view)==Material::requests[hwnd].pageInfo,
                  "page-switcher background clears only in identified site-information bubbles");
            for(const char* quick:{"View","FlexLayoutView"}) {
                fakeClass=quick;
                Check(SuppressPopupBackground(&view)==Material::requests[hwnd].downloads,
                      "both old and current download quick-action backings clear only in identified downloads popups");
            }
            Material::requests[hwnd].feature=Menus;fakeClass=root;
            Check(!SuppressPopupBackground(&view),"popup classifiers cannot affect an ordinary menu");
        }
        Material::requests[hwnd]=beforeExtensions;
        originalRoundRect=NativeRectangle;backgroundWindow=hwnd;paintFeature=Popups;
        popupTint=0xff345678;popupTintKnown=true;RoundRectHook(&canvas,shape,nullptr);
        AcquireSRWLockShared(&Material::lock);const unsigned capturedTint=Material::requests.at(hwnd).tint;ReleaseSRWLockShared(&Material::lock);
        Check(capturedTint==Tint(0xff345678,true)&&nativeRoundRects==0,"popup tint is derived from Brave and drawn once beneath the cleared client canvas");
        paintFeature=Menus;RoundRectHook(&canvas,shape,nullptr);
        Check(nativeRoundRects==1,"menu tint continues to use native drawing");
        paintFeature=Popups;popupTintKnown=false;RoundRectHook(&canvas,shape,nullptr);
        Check(nativeRoundRects==2,"an unknown literal palette retains its native background fill");
        paintFeature=0;backgroundWindow=nullptr;
        // The suggestions popup uses a native HWND, with its own input region.
        enabled=Menus|Popups|Suggestions;rect={0,0,340,180};header=52;
        int frame=0,layer=0,background=0;mockFrame=&frame;
        Omnibox::getBounds=Bounds;Omnibox::getScreenBounds=ScreenBounds;Omnibox::getHeader=Header;
        Omnibox::cleanupMessage=RegisterWindowMessageW(L"BraveAcrylic.NativeSuggestionTestCleanup");
        Omnibox::backgrounds[&background]={&frame,&layer};Omnibox::backgrounds[&background].radius=8;
        Check(Omnibox::Blur(&background,&view),"native suggestions request Windows blur");
        HRGN inputRegion=CreateRectRgn(0,0,0,0);Check(GetWindowRgn(hwnd,inputRegion)!=ERROR,"results use a rounded native region");
        Check(!PtInRegion(inputRegion,80,20)&&PtInRegion(inputRegion,80,80),"typed input stays outside the popup while result rows keep native mouse input");
        DeleteObject(inputRegion);
        rect.height=200;Check(Omnibox::Blur(&background,&view),"resizing results updates native geometry");
        inputRegion=CreateRectRgn(0,0,0,0);GetWindowRgn(hwnd,inputRegion);
        Check(PtInRegion(inputRegion,80,195)&&!PtInRegion(inputRegion,80,210),"resized region follows native results bounds");DeleteObject(inputRegion);
        Omnibox::RestoreWindow(hwnd);inputRegion=CreateRectRgn(0,0,0,0);
        Check(GetWindowRgn(hwnd,inputRegion)==ERROR,"cleanup restores the original unrestricted native region");DeleteObject(inputRegion);
        HRGN expected=CreateRoundRectRgn(10,15,200,200,12,12),saved=CreateRectRgn(0,0,0,0);
        CombineRgn(saved,expected,nullptr,RGN_COPY);SetWindowRgn(hwnd,CreateRectRgn(50,50,90,90),TRUE);
        Omnibox::Record previous{&frame,&layer,hwnd};previous.originalRegion=saved;Omnibox::Restore(previous);
        inputRegion=CreateRectRgn(0,0,0,0);GetWindowRgn(hwnd,inputRegion);
        Check(EqualRgn(inputRegion,expected),"cleanup also restores a real custom original region");DeleteObject(inputRegion);DeleteObject(expected);
        Check(GetWindowLongPtrW(hwnd,GWL_STYLE)==style&&GetWindowLongPtrW(hwnd,GWL_EXSTYLE)==extended,"native suggestion blur does not replace focus or activation styles");
        Omnibox::Stop();
        ready=false;fakeClass="FadeLabel";FadeBackgroundHook(&view,&canvas);
        Check(fadePaints==1,"disabled popup feature restores the native fade background");
        PopupTransition::Clear(true);
        Check(!GetPropW(hwnd,PopupTransition::kProperty)&&PopupTransition::windows.empty(),"fade markers and lifetime records are removed before unloading");
        Material::Stop();
        Check(!IsWindow(settingsWindow),"setting-broadcast listener is destroyed before unload");
        Check(!GetPropW(hwnd,Material::kProperty),"owned popup property removed before DLL unload");
        if(borderKnown){DWORD border=0;Check(SUCCEEDED(DwmGetWindowAttribute(hwnd,34,&border,sizeof(border)))&&border==previousBorder,
            "popup cleanup restores the actual previous Windows border color");}
        Check(!Material::thread&&Material::requests.empty(),"owned composition worker joined and registry cleared");
        Check(winrt::Windows::System::DispatcherQueue::GetForCurrentThread()==queueBefore,"cleanup does not stop the host UI dispatcher");
        DestroyWindow(hwnd);UnregisterClassW(cls.lpszClassName,cls.hInstance);
    }
    printf("PASS: %u native UI checks\n",checks);RoUninitialize();return 0;
}
