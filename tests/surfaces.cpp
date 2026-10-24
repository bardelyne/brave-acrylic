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
static std::vector<int> order;
static BraveBackground::ClassName* Name(const void* raw,BraveBackground::ClassName* name){
 const auto* view=static_cast<const TestView*>(raw);*name={view->name,strlen(view->name)};return name;
}
static bool Focus(const void* view){return static_cast<const TestView*>(view)->focused;}
static void Paint(void*,void*){++paints;}
static void Clear(void*,unsigned color,int mode){assert(color==0&&mode==0);++clears;}
static void LayerColor(void*,const NativeColor* color){received=*color;}
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
 s_background.areas=BraveBackground::Toolbar;s_transparencyReady=false;assert(!AddressShouldClear(&address));++checks;
 s_transparencyReady=true;assert(!AddressShouldClear(nullptr));++checks;
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
  assert(s_downloadCompatibility==selected&&s_hideNativeCaptionButtons==selected);++checks;}
 printf("%u address focus, scoped webview and tab-selection checks passed.\n",checks);
}
void TestLog(PCWSTR,...){}
PCWSTR Wh_GetStringSetting(PCWSTR,...){assert(false);return nullptr;}
void Wh_FreeStringSetting(PCWSTR){}
int Wh_GetIntSetting(PCWSTR){return enabled;}
size_t Wh_GetBinaryValue(PCWSTR,void*,size_t){return 0;}
BOOL Wh_SetBinaryValue(PCWSTR,const void*,size_t){return FALSE;}
BOOL Wh_SetFunctionHook(void*,void*,void**){return FALSE;}
BOOL Wh_ApplyHookOperations(){return FALSE;}
