#define NOMINMAX
#include "../brave-acrylic.wh.cpp"
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
        for(unsigned i=0;i<kFeatureSlots;++i)if(entries[i]){
            auto* saved=addresses[i];addresses[i]=base+entries[i]+1;
            Check(!ValidateFeatureAddresses(module,addresses,normalized),"misaligned/inside-function target rejected");addresses[i]=saved;
        }
        const unsigned available=CompleteFeatures(entries);
        Check(available==63,"all six tested native features are available");
        FreeLibrary(module);printf("PASS: %u exact-build native checks; six features; no hooks installed\n",checks);RoUninitialize();return 0;
    }
    using namespace NativeUi;
    ready=true;supported=63;enabled=Menus|Popups|Suggestions;
    for(unsigned alpha=0;alpha<256;++alpha){
        unsigned color=(alpha<<24)|0x345678;
        Check(Tint(color,false)==color,"foreground and unscoped colors unchanged");
        Check((Tint(color,true)&0xffffff)==0x345678,"native RGB preserved");
        Check((Tint(color,true)>>24)==(alpha*62+50)/100,"all theme alpha levels scaled correctly");
    }
    Check(backgroundScope==0,"background scope initially clear");
    {Scope one(true);Check(backgroundScope==1,"outer native background scope");
        {Scope two(true);Check(backgroundScope==2,"nested native paint scope");}
        Check(backgroundScope==1,"nested scope restored");}
    Check(backgroundScope==0,"foreground scope restored after painting");
    size_t entries[kFeatureSlots];std::fill(entries,entries+kFeatureSlots,1);
    Check(CompleteFeatures(entries)==63,"six independent dependency groups");
    for(unsigned i=0;i<kFeatureSlots;++i){entries[i]=0;const unsigned mask=CompleteFeatures(entries);
        if(i>=13)Check((mask&7)==7,"new popup/suggestion dependency cannot break base background features");
        if(i<13&&i!=5)Check((mask&Menus)==Menus,"base feature dependency cannot break native menus");
        if(i==0||i==1||i==2)Check(!(mask&Popups),"missing shared popup painting helpers disable only their dependent popup feature");
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
        Check(!Material::Applied(hwnd),"first paint precedes asynchronous backdrop attachment");
        MenuHook(&view,nullptr);
        Check(initialMenuColor==Tint(0xff345678,true),"entire retained menu background is translucent on its first paint, without hover");
        Check(ColorHook(nullptr,0)==0xff345678,"foreground stays opaque after initial menu paint");
        const auto style=GetWindowLongPtrW(hwnd,GWL_STYLE),extended=GetWindowLongPtrW(hwnd,GWL_EXSTYLE);
        NativeUi::RoundRect shape{8,8,392,232,{12,12,12,12,12,12,12,12}};
        Material::Update(hwnd,shape,Menus);
        const auto deadline=GetTickCount64()+5000;
        while(!Material::Applied(hwnd)&&GetTickCount64()<deadline){Pump();Sleep(10);}
        if(!Material::Applied(hwnd))fprintf(stderr,"Material HRESULT: %08lx, stage %u\n",static_cast<unsigned long>(Material::error.load()),Material::stage.load());
        Check(Material::Applied(hwnd),"owned worker attaches clipped host backdrop on another window thread");
        if(borderKnown){DWORD border=0;Check(SUCCEEDED(DwmGetWindowAttribute(hwnd,34,&border,sizeof(border)))&&border==0xfffffffeu,
            "owned popup material suppresses the Windows-drawn border where supported");}
        Check(GetWindowLongPtrW(hwnd,GWL_STYLE)==style&&GetWindowLongPtrW(hwnd,GWL_EXSTYLE)==extended,"popup input/window styles unchanged");
        Check(winrt::Windows::System::DispatcherQueue::GetForCurrentThread()==queueBefore,"Brave/UI dispatcher is untouched");
        s_background.getClass=ClassForView;s_background.clear=ClearForView;s_background.originalPaint=PaintForView;
        s_background.ready=false;originalLayerOpaque=LayerOpacity;originalBubbleTheme=ThemeColors;originalFadeBackground=PaintFade;
        BubbleThemeHook(&view);
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
        Material::Stop();
        Check(!GetPropW(hwnd,Material::kProperty),"owned popup property removed before DLL unload");
        if(borderKnown){DWORD border=0;Check(SUCCEEDED(DwmGetWindowAttribute(hwnd,34,&border,sizeof(border)))&&border==previousBorder,
            "popup cleanup restores the actual previous Windows border color");}
        Check(!Material::thread&&Material::requests.empty(),"owned composition worker joined and registry cleared");
        Check(winrt::Windows::System::DispatcherQueue::GetForCurrentThread()==queueBefore,"cleanup does not stop the host UI dispatcher");
        DestroyWindow(hwnd);UnregisterClassW(cls.lpszClassName,cls.hInstance);
    }
    printf("PASS: %u native UI checks\n",checks);RoUninitialize();return 0;
}
