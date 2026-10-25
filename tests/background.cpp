#define NOMINMAX
#include "../brave-acrylic.wh.cpp"
#include <cassert>
#include <cstdio>
#include <string>
#include <vector>
using namespace BraveBackground;
struct View { std::string name; unsigned background; bool constructed=false; };
static std::vector<std::string> operations;
static void* observedHost=nullptr;
static unsigned canvasValue=0xFFFFFFFF;
static void OriginalPaint(void* view,void*) { operations.emplace_back(view?"original":"null-original"); }
static void ClearCanvas(void*,unsigned value,int mode) { assert(value==0&&mode==0);canvasValue=value;operations.emplace_back("clear"); }
static ClassName* Name(const void* raw,ClassName* out) { auto& v=*(const View*)raw;*out={v.name.data(),v.name.size()};return out; }
static bool OriginalTransparent(const void*) { operations.emplace_back("original-transparent");return false; }
static void* OriginalConstruct(void* raw,void*,void* host) { ((View*)raw)->constructed=true;observedHost=host;operations.emplace_back("construct");return raw; }
static void SetBackgroundEmpty(void* raw,void** value) { assert(raw==observedHost&&value&&!*value);((View*)raw)->background=0;operations.emplace_back("backing-clear"); }
int main(){
 Context context;context.originalPaint=OriginalPaint;context.clear=ClearCanvas;
 context.getClass=Name;context.originalTransparent=OriginalTransparent;
 context.originalConstruct=OriginalConstruct;context.setBackground=SetBackgroundEmpty;
 assert(context.Complete());context.ready=true;
 unsigned checks=0;
 // Identical colors in other controls never select them for clearing.
 const char* protectedNames[]={"View","Label","ImageView","Textfield","LabelButton","ToolbarButton","BraveTab","VerticalTabNewTabButton","ShortcutBox","BraveLocationBarView","ContentsWebView","BraveContentsContainerView","MenuItemView","BrowserCaptionButtonContainer","BraveToolbarViewExtra"};
 for(const char* n:protectedNames)for(unsigned color:{0u,0xFFFFFFFFu,0xFF333C4Du,0xFF1D2636u}){
  View v{n,color};operations.clear();canvasValue=0xABCD;PaintBackground(context,&v,&canvasValue);
  assert(operations==std::vector<std::string>{"original"});assert(canvasValue==0xABCD);++checks;
 }
 for(const char* n:{"BraveToolbarView","ToolbarView","TopContainerView","BraveBrowserView","BrowserView","BraveVerticalTabStripContainerView","BraveVerticalTabStripRegionView","BraveBookmarkBarView","BookmarkBarView"})for(unsigned color:{0u,0xFFFFFFFFu,0xFF333C4Du,0xFF771199u}){
  View v{n,color};operations.clear();canvasValue=0xABCD;PaintBackground(context,&v,&canvasValue);
  assert(operations==std::vector<std::string>{"clear"});assert(canvasValue==0);++checks;
 }
 assert(!IsBackgroundContainer({nullptr,20},3));assert(!IsBackgroundContainer({"View",0},3));
 char longName[128]{};assert(!IsBackgroundContainer({longName,128},3));checks+=3;
 assert(WindowContentsTransparent(context,nullptr));++checks;
 View self{"BraveVerticalTabStripContainerView",123},host{"View",0xFF123456},unrelated{"View",0xFF123456};
 operations.clear();assert(ConstructSidebar(context,&self,nullptr,&host)==&self);
 assert(self.constructed&&host.background==0&&unrelated.background==0xFF123456);
 assert((operations==std::vector<std::string>{"construct","backing-clear"}));++checks;
 operations.clear();ConstructSidebar(context,&self,nullptr,nullptr);assert(operations==std::vector<std::string>{"construct"});++checks;
 context.ready=false;host.background=0xFF999999;operations.clear();ConstructSidebar(context,&self,nullptr,&host);
 assert(host.background==0xFF999999&&operations==std::vector<std::string>{"construct"});++checks;
 operations.clear();assert(!WindowContentsTransparent(context,nullptr));assert(operations==std::vector<std::string>{"original-transparent"});++checks;
 View toolbar{"BraveToolbarView",0xFF333C4D};operations.clear();PaintBackground(context,&toolbar,&canvasValue);assert(operations==std::vector<std::string>{"original"});++checks;
 operations.clear();PaintBackground(context,nullptr,&canvasValue);assert(operations==std::vector<std::string>{"null-original"});++checks;
 context.ready=true;operations.clear();PaintBackground(context,&toolbar,nullptr);assert(operations==std::vector<std::string>{"original"});++checks;
 context.ready=true;
 for(unsigned mask=0;mask<4;++mask){context.areas=mask;
  for(const char* n:{"BraveToolbarView","TopContainerView","BookmarkBarView","BraveVerticalTabStripRegionView","BraveVerticalTabStripContainerView","BraveBrowserView","View","Label","ContentsWebView","MenuItemView"}){
   View v{n,0xFF333C4D};bool selected=false;
   if(v.name=="BraveBrowserView")selected=mask!=0;
   else if(v.name=="BraveToolbarView"||v.name=="TopContainerView"||v.name=="BookmarkBarView")selected=(mask&2)!=0;
   else if(v.name=="BraveVerticalTabStripRegionView"||v.name=="BraveVerticalTabStripContainerView")selected=(mask&1)!=0;
   operations.clear();PaintBackground(context,&v,&canvasValue);
   assert(operations==std::vector<std::string>{selected?"clear":"original"});++checks;
  }
  host.background=0xFFAABBCC;operations.clear();ConstructSidebar(context,&self,nullptr,&host);
  assert(host.background==((mask&1)?0u:0xFFAABBCCu));++checks;
  assert(WindowContentsTransparent(context,nullptr)==(mask!=0));++checks;
 }
 printf("%u background-role, color independence, native ownership, and disabled-path checks passed.\n",checks);
}

void TestLog(PCWSTR,...){}
PCWSTR Wh_GetStringSetting(PCWSTR,...){return L"";}
void Wh_FreeStringSetting(PCWSTR){}
int Wh_GetIntSetting(PCWSTR){return 0;}
size_t Wh_GetBinaryValue(PCWSTR,void*,size_t){return 0;}
BOOL Wh_SetBinaryValue(PCWSTR,const void*,size_t){return FALSE;}
BOOL Wh_SetFunctionHook(void*,void*,void**){return FALSE;}
BOOL Wh_ApplyHookOperations(){return FALSE;}

bool WindhawkUtils::HookSymbols(HMODULE,const SYMBOL_HOOK*,size_t,const WH_HOOK_SYMBOLS_OPTIONS*) {return false;}
