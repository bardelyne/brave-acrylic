#define NOMINMAX
#include "../brave-acrylic.wh.cpp"
#include <map>
#include <cstdio>
using Value = winrt::Windows::Data::Json::JsonValue;
static unsigned checks=0;
static std::map<std::wstring,std::vector<unsigned char>> storage;
static void Check(bool ok,const char* label){if(!ok){std::fprintf(stderr,"FAIL: %s\n",label);std::exit(1);}++checks;}
void TestLog(PCWSTR,...){}
PCWSTR Wh_GetStringSetting(PCWSTR,...){return L"";}
void Wh_FreeStringSetting(PCWSTR){}
int Wh_GetIntSetting(PCWSTR){return 0;}
size_t Wh_GetBinaryValue(PCWSTR key,void* out,size_t maximum){auto i=storage.find(key);if(i==storage.end()||i->second.size()>maximum)return 0;memcpy(out,i->second.data(),i->second.size());return i->second.size();}
BOOL Wh_SetBinaryValue(PCWSTR key,const void* data,size_t size){auto p=static_cast<const unsigned char*>(data);storage[key]={p,p+size};return TRUE;}
BOOL Wh_SetFunctionHook(void*,void*,void**){return FALSE;}
BOOL Wh_ApplyHookOperations(){return FALSE;}
bool WindhawkUtils::HookSymbols(HMODULE,const SYMBOL_HOOK*,size_t,const WH_HOOK_SYMBOLS_OPTIONS*){return false;}
static void Text(PipelineTrust::Json json,const wchar_t* key,const std::wstring& value){json.SetNamedValue(key,Value::CreateStringValue(value));}
static void Number(PipelineTrust::Json json,const wchar_t* key,double value){json.SetNamedValue(key,Value::CreateNumberValue(value));}
int wmain(int argc,wchar_t** argv){
    setvbuf(stdout,nullptr,_IONBF,0);
    struct Apartment{HRESULT result=RoInitialize(RO_INIT_MULTITHREADED);~Apartment(){if(SUCCEEDED(result))RoUninitialize();}} apartment;
    Check(SUCCEEDED(apartment.result),"initialize the metadata parser on an MTA");
    if(argc==3 && !wcscmp(argv[1],L"--live")){
        auto module=LoadLibraryExW(argv[2],nullptr,DONT_RESOLVE_DLL_REFERENCES);
        Check(module!=nullptr,"map installed chrome.dll without executing it");
        BuildIdentity id{};Check(GetBuildIdentity(module,&id),"read the installed exact-build identity");
        std::string cache;
        Check(PipelineTrust::Load(id,true,&cache),"anonymous HTTPS verifies the actual GitHub artifact, run and approved workflow");
        std::array<size_t,kFunctionSlots> entries{},normalized{};
        Check(PipelineTrust::ParseCache(cache,id,entries.data()),"verified text has all thirteen exact names and installed PE identity");
        void* addresses[kFunctionSlots]{};
        for(size_t i=0;i<entries.size();++i)addresses[i]=reinterpret_cast<unsigned char*>(module)+entries[i];
        Check(ValidateSymbolAddresses(module,addresses,normalized.data()),"all real function boundaries, leaves and thunks pass local validation");
        std::string offline;Check(PipelineTrust::Load(id,false,&offline)&&offline==cache,"verified build works offline without more API calls");
        std::printf("PASS: real published pipeline proof; %zu bytes; 13 native functions; no hooks installed\n",cache.size());
        FreeLibrary(module);return 0;
    }
    const std::string cache="fixture bytes";
    const auto file=_wfopen(L".github/workflows/compatibility.yml",L"rb");
    Check(file!=nullptr,"read approved workflow fixture");
    std::string yaml;char block[4096];size_t got=0;while((got=fread(block,1,sizeof(block),file)))yaml.append(block,got);fclose(file);
    // Git stores the approved YAML with LF; Windows checkouts can use CRLF.
    for(size_t i=0;(i=yaml.find("\r\n",i))!=std::string::npos;)yaml.erase(i,1);
    Check(PipelineTrust::HashText(yaml)==PipelineTrust::kWorkflowSha256,"compiled policy pins the real workflow bytes");
    DWORD encodedLength=0;
    Check(CryptBinaryToStringW(reinterpret_cast<const BYTE*>(yaml.data()),yaml.size(),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,nullptr,&encodedLength),"size workflow encoding");
    std::wstring encoded(encodedLength,L'\0');
    Check(CryptBinaryToStringW(reinterpret_cast<const BYTE*>(yaml.data()),yaml.size(),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,encoded.data(),&encodedLength),"encode workflow fixture");
    encoded.resize(encodedLength);
    PipelineTrust::Json artifact,run,workflow,jobs;
    const std::wstring revision(40,L'a');
    const std::wstring pdbKey=std::wstring(32,L'A')+L"1";
    auto reset=[&]{
        PipelineTrust::stopping=false;
        artifact=PipelineTrust::Parse(R"({"id":123,"name":"cache.txt","size_in_bytes":13,"workflow_run":{"id":456,"head_branch":"main","repository_id":1428612836,"head_repository_id":1428612836}})");
        Text(artifact,L"digest",L"sha256:"+PipelineTrust::HashText(cache));Text(artifact.GetNamedObject(L"workflow_run"),L"head_sha",revision);
        Text(artifact,L"name",L"pdb_"+pdbKey+L".txt");
        run=PipelineTrust::Parse(R"({"id":456,"workflow_id":394997888,"path":".github/workflows/compatibility.yml","event":"schedule","status":"completed","conclusion":"success","head_branch":"main","repository":{"id":1428612836},"head_repository":{"id":1428612836}})");
        Text(run,L"head_sha",revision);
        workflow=PipelineTrust::Parse(R"({"type":"file","path":".github/workflows/compatibility.yml","encoding":"base64"})");
        Text(workflow,L"sha",PipelineTrust::kWorkflowBlob);
        Text(workflow,L"content",encoded);
        jobs=PipelineTrust::Parse(R"({"total_count":2,"jobs":[{"name":"generate","conclusion":"success","runner_id":123,"runner_group_id":0,"runner_group_name":"GitHub Actions","runner_name":"GitHub Actions 123"},{"name":"publish","conclusion":"success","runner_id":124,"runner_group_id":0,"runner_group_name":"GitHub Actions","runner_name":"GitHub Actions 124"}]})");
    };
    unsigned requests=0;
    PipelineTrust::Getter get=[&](const wchar_t* host,const std::wstring& path,size_t maximum){
        ++requests;Check(!wcscmp(host,L"api.github.com"),"proof verification only queries the fixed GitHub API host");
        std::string bytes;
        if(path==L"/repos/bardelyne/brave-acrylic/actions/artifacts/123")bytes=winrt::to_string(artifact.Stringify());
        else if(path==L"/repos/bardelyne/brave-acrylic/actions/runs/456")bytes=winrt::to_string(run.Stringify());
        else if(path==L"/repos/bardelyne/brave-acrylic/actions/runs/456/jobs?filter=all&per_page=100")bytes=winrt::to_string(jobs.Stringify());
        else if(path==L"/repos/bardelyne/brave-acrylic/contents/.github/workflows/compatibility.yml?ref="+revision)bytes=winrt::to_string(workflow.Stringify());
        else throw std::runtime_error("unexpected route");
        Check(bytes.size()<=maximum,"proof responses stay within their per-route bound");return bytes;
    };
    auto verify=[&](std::string data="fixture bytes",std::string locator=R"({"schema":1,"artifactId":123})"){return PipelineTrust::Verify(data,locator,pdbKey,get);};
    reset();Check(verify(),"approve exact bytes from the expected successful pipeline");
    Check(requests==4,"four anonymous metadata lookups authenticate a new build and all runner attempts");
    Check(!verify("different bytes"),"a replaced branch payload cannot reuse a legitimate artifact locator");
    Check(!PipelineTrust::Verify(cache,R"({"schema":1,"artifactId":123})",std::wstring(32,L'B')+L"1",get),"a valid artifact from another PDB build is rejected");
    for(const auto locator:{R"({"schema":2,"artifactId":123})",R"({"schema":1,"artifactId":-1})",R"({"schema":1,"artifactId":1.5})",R"({"schema":1,"artifactId":"123"})",R"({"schema":1,"artifactId":9007199254740992})","garbage"})
        Check(!verify(cache,locator),"malformed locators do not authorize a payload");
    const std::vector<std::function<void()>> bad={
        [&]{Number(artifact,L"id",124);},[&]{Text(artifact,L"digest",L"sha256:"+std::wstring(64,L'b'));},
        [&]{Number(artifact,L"size_in_bytes",14);},[&]{Text(artifact,L"name",L"other.txt");},
        [&]{Number(artifact.GetNamedObject(L"workflow_run"),L"id",457);},
        [&]{Number(artifact.GetNamedObject(L"workflow_run"),L"repository_id",1);},
        [&]{Number(artifact.GetNamedObject(L"workflow_run"),L"head_repository_id",1);},
        [&]{Text(artifact.GetNamedObject(L"workflow_run"),L"head_branch",L"other");},
        [&]{Text(artifact.GetNamedObject(L"workflow_run"),L"head_sha",std::wstring(40,L'b'));},
        [&]{Number(run,L"id",457);},[&]{Number(run,L"workflow_id",1);},
        [&]{Number(run.GetNamedObject(L"repository"),L"id",1);},
        [&]{Number(run.GetNamedObject(L"head_repository"),L"id",1);},
        [&]{Text(run,L"head_branch",L"other");},[&]{Text(run,L"head_sha",std::wstring(40,L'b'));},
        [&]{Text(run,L"status",L"in_progress");},[&]{Text(run,L"conclusion",L"failure");},
        [&]{Text(run,L"path",L".github/workflows/untrusted.yml");},
        [&]{Text(run,L"event",L"pull_request");},[&]{Text(run,L"event",L"workflow_run");},
        [&]{Text(workflow,L"sha",std::wstring(40,L'b'));},
        [&]{Text(workflow,L"type",L"dir");},[&]{Text(workflow,L"path",L"tools/other.yml");}
        ,[&]{Number(jobs,L"total_count",101);}
        ,[&]{Number(jobs.GetNamedArray(L"jobs").GetAt(0).GetObject(),L"runner_group_id",1);}
        ,[&]{Text(jobs.GetNamedArray(L"jobs").GetAt(0).GetObject(),L"runner_group_name",L"self-hosted");}
        ,[&]{Text(jobs.GetNamedArray(L"jobs").GetAt(0).GetObject(),L"conclusion",L"failure");}
        ,[&]{Text(jobs.GetNamedArray(L"jobs").GetAt(0).GetObject(),L"name",L"untrusted-job");}
        ,[&]{auto previous=jobs.GetNamedArray(L"jobs").GetAt(0).GetObject();Number(previous,L"runner_group_id",1);jobs.GetNamedArray(L"jobs").Append(previous);Number(jobs,L"total_count",3);}
        ,[&]{Text(workflow,L"content",L"bm90IHRoZSBhcHByb3ZlZCB3b3JrZmxvdw==");}
        ,[&]{Text(workflow,L"content",L"%%%invalid%%%");}
        ,[&]{Text(workflow,L"encoding",L"none");}
    };
    for(const auto& mutate:bad){reset();mutate();Check(!verify(),"changed source/run/repository/workflow evidence is rejected");}
    for(const auto* event:{L"push",L"workflow_dispatch"}){reset();Text(run,L"event",event);Check(verify(),"approved workflow may run on push or manual backfill too");}
    reset();const auto before=requests;PipelineTrust::stopping=true;
    Check(!verify()&&requests==before,"shutdown prevents new verification requests");PipelineTrust::stopping=false;
    Check(!PipelineTrust::Verify(cache,R"({"schema":1,"artifactId":123})",pdbKey,[](auto,const auto&,size_t)->std::string{throw std::runtime_error("network unavailable");}),"missing or rate-limited metadata fails closed");
    BuildIdentity id{};id.guid.Data1=0x12345678;id.age=1;id.machine=0x8664;id.timestamp=123;id.imageSize=0x10000;
    std::string named="1#chrome.dll#x86-64_123_65536";
    for(size_t i=0;i<kFunctionSlots;++i)named+="#"+std::string(PipelineTrust::kSymbols[i])+"#"+std::to_string(1000+i*64);
    std::array<size_t,kFunctionSlots> entries{};
    Check(PipelineTrust::ParseCache(named,id,entries.data())&&entries[12]==1768,"trusted cache parses exact names and raw entry addresses");
    const std::vector<std::function<void(std::string&)>> corrupt={
        [](auto& s){s[0]='2';},[](auto& s){s.replace(s.find("chrome.dll"),10,"other.dll");},
        [](auto& s){s.replace(s.find("x86-64_123"),10,"x86-64_124");},
        [](auto& s){s.replace(s.find("1000"),4,"01000");},[](auto& s){s.replace(s.find("1000"),4,"-1000");},
        [](auto& s){s.replace(s.find("1000"),4,"4294967296");},[](auto& s){s.replace(s.find("1064"),4,"1000");},
        [](auto& s){s+="#extra#1";},[](auto& s){s.pop_back();s.pop_back();s.pop_back();s.pop_back();},
        [](auto& s){s+="\n";},[](auto& s){s[40]=char(255);}
    };
    for(const auto& mutate:corrupt){auto changed=named;mutate(changed);entries.fill(0xdeadbeef);
        Check(!PipelineTrust::ParseCache(changed,id,entries.data()),"malformed names, identities, aliases and RVAs are rejected");
        Check(std::all_of(entries.begin(),entries.end(),[](auto v){return v==0xdeadbeef;}),"bad payload publishes no partial addresses");}
    std::string local;
    Check(!PipelineTrust::Load(id,false,&local),"offline mode does not trust an old unproven cache");
    PipelineTrust::SaveLocal(id,named);
    Check(PipelineTrust::Load(id,false,&local)&&local==named,"previously verified data remains available offline");
    storage[PipelineTrust::StorageKey(id)].back()^=1;
    Check(!PipelineTrust::ReadLocal(id,&local),"stored data corruption is detected");
    PipelineTrust::SaveLocal(id,named);id.age++;
    Check(!PipelineTrust::ReadLocal(id,&local),"another PDB build cannot borrow a verified cache entry");
    std::printf("PASS: %u trusted pipeline metadata, tamper, parser and offline checks\n",checks);
    return 0;
}
