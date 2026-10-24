// Optional end-to-end check against the fixed public data endpoint. No hooks are
// installed and the mapped browser DLL's initialization code is not executed.
#define NOMINMAX
#include <windows.h>
#include <cstdio>
#include <cstdarg>
#include <windhawk_api.h>
#include "../brave-acrylic.wh.cpp"
void TestLog(PCWSTR message, ...) {
    va_list args;va_start(args,message);vwprintf(message,args);wprintf(L"\n");va_end(args);
}
PCWSTR Wh_GetStringSetting(PCWSTR, ...) {return new wchar_t[1]{};}
void Wh_FreeStringSetting(PCWSTR value) {delete[] value;}
int Wh_GetIntSetting(PCWSTR) {return 1;}
size_t Wh_GetBinaryValue(PCWSTR,void*,size_t) {return 0;}
BOOL Wh_SetBinaryValue(PCWSTR,const void*,size_t) {return FALSE;}
BOOL Wh_SetFunctionHook(void*,void*,void**) {return FALSE;}
BOOL Wh_ApplyHookOperations() {return FALSE;}
int wmain(int argc,wchar_t** argv) {
    if(argc!=2)return 2;
    HMODULE module=LoadLibraryExW(argv[1],nullptr,DONT_RESOLVE_DLL_REFERENCES);
    if(!module){printf("Could not map DLL: %lu\n",GetLastError());return 3;}
    BuildIdentity id{};CompatibilityMap map{};size_t rva[3]{};
    HANDLE stop=CreateEventW(nullptr,TRUE,FALSE,nullptr);
    const DWORD started=GetTickCount();
    const bool fetched=GetBuildIdentity(module,&id)&&FetchCompatibilityMap(id,stop,&map);
    const bool valid=fetched&&ValidateCompatibilityMap(module,map,rva);
    printf("Fetched=%d validated=%d size=%zu elapsedMs=%lu error=%lu\n",fetched,valid,sizeof(map),GetTickCount()-started,GetLastError());
    CloseHandle(stop);FreeLibrary(module);return valid?0:1;
}
