#define NOMINMAX
#include "../brave-acrylic.wh.cpp"
#include <cassert>
#include <cstdio>
#include <thread>
#include <vector>

struct TestView { const char* name; bool focused; };
static unsigned checks=0,paints=0,clears=0;
static NativeColor received{};

static bool enabled=true;
static bool toolbarEnabled=true,addressBarEnabled=true;
static std::vector<int> order;
static BraveBackground::ClassName* Name(const void* raw,BraveBackground::ClassName* name){
 const auto* view=static_cast<const TestView*>(raw);*name={view->name,strlen(view->name)};return name;
}
static bool Focus(const void* view){return static_cast<const TestView*>(view)->focused;}
static void Paint(void*,void*){++paints;}
static void Clear(void*,unsigned color,int mode){assert(color==0&&mode==0);++clears;}
static ShadowParameters receivedShadow{};
static void* ConstructTestShadow(void* self,void*,const void*,const ShadowParameters* params){
 receivedShadow=*params;return self;
}
static void LayerColor(void*,const NativeColor* color){received=*color;}
static unsigned borderDraws=0,pathDraws=0;
static int configuredOpacity=62;
static int fillPath=1,strokePath=2,fillFlags=3,strokeFlags=4;
static std::vector<const void*> drawnPaths;
static void OriginalPath(void* canvas,const void* path,const void* flags,int cache){
 assert(canvas);
 assert((path==&fillPath&&flags==&fillFlags&&cache==17)||
        (path==&strokePath&&flags==&strokeFlags&&cache==29));
 drawnPaths.push_back(path);++pathDraws;
}
static void OriginalBorder(void*,void* canvas){
 ++borderDraws;
 if(canvas){RoundedContents::PathHook(canvas,&fillPath,&fillFlags,17);
            RoundedContents::PathHook(canvas,&strokePath,&strokeFlags,29);}
}
static void NestedColors(void*){
 const NativeColor opaque{.2f,.4f,.6f,1};PageLayerColorHook(nullptr,&opaque);
}
struct TestPage {uint64_t base;unsigned cssColor;};
static unsigned attaches=0,baseWrites=0;
static void* expectedContents=nullptr;
static void SetPageBase(void* contents,uint64_t color){
 assert(contents==expectedContents&&color==(uint64_t(1)<<32));
 static_cast<TestPage*>(contents)->base=color;++baseWrites;order.push_back(3);
}
static void Attach(void* host,void* contents){
 assert(host==reinterpret_cast<void*>(99)&&contents==expectedContents);++attaches;order.push_back(4);
}

int main(){
 s_background.getClass=Name;s_background.originalPaint=Paint;s_background.clear=Clear;
 s_locationFocus=s_viewFocus=Focus;s_transparencyReady=true;s_background.areas=BraveBackground::All;
 for(const char* name:{"LocationBarView","BraveLocationBarView","OmniboxViewViews","BraveOmniboxViewViews","Textfield","MenuItemView"})
  for(bool focused:{false,true}){
   TestView view{name,focused};const bool address=strcmp(name,"Textfield")&&strcmp(name,"MenuItemView");
   paints=clears=0;ViewOnPaintBackground_Hook(&view,&view);
   assert(clears==unsigned(address&&!focused)&&paints==unsigned(!address||focused));++checks;
  }
 TestView address{"BraveLocationBarView",false};
 s_background.areas=BraveBackground::Background;assert(!AddressShouldClear(&address));++checks;
 s_background.areas=BraveBackground::AddressBar;s_transparencyReady=false;assert(!AddressShouldClear(&address));++checks;
 s_transparencyReady=true;assert(!AddressShouldClear(nullptr));++checks;
 s_originalShadow=ConstructTestShadow;
 TestView toolbar{"BraveToolbarView",false};
 TestView otherShadow{"MenuItemView",false};
 const ShadowParameters shadow{0,1,13,0xFF123456};
 for(bool toolbarOn:{false,true})for(bool addressOn:{false,true}){
  toolbarEnabled=toolbarOn;addressBarEnabled=addressOn;LoadModSettings();
  paints=clears=0;ViewOnPaintBackground_Hook(&toolbar,&toolbar);
  assert(clears==unsigned(toolbarOn)&&paints==unsigned(!toolbarOn));++checks;
  paints=clears=0;ViewOnPaintBackground_Hook(&address,&address);
  assert(clears==unsigned(addressOn)&&paints==unsigned(!addressOn));++checks;
  for(auto* view:{&address,&otherShadow}){
   assert(ConstructShadowHook(view,view,nullptr,&shadow)==view);
   assert(receivedShadow.color==(addressOn&&view==&address?0u:shadow.color));
   assert(receivedShadow.offsetX==shadow.offsetX&&receivedShadow.offsetY==shadow.offsetY&&
          receivedShadow.blurRadius==shadow.blurRadius&&shadow.color==0xFF123456);++checks;
  }
 }
 RoundedContents::originalBorder=OriginalBorder;RoundedContents::originalPath=OriginalPath;
 for(bool available:{false,true})for(bool ready:{false,true})for(unsigned area=0;area<=7;++area)
  for(const char* name:{"BraveContentsContainerView","ContentsContainerView","ContentsWebView","Label","MenuItemView"}) {
   RoundedContents::available=available;s_transparencyReady=ready;s_background.areas=area;
   TestView view{name,false};drawnPaths.clear();borderDraws=pathDraws=0;
   RoundedContents::BorderHook(&view,&view);
   const bool clear=available&&ready&&(area&BraveBackground::Page)&&!strcmp(name,"BraveContentsContainerView");
   assert(borderDraws==1&&pathDraws==(clear?1u:2u));
   assert(drawnPaths.back()==&strokePath&&!RoundedContents::skipFill);++checks;
  }
 RoundedContents::available=true;s_transparencyReady=true;s_background.areas=BraveBackground::Page;
 TestView rounded{"BraveContentsContainerView",false};
 borderDraws=0;RoundedContents::BorderHook(&rounded,nullptr);assert(borderDraws==1&&!RoundedContents::skipFill);++checks;
 RoundedContents::skipFill=true;
 std::thread isolated([&]{assert(!RoundedContents::skipFill);});isolated.join();++checks;
 RoundedContents::skipFill=false;
 drawnPaths.clear();RoundedContents::PathHook(&rounded,&fillPath,&fillFlags,17);
 assert(drawnPaths==std::vector<const void*>{&fillPath});++checks;
 s_originalTheme=s_originalReady=NestedColors;s_originalLayerColor=LayerColor;
 for(bool ready:{false,true})for(unsigned areas:{0u,1u,2u,4u,7u}){
  s_transparencyReady=ready;s_background.areas=areas;
  NestedColors(nullptr);assert(received.a==1);++checks;
  PageThemeHook(nullptr);const bool clear=ready&&(areas&BraveBackground::Page);
  assert(received.a==(clear?0.f:1.f));assert(s_pageBackgroundScope==0);++checks;
  PageReadyHook(nullptr);assert(received.a==(clear?0.f:1.f));++checks;
 }
 s_transparencyReady=true;s_background.areas=BraveBackground::Page;
 {PageScope outer;assert(s_pageBackgroundScope==1);{PageScope inner;assert(s_pageBackgroundScope==2);}assert(s_pageBackgroundScope==1);
  std::thread other([]{assert(s_pageBackgroundScope==0);});other.join();}assert(s_pageBackgroundScope==0);checks+=4;

 s_setPageBase=SetPageBase;s_originalAttachContents=Attach;
 for(bool ready:{false,true})for(unsigned areas:{0u,1u,2u,3u,4u,5u,6u,7u})for(bool present:{false,true}){
  s_transparencyReady=ready;s_background.areas=areas;TestPage page{0x1ffffffff,0xffffffff};
  expectedContents=present?&page:nullptr;attaches=baseWrites=0;order.clear();
  AttachContentsHook(reinterpret_cast<void*>(99),expectedContents);
  const bool selected=ready&&present&&(areas&BraveBackground::Page);
  assert(attaches==1&&baseWrites==unsigned(selected));
  assert(page.base==(selected?(uint64_t(1)<<32):0x1ffffffff)&&page.cssColor==0xffffffff);
  assert(order==(selected?std::vector<int>{3,4}:std::vector<int>{4}));++checks;
 }
 // Existing tabs are fixed by selection alone, retaining their authored colors.
 s_transparencyReady=true;s_background.areas=BraveBackground::Page;
 TestPage pages[]={{0x1ffffffff,0xffffffff},{0x1ff39393b,0xff000000},{0x1ff333c4d,0xff1d2636}};
 const unsigned css[]={0xffffffff,0xff000000,0xff1d2636};
 for(unsigned i=0;i<30;++i){auto& page=pages[i%3];expectedContents=&page;AttachContentsHook(reinterpret_cast<void*>(99),&page);
  assert(page.base==(uint64_t(1)<<32)&&page.cssColor==css[i%3]);++checks;
 }

 for(bool selected:{false,true}){enabled=selected;LoadModSettings();
  assert(s_background.areas==(selected?BraveBackground::All:0u));
  assert(s_useOnlineSymbolCache==selected&&s_hideNativeCaptionButtons==selected);++checks;}
 for(int value:{-20,0,1,62,100,200}){configuredOpacity=value;LoadModSettings();
  assert(s_popupOpacity==static_cast<unsigned>(std::clamp(value,0,100)));++checks;}
 printf("%u toolbar, address shadow, focus, scoped webview and tab-selection checks passed.\n",checks);
}
void TestLog(PCWSTR,...){}
PCWSTR Wh_GetStringSetting(PCWSTR,...){assert(false);return nullptr;}
void Wh_FreeStringSetting(PCWSTR){}
int Wh_GetIntSetting(PCWSTR name){
 if(!wcscmp(name,L"popupOpacity"))return configuredOpacity;
 if(!wcscmp(name,L"transparentToolbar"))return enabled&&toolbarEnabled;
 if(!wcscmp(name,L"transparentAddressBar"))return enabled&&addressBarEnabled;
 return enabled;
}
size_t Wh_GetBinaryValue(PCWSTR,void*,size_t){return 0;}
BOOL Wh_SetBinaryValue(PCWSTR,const void*,size_t){return FALSE;}
BOOL Wh_SetFunctionHook(void*,void*,void**){return FALSE;}
BOOL Wh_ApplyHookOperations(){return FALSE;}

bool WindhawkUtils::HookSymbols(HMODULE,const SYMBOL_HOOK*,size_t,const WH_HOOK_SYMBOLS_OPTIONS*) {return false;}
