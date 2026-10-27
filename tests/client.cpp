#define NOMINMAX
#include <windows.h>
#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <thread>
#include <vector>
#include "../brave-acrylic.wh.cpp"

static int checks=0,failures=0,hookCalls=0,lookupCalls=0;
static bool engineSuccess=true,applySuccess=true,blockLookup=false,entered=false,released=false;
static int badSlot=-1,failHook=-1;
static std::mutex mutex;
static std::condition_variable condition;
static HMODULE fakeModule=nullptr,mockModule=nullptr;
static CompatibilityMap fixture{},mockMap{},trustedMap{};
static bool haveVerifiedCache=true;
static void Check(bool ok,const char* label) {
    ++checks;
    if(!ok){++failures;printf("FAIL: %s\n",label);}
}
void TestLog(PCWSTR, ...) {}
PCWSTR Wh_GetStringSetting(PCWSTR, ...) {return L"";}
void Wh_FreeStringSetting(PCWSTR) {}
int Wh_GetIntSetting(PCWSTR) {return 0;}
size_t Wh_GetBinaryValue(PCWSTR name,void* out,size_t maximum) {
    if(!haveVerifiedCache)return 0;
    BuildIdentity id{};if(!GetBuildIdentity(mockModule,&id))return 0;
    Check(PipelineTrust::StorageKey(id)==name,"verified storage is bound to approved workflow and exact PDB identity");
    std::string text="1#chrome.dll#x86-64_"+std::to_string(id.timestamp)+"_"+std::to_string(id.imageSize);
    for(unsigned i=0;i<kFunctionSlots;++i)text+="#"+std::string(PipelineTrust::kSymbols[i])+"#"+std::to_string(trustedMap.functions[i].rva);
    const auto digest=PipelineTrust::Digest(text);
    std::vector<unsigned char> data(digest.begin(),digest.end());data.insert(data.end(),text.begin(),text.end());
    if(maximum<data.size())return 0;memcpy(out,data.data(),data.size());return data.size();
}
BOOL Wh_SetBinaryValue(PCWSTR,const void*,size_t) {Check(false,"unit fixtures never fetch or save remote data");return FALSE;}
BOOL Wh_SetFunctionHook(void* target,void*,void** original) {
    const int index=hookCalls++;
    if(index==failHook)return FALSE;
    *original=target;
    return TRUE;
}
BOOL Wh_ApplyHookOperations() {return applySuccess;}
bool WindhawkUtils::HookSymbols(HMODULE module,const SYMBOL_HOOK* hooks,size_t count,
                               const WH_HOOK_SYMBOLS_OPTIONS* options) {
    ++lookupCalls;
    Check(module==mockModule&&count==13,"resolve all required symbols for the loaded DLL");
    Check(options&&options->optionsSize==sizeof(*options)&&options->symbolServer&&
          !*options->symbolServer&&!options->noUndecoratedSymbols,"never download remote PDBs; standard C++ prototypes");
    Check(options->onlineCacheUrl&&!wcscmp(options->onlineCacheUrl,
          s_useOnlineSymbolCache?kOnlineSymbolCache:L""),"offline opt-out passed directly to Windhawk");
    if(blockLookup){std::unique_lock lock(mutex);entered=true;condition.notify_all();
        condition.wait(lock,[]{return released;});}
    for(unsigned i=0;i<count;++i){
        Check(hooks[i].symbols.size()==1&&!hooks[i].optional&&!hooks[i].hookFunction,
              "required named lookups cannot install partial hooks");
        *hooks[i].originalFunction=int(i)==badSlot?nullptr:
            reinterpret_cast<unsigned char*>(module)+mockMap.functions[i].rva;
    }
    return engineSuccess;
}
static std::vector<unsigned char> ReadFile(const wchar_t* file) {
    FILE* f=_wfopen(file,L"rb");if(!f)return {};fseek(f,0,SEEK_END);long size=ftell(f);rewind(f);
    std::vector<unsigned char> b(size);if(fread(b.data(),1,b.size(),f)!=b.size())b.clear();fclose(f);return b;
}
static void Reset() {
    hookCalls=lookupCalls=0;engineSuccess=applySuccess=true;badSlot=failHook=-1;
    blockLookup=entered=released=false;s_stopping=false;s_chromeAttempted=false;
    s_activateAfterInit=false;s_transparencyReady=false;s_isBrowserProcess=false;
    s_useOnlineSymbolCache=true;s_captionStopping=false;s_captionHooksInstalled=false;
    s_captionFixActive=false;s_hideNativeCaptionButtons=false;
    s_background.originalPaint=nullptr;s_background.clear=nullptr;s_background.getClass=nullptr;
    s_background.originalTransparent=nullptr;s_background.originalConstruct=nullptr;s_background.setBackground=nullptr;
    s_locationFocus=s_viewFocus=nullptr;s_originalTheme=s_originalReady=nullptr;
    s_originalLayerColor=nullptr;s_setPageBase=nullptr;s_originalAttachContents=nullptr;
    mockModule=fakeModule;mockMap=trustedMap=fixture;haveVerifiedCache=true;PipelineTrust::stopping=false;
}
static void TestValidation() {
    BuildIdentity identity{};Check(GetBuildIdentity(fakeModule,&identity),"read bounded CodeView identity");
    size_t rva[kFunctionSlots]{};Check(ValidateCompatibilityMap(fakeModule,fixture,rva),"accept producer-generated map");
    Check(rva[0]==0x1000&&rva[1]==0x1060&&rva[2]==0x10c0&&rva[5]==0x1200,"fixed ABI slot order");
    for(int kind=0;kind<13;kind++) {
        auto bad=fixture;
        switch(kind) {
        case 0:bad.magic^=1;break;case 1:bad.format++;break;case 2:bad.guid.Data1^=1;break;
        case 3:bad.age++;break;case 4:bad.machine=0xaa64;break;case 5:bad.timestamp++;break;
        case 6:bad.imageSize++;break;case 7:bad.functions[0].rva=0x1001;break;
        case 8:bad.functions[0].rva=0x3000;break;case 9:bad.functions[0].mask[0]=1;break;
        case 10:memset(bad.functions[0].mask,0,32);break;case 11:bad.functions[2].code[0]^=1;break;
        case 12:bad.functions[0].length=33;break;
        }
        rva[0]=rva[1]=rva[2]=0xdeadbeef;
        Check(!ValidateCompatibilityMap(fakeModule,bad,rva),"reject invalid identity/range/fingerprint");
        Check(rva[0]==0xdeadbeef&&rva[2]==0xdeadbeef,"never publish partial addresses");
    }
    auto* bytes=reinterpret_cast<unsigned char*>(fakeModule);const auto original=bytes[0x1008];
    bytes[0x1008]^=0x40;Check(ValidateCompatibilityMap(fakeModule,fixture,rva),"loader relocation is masked");bytes[0x1008]=original;
    for(int kind=0;kind<7;++kind){auto bad=fixture;
        switch(kind){case 0:bad.functions[3].kind=0;break;case 1:bad.functions[0].kind=1;break;
        case 2:bad.functions[3].length=12;break;case 3:bad.functions[3].mask[0]=0;break;
        case 4:bad.functions[3].code[12]=0x90;break;case 5:bad.functions[3].reserved=1;break;
        case 6:bad.functions[3].code[13]=1;break;}
        Check(!ValidateCompatibilityMap(fakeModule,bad,rva),"reject invalid short-leaf contract");
    }
    Check(rva[8]==0x1300,"named thunk resolves to its exact unwind-backed body");
    for(int kind=0;kind<12;++kind){auto bad=fixture;
        switch(kind){
        case 0:bad.functions[6].length=31;break;
        case 1:bad.functions[6].mask[3]=0;break;
        case 2:bad.functions[6].code[0]^=1;break;
        case 3:bad.functions[6].code[3]^=1;break;
        case 4:bad.functions[7].kind=2;break;
        case 5:bad.functions[8].reserved=0x1301;break;
        case 6:bad.functions[8].reserved=0xFFFFFFFF;break;
        case 7:bad.functions[9].kind=3;break;
        case 8:bad.functions[8].rva=0x12a0;break;
        case 9:bad.functions[12].rva=bad.functions[8].rva;break;
        case 10:bad.functions[12].reserved=1;break;
        case 11:memset(bad.functions[12].mask,0,32);break;
        }
        std::fill(std::begin(rva),std::end(rva),0xdeadbeef);
        Check(!ValidateCompatibilityMap(fakeModule,bad,rva),"reject invalid added dependency or named thunk");
        Check(std::all_of(std::begin(rva),std::end(rva),[](size_t value){return value==0xdeadbeef;}),"reject added dependency without publishing any addresses");
    }
    for(unsigned i=0;i<kFunctionSlots;++i){
        auto bad=fixture;bad.functions[i]={};
        Check(!ValidateCompatibilityMap(fakeModule,bad,rva),"reject every missing native dependency");
    }
    for(DWORD legacy:{1u,2u,3u,4u,5u}){auto bad=fixture;bad.format=legacy;
        Check(!ValidateCompatibilityMap(fakeModule,bad,rva),"reject legacy format contracts");}
    unsigned char savedStub[5];memcpy(savedStub,bytes+0x1700,5);
    bytes[0x1700]=0xe9;const int displacement=0x1060-0x1700-5;memcpy(bytes+0x1701,&displacement,4);
    auto thunk=fixture;thunk.functions[1].rva=0x1700;thunk.functions[1].kind=3;thunk.functions[1].reserved=0x1060;
    Check(ValidateCompatibilityMap(fakeModule,thunk,rva)&&rva[1]==0x1060,"direct named thunk accepted outside the original special slot");
    bytes[0x1701]^=1;Check(!ValidateCompatibilityMap(fakeModule,thunk,rva),"direct thunk destination still must match exactly");
    for(unsigned slot:{3u,6u}){
        auto leafThunk=fixture;auto& f=leafThunk.functions[slot];
        const DWORD body=f.rva;f.rva=0x1700;f.kind=3;f.reserved=body;
        const int jump=body-0x1700-5;memcpy(bytes+0x1701,&jump,4);
        Check(ValidateCompatibilityMap(fakeModule,leafThunk,rva)&&rva[slot]==body,"named thunk can wrap an exact approved leaf body");
        f.mask[0]=0;Check(!ValidateCompatibilityMap(fakeModule,leafThunk,rva),"thunk leaf bodies retain full fixed-byte validation");
    }
    memcpy(bytes+0x1700,savedStub,5);

}
static void TestSymbols() {
    Reset();size_t output[13]{};
    Check(ResolveSymbolAddresses(fakeModule,output)&&output[8]==0x1300,
          "named symbol entry resolves to the validated live body");
    for(int slot=0;slot<13;++slot){
        Reset();badSlot=slot;std::fill(std::begin(output),std::end(output),0xdeadbeef);
        Check(!ResolveNativeBackground(fakeModule)&&hookCalls==0,
              "every incomplete native group leaves all hooks unregistered");
        Check(!s_transparencyReady&&!HasCompleteTransparencyPath(),"incomplete lookup publishes no callable helpers");
    }
    Reset();haveVerifiedCache=false;s_useOnlineSymbolCache=false;
    Check(!ResolveNativeBackground(fakeModule)&&lookupCalls==0&&hookCalls==0,"offline Windhawk cache alone cannot bypass missing pipeline proof");
    Reset();mockMap.functions[0].rva=fixture.functions[1].rva;
    Check(!ResolveNativeBackground(fakeModule)&&hookCalls==0,"a valid function boundary with the wrong approved name is rejected before hooks");
    Reset();engineSuccess=false;
    Check(!ResolveNativeBackground(fakeModule)&&hookCalls==0,"even thirteen outputs cannot override a failed engine lookup");
    for(bool online:{false,true}){
        Reset();s_useOnlineSymbolCache=online;
        Check(TryInstallChromeHooks(fakeModule,false)&&hookCalls==7&&!s_transparencyReady,
              "initial hooks await Windhawk activation");
        s_isBrowserProcess=true;
        Wh_ModAfterInit();Check(s_transparencyReady,"AfterInit publishes only a complete group");
        Wh_ModBeforeUninit();Check(!s_transparencyReady,"unload disables readiness");
        Check(!TryInstallChromeHooks(fakeModule,true)&&hookCalls==7,"no duplicate hook batch after unload");
    }
    for(int kind=0;kind<5;++kind){
        Reset();auto* base=reinterpret_cast<unsigned char*>(fakeModule);
        void* addresses[13];for(unsigned i=0;i<13;++i)addresses[i]=base+fixture.functions[i].rva;
        switch(kind){case 0:addresses[5]=base+0x3000;break;case 1:addresses[5]=base-1;break;
        case 2:addresses[5]=base+0x1001;break;case 3:addresses[5]=addresses[0];break;
        case 4:addresses[5]=base+0x3fff;break;}
        std::fill(std::begin(output),std::end(output),0xdeadbeef);
        Check(!ValidateSymbolAddresses(fakeModule,addresses,output),"reject data, outside, interior, aliased and truncated addresses");
        Check(std::all_of(std::begin(output),std::end(output),[](size_t x){return x==0xdeadbeef;}),
              "local gate publishes no partial addresses");
    }
    for(int failure=0;failure<7;++failure){Reset();failHook=failure;
        Check(!TryInstallChromeHooks(fakeModule,true)&&!s_transparencyReady,"failed registration never enables transparency");}
    Reset();applySuccess=false;
    Check(!TryInstallChromeHooks(fakeModule,true)&&!s_transparencyReady,"failed activation leaves original paint path");
    Reset();s_stopping=true;
    Check(!TryInstallChromeHooks(fakeModule,true)&&lookupCalls==0&&hookCalls==0,"shutdown blocks new discovery and hooks");
}
static void TestShutdown() {
    Reset();blockLookup=true;
    std::thread install([]{TryInstallChromeHooks(fakeModule,true);});
    {std::unique_lock lock(mutex);condition.wait(lock,[]{return entered;});}
    std::atomic<bool> stopped=false;
    std::thread unload([&]{Wh_ModBeforeUninit();stopped=true;});
    Sleep(10);Check(!stopped,"unload waits for the in-flight native resolver");
    {std::lock_guard lock(mutex);released=true;}condition.notify_all();
    install.join();unload.join();const int registered=hookCalls;
    Check(stopped&&!s_transparencyReady,"shutdown cannot leave late readiness");
    Check(!TryInstallChromeHooks(fakeModule,true)&&hookCalls==registered,"no registration after shutdown returns");
}
static void TestCaptionRestore() {
    Reset();pOrigGetWindowLongPtrW=GetWindowLongPtrW;pOrigSetWindowLongPtrW=SetWindowLongPtrW;
    pOrigGetWindowLongW=GetWindowLongW;pOrigSetWindowLongW=SetWindowLongW;
    WNDCLASSW wc{};wc.lpfnWndProc=DefWindowProcW;wc.hInstance=GetModuleHandleW(nullptr);
    wc.lpszClassName=L"Chrome_WidgetWin_1";RegisterClassW(&wc);
    HWND window=CreateWindowExW(0,wc.lpszClassName,L"Hidden caption fixture",WS_OVERLAPPEDWINDOW,
                              0,0,320,240,nullptr,nullptr,wc.hInstance,nullptr);
    Check(window!=nullptr,"create an owned hidden native frame fixture");
    s_isBrowserProcess=true;s_captionHooksInstalled=true;s_transparencyReady=true;
    SyncNativeCaptions();Check(GetWindowLongPtrW(window,GWL_STYLE)&WS_SYSMENU,"default-off option preserves actual system-menu style");
    s_hideNativeCaptionButtons=true;SyncNativeCaptions();
    Check(!(GetWindowLongPtrW(window,GWL_STYLE)&WS_SYSMENU)&&GetPropW(window,kNativeCaptionProperty),
          "opt-in records and removes only its real system-menu bit");
    Check(GetWindowLongPtrW_Hook(window,GWL_STYLE)&WS_SYSMENU,"hook reports logical style while hiding is active");
    Wh_ModBeforeUninit();
    Check((GetWindowLongPtrW(window,GWL_STYLE)&WS_SYSMENU)&&!GetPropW(window,kNativeCaptionProperty),
          "BeforeUninit restores actual style and ownership before hooks disappear");
    Check(!s_transparencyReady&&!s_captionFixActive,"unload disables all overrides");
    DestroyWindow(window);UnregisterClassW(wc.lpszClassName,wc.hInstance);
}
int wmain(int argc,wchar_t** argv) {
    if(argc<3)return 2;
    auto file=ReadFile(argv[1]),map=ReadFile(argv[2]);
    if(file.empty()||map.size()!=sizeof(fixture))return 3;memcpy(&fixture,map.data(),sizeof(fixture));
    auto* base=static_cast<unsigned char*>(VirtualAlloc(nullptr,0x4000,MEM_RESERVE|MEM_COMMIT,PAGE_READWRITE));
    if(!base)return 4;fakeModule=reinterpret_cast<HMODULE>(base);memcpy(base,file.data(),0x400);
    const auto* nt=reinterpret_cast<const IMAGE_NT_HEADERS64*>(base+reinterpret_cast<IMAGE_DOS_HEADER*>(base)->e_lfanew);
    const auto* section=IMAGE_FIRST_SECTION(nt);
    for(unsigned i=0;i<nt->FileHeader.NumberOfSections;i++)memcpy(base+section[i].VirtualAddress,file.data()+section[i].PointerToRawData,section[i].SizeOfRawData);
    TestValidation();TestSymbols();TestShutdown();TestCaptionRestore();Reset();
    if(argc==5) {
        HMODULE actual=LoadLibraryExW(argv[3],nullptr,DONT_RESOLVE_DLL_REFERENCES);
        auto bytes=ReadFile(argv[4]);CompatibilityMap real{};size_t rva[kFunctionSlots]{};
        Check(actual&&bytes.size()==sizeof(real),"map real Brave DLL without executing it");
        if(actual&&bytes.size()==sizeof(real)) {
            memcpy(&real,bytes.data(),sizeof(real));Check(ValidateCompatibilityMap(actual,real,rva),"validate official PDB-derived data against the loaded real DLL");
            Reset();
            mockModule=actual;mockMap=trustedMap=real;
            Check(ResolveSymbolAddresses(actual,rva),"real named-entry validation, including the live E9 thunk");
            Check(ResolveNativeBackground(actual)&&hookCalls==7&&lookupCalls==2,
                  "real build always uses Windhawk lookup before installing seven hooks");
            real.functions[2].code[0]^=1;Check(!ValidateCompatibilityMap(actual,real,rva),"reject altered real-build fingerprint");
        }
        if(actual)FreeLibrary(actual);
    }
    VirtualFree(base,0,MEM_RELEASE);printf("%d checks, %d failures\n",checks,failures);return failures?1:0;
}
