// Optional read-only check of a real DLL against a research-generated cache.
// Reuse the test-only Windhawk storage/hooks stubs, never the real engine.
#define wmain ExistingPipelineFixtureMain
#include "pipeline-trust.cpp"
#undef wmain
int wmain(int argc, wchar_t** argv) {
    Check(argc == 3, "DLL and candidate cache paths are required");
    const auto module = LoadLibraryExW(argv[1], nullptr, DONT_RESOLVE_DLL_REFERENCES);
    Check(module != nullptr, "map the actual installed DLL without execution");
    BuildIdentity identity{};
    Check(GetBuildIdentity(module, &identity), "read actual DLL identity");
    const auto file = _wfopen(argv[2], L"rb"); Check(file != nullptr, "read candidate cache");
    std::string cache; char bytes[4096]; size_t n;
    while ((n = fread(bytes, 1, sizeof(bytes), file))) cache.append(bytes, n);
    fclose(file);
    std::array<size_t,kFunctionSlots> raw{}, normalized{};
    Check(PipelineTrust::ParseCache(cache, identity, raw.data()), "candidate has all exact names and the live PE identity");
    void* addresses[kFunctionSlots]{};
    for (size_t i=0;i<raw.size();++i) addresses[i]=reinterpret_cast<unsigned char*>(module)+raw[i];
    Check(ValidateSymbolAddresses(module, addresses, normalized.data()), "all thirteen live native boundaries, leaves and thunks pass");
    std::printf("PASS: actual DLL %ls; all 13 native functions; no browser code executed; no hooks\n", PipelineTrust::BuildKey(identity).c_str());
    FreeLibrary(module); return 0;
}
