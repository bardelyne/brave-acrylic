#define NOMINMAX
#include <windows.h>
#include <winhttp.h>
#include <dxgi1_2.h>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <fstream>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>
#include <windhawk_api.h>

decltype(WinHttpOpen) MockOpen;
decltype(WinHttpConnect) MockConnect;
decltype(WinHttpOpenRequest) MockRequest;
decltype(WinHttpSetOption) MockOption;
decltype(WinHttpSetTimeouts) MockTimeouts;
decltype(WinHttpSendRequest) MockSend;
decltype(WinHttpReceiveResponse) MockReceive;
decltype(WinHttpQueryHeaders) MockHeaders;
decltype(WinHttpReadData) MockRead;
decltype(WinHttpCloseHandle) MockClose;
decltype(GetModuleHandleExW) MockPin;
decltype(FreeLibrary) MockFree;
#define WinHttpOpen MockOpen
#define WinHttpConnect MockConnect
#define WinHttpOpenRequest MockRequest
#define WinHttpSetOption MockOption
#define WinHttpSetTimeouts MockTimeouts
#define WinHttpSendRequest MockSend
#define WinHttpReceiveResponse MockReceive
#define WinHttpQueryHeaders MockHeaders
#define WinHttpReadData MockRead
#define WinHttpCloseHandle MockClose
#define GetModuleHandleExW MockPin
#define FreeLibrary MockFree
#include "../brave-acrylic.wh.cpp"
#undef FreeLibrary
#undef GetModuleHandleExW
#undef WinHttpOpen
#undef WinHttpConnect
#undef WinHttpOpenRequest
#undef WinHttpSetOption
#undef WinHttpSetTimeouts
#undef WinHttpSendRequest
#undef WinHttpReceiveResponse
#undef WinHttpQueryHeaders
#undef WinHttpReadData
#undef WinHttpCloseHandle

static int checks=0,failures=0,hookCalls=0;
static std::mutex storageMutex,networkMutex;
static std::condition_variable networkCv;
static std::unordered_map<std::wstring,std::vector<unsigned char>> storage;
static std::atomic<bool> settingEnabled{true},inSend{false};
static bool blockSend=false,releaseSend=false;
static std::atomic<unsigned> openCalls{0},sendCalls{0},readCalls{0},closeCalls{0},pinCalls{0},freeCalls{0},closeRaces{0};
static DWORD httpStatus=200,chunkSize=257;
static bool missingLength=false,wrongLength=false,failOpen=false;
static std::vector<unsigned char> response;
static size_t position=0;
static std::wstring host,requestPath;
static DWORD redirectPolicy=0,disabledFeatures=0,connectRetries=99;
static HMODULE fakeModule=nullptr;
static CompatibilityMap fixture{};
static constexpr size_t toolbarRow=0x3210;

static void Check(bool ok,const char* label) {
    ++checks;if(!ok){++failures;printf("FAIL: %s\n",label);}
}
void TestLog(PCWSTR, ...) {}
PCWSTR Wh_GetStringSetting(PCWSTR, ...) {return new wchar_t[1]{};}
void Wh_FreeStringSetting(PCWSTR value) {delete[] value;}
int Wh_GetIntSetting(PCWSTR name) {
    return !wcscmp(name,L"downloadCompatibilityData")?settingEnabled.load():0;
}
size_t Wh_GetBinaryValue(PCWSTR key,void* out,size_t size) {
    std::lock_guard lock(storageMutex);auto i=storage.find(key);if(i==storage.end())return 0;
    if(i->second.size()>size)return i->second.size();memcpy(out,i->second.data(),i->second.size());return i->second.size();
}
BOOL Wh_SetBinaryValue(PCWSTR key,const void* bytes,size_t size) {
    std::lock_guard lock(storageMutex);storage[key]=std::vector<unsigned char>(
        static_cast<const unsigned char*>(bytes),static_cast<const unsigned char*>(bytes)+size);return TRUE;
}
BOOL Wh_SetFunctionHook(void* target,void*,void** original) {++hookCalls;*original=target;return TRUE;}
BOOL Wh_ApplyHookOperations() {return TRUE;}

HINTERNET WINAPI MockOpen(LPCWSTR,DWORD,LPCWSTR,LPCWSTR,DWORD flags) {
    ++openCalls;Check(flags==0,"synchronous worker has no unload-unsafe callbacks");
    return failOpen?nullptr:reinterpret_cast<HINTERNET>(1);
}
HINTERNET WINAPI MockConnect(HINTERNET,LPCWSTR name,INTERNET_PORT port,DWORD) {
    host=name;Check(port==443,"HTTPS port is fixed");return reinterpret_cast<HINTERNET>(2);
}
HINTERNET WINAPI MockRequest(HINTERNET,LPCWSTR method,LPCWSTR path,LPCWSTR,LPCWSTR,LPCWSTR*,DWORD flags) {
    requestPath=path;Check(!wcscmp(method,L"GET")&&flags==WINHTTP_FLAG_SECURE,"fixed HTTPS GET only");
    return reinterpret_cast<HINTERNET>(3);
}
BOOL WINAPI MockOption(HINTERNET,DWORD option,LPVOID bytes,DWORD size) {
    if(size!=sizeof(DWORD))return FALSE;
    const DWORD v=*static_cast<DWORD*>(bytes);
    if(option==WINHTTP_OPTION_REDIRECT_POLICY)redirectPolicy=v;
    if(option==WINHTTP_OPTION_DISABLE_FEATURE)disabledFeatures=v;
    if(option==WINHTTP_OPTION_CONNECT_RETRIES)connectRetries=v;
    return TRUE;
}
BOOL WINAPI MockTimeouts(HINTERNET,int a,int b,int c,int d) {return a>0&&a<=2000&&a==b&&a==c&&a==d;}
BOOL WINAPI MockSend(HINTERNET,LPCWSTR,DWORD,LPVOID,DWORD,DWORD,DWORD_PTR) {
    ++sendCalls;inSend=true;
    {std::unique_lock lock(networkMutex);networkCv.notify_all();if(blockSend)networkCv.wait(lock,[]{return releaseSend;});}
    inSend=false;return TRUE;
}
BOOL WINAPI MockReceive(HINTERNET,LPVOID) {return TRUE;}
BOOL WINAPI MockHeaders(HINTERNET,DWORD info,LPCWSTR,LPVOID out,LPDWORD size,LPDWORD) {
    if(*size<4)return FALSE;
    if((info&~WINHTTP_QUERY_FLAG_NUMBER)==WINHTTP_QUERY_STATUS_CODE)*static_cast<DWORD*>(out)=httpStatus;
    else if((info&~WINHTTP_QUERY_FLAG_NUMBER)==WINHTTP_QUERY_CONTENT_LENGTH) {
        if(missingLength){SetLastError(ERROR_WINHTTP_HEADER_NOT_FOUND);return FALSE;}
        *static_cast<DWORD*>(out)=wrongLength?257:256;
    }else return FALSE;
    *size=4;return TRUE;
}
BOOL WINAPI MockRead(HINTERNET,LPVOID out,DWORD size,LPDWORD received) {
    ++readCalls;const size_t n=std::min<size_t>(std::min(size,chunkSize),response.size()-position);
    memcpy(out,response.data()+position,n);position+=n;*received=static_cast<DWORD>(n);return TRUE;
}
BOOL WINAPI MockClose(HINTERNET) {if(inSend)++closeRaces;++closeCalls;return TRUE;}
BOOL WINAPI MockPin(DWORD flags,LPCWSTR address,HMODULE* out) {
    ++pinCalls;Check(flags==GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,"worker takes a real loader reference");
    *out=reinterpret_cast<HMODULE>(const_cast<wchar_t*>(address));return TRUE;
}
BOOL WINAPI MockFree(HMODULE) {++freeCalls;return TRUE;}

static std::vector<unsigned char> ReadFile(const wchar_t* file) {
    FILE* f=_wfopen(file,L"rb");if(!f)return {};fseek(f,0,SEEK_END);long size=ftell(f);rewind(f);
    std::vector<unsigned char> b(size);if(fread(b.data(),1,b.size(),f)!=b.size())b.clear();fclose(f);return b;
}
static void ResetNetwork() {
    httpStatus=200;chunkSize=257;missingLength=wrongLength=failOpen=false;position=0;
    response.assign(reinterpret_cast<const unsigned char*>(&fixture),reinterpret_cast<const unsigned char*>(&fixture)+sizeof(fixture));
    openCalls=sendCalls=readCalls=closeCalls=pinCalls=freeCalls=closeRaces=0;
    redirectPolicy=0;disabledFeatures=0;connectRetries=99;host.clear();requestPath.clear();
    blockSend=releaseSend=false;inSend=false;settingEnabled=true;s_downloadCompatibility=true;
}
static void Reset() {
    if(s_downloadThread){WaitForSingleObject(s_downloadThread,5000);Wh_ModUninit();}
    storage.clear();hookCalls=0;s_stopping=false;s_afterInit=false;s_downloadAttempted=false;
    s_recoveryModule=nullptr;s_recoveryToolbarRow=0;s_chromeAttempted=false;
    s_activateAfterInit=false;s_transparencyReady=false;s_isBrowserProcess=false;
    pOrigGetColor=nullptr;pOrigViewOnPaintBackground=nullptr;pCanvasDrawColor=nullptr;s_toolbarColorId=-1;
    ResetNetwork();
}
static void PutCache() {
    CompatibilityCache cache{};cache.map=fixture;cache.toolbarRowRva=toolbarRow;strcpy(cache.version,"fixture");
    Wh_SetBinaryValue(L"compatibilityMapV1",&cache,sizeof(cache));
}
static void TestValidation() {
    BuildIdentity identity{};Check(GetBuildIdentity(fakeModule,&identity),"read bounded CodeView identity");
    wchar_t key[48]{};Check(FormatBuildKey(identity,key,48),"format exact identity key");
    Check(!wcscmp(key,L"33221100554477668899AABBCCDDEEFF1"),"canonical GUID endianness and hexadecimal age");
    size_t rva[3]{};Check(ValidateCompatibilityMap(fakeModule,fixture,rva),"accept producer-generated map");
    Check(rva[0]==0x1000&&rva[1]==0x1100&&rva[2]==0x1200,"fixed ABI slot order");
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
    PutCache();size_t row=0;int id=-1;
    Check(LoadCompatibilityCache(fakeModule,rva,&row,&id)&&row==toolbarRow&&id==18,"load and validate cached toolbar table");
    CompatibilityCache corrupt{};corrupt.map=fixture;corrupt.toolbarRowRva=0x3fff;
    Wh_SetBinaryValue(L"compatibilityMapV1",&corrupt,sizeof(corrupt));
    Check(!LoadCompatibilityCache(fakeModule,rva,&row,&id),"reject invalid cached color table");
    memset(corrupt.version,'x',64);Wh_SetBinaryValue(L"compatibilityMapV1",&corrupt,sizeof(corrupt));
    Check(!LoadCompatibilityCache(fakeModule,rva,&row,&id),"reject unterminated cached version");
}
static void TestHttp() {
    BuildIdentity id{};GetBuildIdentity(fakeModule,&id);
    HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr);CompatibilityMap out{};
    ResetNetwork();Check(FetchCompatibilityMap(id,stop,&out),"download exact-length data");
    Check(host==L"raw.githubusercontent.com"&&requestPath==
        L"/bardelyne/brave-acrylic/compatibility-v1/maps/33221100554477668899AABBCCDDEEFF1.bin","fixed host and exact build URL");
    Check(redirectPolicy==WINHTTP_OPTION_REDIRECT_POLICY_NEVER&&connectRetries==2,"no redirects; connection attempts stay bounded");
    Check((disabledFeatures&(WINHTTP_DISABLE_COOKIES|WINHTTP_DISABLE_AUTHENTICATION))==
        (WINHTTP_DISABLE_COOKIES|WINHTTP_DISABLE_AUTHENTICATION),"cookies and ambient authentication disabled");
    Check(closeCalls==3&&closeRaces==0,"HTTP handles close in their owning thread");
    ResetNetwork();missingLength=true;chunkSize=1;
    Check(FetchCompatibilityMap(id,stop,&out)&&readCalls==257,"bounded chunked body without Content-Length");
    for(DWORD status:{301u,302u,404u,500u}) {ResetNetwork();httpStatus=status;
        Check(!FetchCompatibilityMap(id,stop,&out)&&readCalls==0,"reject missing/redirected/error responses");}
    for(int length:{0,255,257,5000}) {ResetNetwork();missingLength=true;response.resize(length);
        Check(!FetchCompatibilityMap(id,stop,&out),"reject truncated and oversized bodies");}
    ResetNetwork();wrongLength=true;
    Check(!FetchCompatibilityMap(id,stop,&out)&&readCalls==0,"reject inconsistent advertised length");
    ResetNetwork();SetEvent(stop);
    Check(!FetchCompatibilityMap(id,stop,&out)&&sendCalls==0,"cancel before any request is sent");ResetEvent(stop);
    ResetNetwork();settingEnabled=false;s_downloadCompatibility=false;
    Check(!FetchCompatibilityMap(id,stop,&out)&&sendCalls==0,"network setting disables requests");
    ResetNetwork();Check(!SetDownloadTimeouts(reinterpret_cast<HINTERNET>(1),stop,0),"expired deadline stops reads");
    CloseHandle(stop);
}
static void TestResolver() {
    Reset();PutCache();Check(ResolveBySignature(fakeModule),"offline compatibility cache installs existing native path");
    Check(hookCalls==2&&openCalls==0,"cache path does no HTTP work");
    Reset();Check(!ResolveBySignature(fakeModule)&&s_recoveryModule==fakeModule,"unknown signature queues exact module for recovery");
    StartCompatibilityDownloadLocked();Check(!s_downloadThread&&openCalls==0,"no download during ModInit or loader initialization");
    s_afterInit=true;StartCompatibilityDownloadLocked();
    Check(s_downloadThread&&WaitForSingleObject(s_downloadThread,5000)==WAIT_OBJECT_0,"background download completes");
    Check(storage.count(L"compatibilityMapV1")==1&&hookCalls==0,"worker caches data without changing live hooks");
    Check(pinCalls==1&&freeCalls==1,"worker owns and releases module reference");
    StartCompatibilityDownloadLocked();Check(openCalls==1,"at most one recovery attempt per browser process");
    Wh_ModBeforeUninit();Wh_ModUninit();
    s_stopping=false;Check(ResolveBySignature(fakeModule)&&hookCalls==2,"next launch can use saved recovery offline");
    // Existing local signatures still work and retain their fast cache path.
    Reset();auto* base=reinterpret_cast<unsigned char*>(fakeModule);
    std::vector<unsigned char> backup(base+0x1000,base+0x1400);
    const unsigned char* signatures[]={kSigGetColor,kSigOnPaintBackground,kSigDrawColor};
    size_t lengths[]={sizeof(kSigGetColor),sizeof(kSigOnPaintBackground),sizeof(kSigDrawColor)};
    auto* table=reinterpret_cast<RUNTIME_FUNCTION*>(base+0x2000);
    for(int i=0;i<3;i++){memcpy(base+0x1000+i*0x100,signatures[i],lengths[i]);table[i].EndAddress=0x1000+i*0x100+128;}
    Check(ResolveBySignature(fakeModule)&&storage.count(L"signatureCache"),"existing signature scan remains functional");
    Check(ResolveBySignature(fakeModule)&&openCalls==0,"warm signature cache never requests online data");
    memcpy(base+0x1000,backup.data(),backup.size());for(int i=0;i<3;i++)table[i].EndAddress=0x1000+i*0x100+64;
}
static void TestShutdown() {
    for(bool disableSetting:{false,true}) {
        Reset();s_afterInit=true;s_recoveryModule=fakeModule;s_recoveryToolbarRow=toolbarRow;
        blockSend=true;StartCompatibilityDownloadLocked();
        {std::unique_lock lock(networkMutex);Check(networkCv.wait_for(lock,std::chrono::seconds(3),[]{return inSend.load();}),"worker entered blocking HTTP stage");}
        if(disableSetting){settingEnabled=false;Wh_ModSettingsChanged();}
        std::atomic<bool> stopped{false};std::thread stop([&]{Wh_ModBeforeUninit();stopped=true;});
        for(int i=0;i<100&&WaitForSingleObject(s_downloadStop,0)!=WAIT_OBJECT_0;i++)Sleep(1);
        Check(WaitForSingleObject(s_downloadStop,0)==WAIT_OBJECT_0,"shutdown requests cancellation");
        {std::lock_guard lock(networkMutex);releaseSend=true;}networkCv.notify_all();stop.join();
        Check(stopped&&closeRaces==0,"unload waits for HTTP owner instead of closing another thread's handle");
        Check(storage.count(L"compatibilityMapV1")==0,"cancelled or disabled worker never saves data");
        Wh_ModUninit();Check(!s_downloadThread&&!s_downloadStop,"worker handles are released");
    }
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
    const char* names[]={"kColorBefore","kColorToolbar","kColorAfter"};
    for(int i=0;i<3;i++) {
        unsigned long long id=17+i,ptr=reinterpret_cast<ULONG_PTR>(base+0x3300+i*32);
        memcpy(base+0x3200+i*16,&id,8);memcpy(base+0x3208+i*16,&ptr,8);strcpy(reinterpret_cast<char*>(base+0x3300+i*32),names[i]);
    }
    TestValidation();TestHttp();TestResolver();TestShutdown();Reset();
    if(argc==5) {
        HMODULE actual=LoadLibraryExW(argv[3],nullptr,DONT_RESOLVE_DLL_REFERENCES);
        auto bytes=ReadFile(argv[4]);CompatibilityMap real{};size_t rva[3]{};
        Check(actual&&bytes.size()==sizeof(real),"map real Brave DLL without executing it");
        if(actual&&bytes.size()==sizeof(real)) {
            memcpy(&real,bytes.data(),sizeof(real));Check(ValidateCompatibilityMap(actual,real,rva),"validate official PDB-derived data against the loaded real DLL");
            real.functions[2].code[0]^=1;Check(!ValidateCompatibilityMap(actual,real,rva),"reject altered real-build fingerprint");
        }
        if(actual)FreeLibrary(actual);
    }
    VirtualFree(base,0,MEM_RELEASE);printf("%d checks, %d failures\n",checks,failures);return failures?1:0;
}
