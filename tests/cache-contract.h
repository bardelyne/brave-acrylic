#pragma once
// Test-only cache decoders and historical ABI fixtures. Not shipped in the mod.
static constexpr unsigned kFunctionSlots = 13;

// Local validation description for the thirteen resolved native functions.
// No build-specific address table is embedded or loaded from a binary map.
struct FunctionFingerprint {
    DWORD rva, length, kind, reserved;
    unsigned char code[32], mask[32];
};
struct CompatibilityMap {
    DWORD magic, format;
    GUID guid;
    DWORD age, machine, timestamp, imageSize;
    FunctionFingerprint functions[kFunctionSlots];
};
static_assert(sizeof(FunctionFingerprint) == 80);
static_assert(sizeof(CompatibilityMap) == 1080);
struct BuildIdentity { GUID guid; DWORD age, machine, timestamp, imageSize; };

static bool GetBuildIdentity(HMODULE module, BuildIdentity* identity) {
    ReadOnlyImage image{};
    if (!GetReadOnlyImage(module, &image)) return false;
    const auto* dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(image.base);
    const auto* nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(image.base + dos->e_lfanew);
    if (nt->FileHeader.Machine != IMAGE_FILE_MACHINE_AMD64 ||
        nt->OptionalHeader.NumberOfRvaAndSizes <= IMAGE_DIRECTORY_ENTRY_DEBUG) return false;
    const auto& dir = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_DEBUG];
    if (!dir.Size || dir.Size % sizeof(IMAGE_DEBUG_DIRECTORY) ||
        !image.Contains(dir.VirtualAddress, dir.Size)) return false;
    bool found = false;
    BuildIdentity result{};
    for (size_t p = 0; p < dir.Size; p += sizeof(IMAGE_DEBUG_DIRECTORY)) {
        IMAGE_DEBUG_DIRECTORY debug{};
        memcpy(&debug, image.base + dir.VirtualAddress + p, sizeof(debug));
        if (debug.Type != IMAGE_DEBUG_TYPE_CODEVIEW) continue;
        if (debug.SizeOfData < 24 || debug.SizeOfData > 4096 ||
            !image.Contains(debug.AddressOfRawData, debug.SizeOfData)) return false;
        const auto* cv = image.base + debug.AddressOfRawData;
        if (memcmp(cv, "RSDS", 4)) continue;
        const char* name = reinterpret_cast<const char*>(cv + 24);
        const char* end = static_cast<const char*>(memchr(name, 0, debug.SizeOfData - 24));
        if (!end) return false;
        const char* leaf = name;
        for (const char* at = name; at < end; ++at) if (*at == '\\' || *at == '/') leaf = at + 1;
        if (strcmp(leaf, "chrome.dll.pdb")) return false;
        BuildIdentity candidate{};
        memcpy(&candidate.guid, cv + 4, sizeof(GUID));
        memcpy(&candidate.age, cv + 20, sizeof(DWORD));
        const GUID empty{};
        if (!candidate.age || !memcmp(&candidate.guid, &empty, sizeof(GUID))) return false;
        if (found && (memcmp(&candidate.guid, &result.guid, sizeof(GUID)) ||
                      candidate.age != result.age)) return false;
        result = candidate;
        found = true;
    }
    if (!found) return false;
    result.machine = nt->FileHeader.Machine;
    result.timestamp = nt->FileHeader.TimeDateStamp;
    result.imageSize = nt->OptionalHeader.SizeOfImage;
    *identity = result;
    return true;
}

static bool ValidateCompatibilityMap(HMODULE module, const CompatibilityMap& map, size_t* rva) {
    BuildIdentity id{};
    if (map.magic != 0x504D4142 || map.format != 6 || !GetBuildIdentity(module, &id) ||
        memcmp(&map.guid, &id.guid, sizeof(GUID)) || map.age != id.age ||
        map.machine != id.machine || map.timestamp != id.timestamp ||
        map.imageSize != id.imageSize) return false;
    ReadOnlyImage image{};
    if (!GetReadOnlyImage(module, &image)) return false;
    const IMAGE_SECTION_HEADER* text = nullptr;
    for (unsigned i = 0; i < image.count; ++i) {
        const auto& section = image.sections[i];
        if (!memcmp(section.Name, ".text\0\0\0", 8) &&
            (section.Characteristics & IMAGE_SCN_MEM_EXECUTE)) {
            if (text) return false;
            text = &section;
        }
    }
    if (!text || text->VirtualAddress > image.size ||
        text->Misc.VirtualSize > image.size - text->VirtualAddress) return false;
    for (unsigned i = 0; i < kFunctionSlots; ++i) {
        const auto& f = map.functions[i];
        const DWORD sourceLength = f.kind == 3 ? 5 : f.length;
        if (!f.rva || (f.kind != 3 && f.reserved) || f.kind > 3 || f.length > 32 ||
            f.rva < text->VirtualAddress ||
            f.rva - text->VirtualAddress > text->Misc.VirtualSize ||
            sourceLength > text->Misc.VirtualSize - (f.rva - text->VirtualAddress)) return false;
        const DWORD target = f.kind == 3 ? f.reserved : f.rva;
        if (target < text->VirtualAddress ||
            target - text->VirtualAddress > text->Misc.VirtualSize ||
            f.length > text->Misc.VirtualSize - (target - text->VirtualAddress)) return false;
        const unsigned char hostPrefix[] = {0x48, 0x83, 0xB9};
        const unsigned char hostSuffix[] = {0, 0x74, 3, 0x31, 0xC0, 0xC3};
        const bool shortHost = i == 3 && f.length == 13 && (f.kind == 1 || f.kind == 3);
        const bool shortFocus = i == 6 && f.length == 32 &&
            (f.kind == 2 || (f.kind == 3 && FocusLeafLayout(f.code)));
        if (f.kind == 0 || f.kind == 3) {
            if (shortHost) {
                if (memcmp(f.code, hostPrefix, 3) || memcmp(f.code + 7, hostSuffix, 6) ||
                    !LeafOutsideUnwind(module, target, f.length)) return false;
            } else if (shortFocus) {
                if (!FunctionContains(module, target, f.length) &&
                    !LeafOutsideUnwind(module, target, f.length)) return false;
            } else if (f.length < 16 || !FunctionContains(module, target, f.length)) {
                return false;
            }
            if (f.kind == 3) {
                if (f.rva - text->VirtualAddress > text->Misc.VirtualSize - 5 ||
                    image.base[f.rva] != 0xE9 || !LeafOutsideUnwind(module, f.rva, 5)) return false;
                int displacement;
                memcpy(&displacement, image.base + f.rva + 1, sizeof(displacement));
                if (int64_t(f.rva) + 5 + displacement != target) return false;
            }
        } else if (f.kind == 1) {
            if (!shortHost || memcmp(f.code, hostPrefix, 3) ||
                memcmp(f.code + 7, hostSuffix, 6) ||
                !LeafOutsideUnwind(module, target, f.length)) return false;
        } else if (!shortFocus || !FocusLeafLayout(f.code) ||
                   !LeafOutsideUnwind(module, target, f.length)) {
            return false;
        }
        unsigned fixed = 0;
        for (unsigned j = 0; j < 32; ++j) {
            if (f.mask[j] != 0 && f.mask[j] != 0xFF) return false;
            if (j >= f.length) {
                if (f.mask[j] || f.code[j]) return false;
            } else if (f.mask[j]) {
                if (image.base[target + j] != f.code[j]) return false;
                ++fixed;
            }
        }
        if (fixed < (shortHost ? 13u : shortFocus ? 32u : 16u)) return false;
        // A named jump stub and its body are separate protected ranges.
        // Reject overlap with either range, including the stub's own body.
        auto overlaps = [](DWORD a, DWORD n, DWORD b, DWORD m) {
            return uint64_t(a) < uint64_t(b) + m && uint64_t(b) < uint64_t(a) + n;
        };
        if (f.kind == 3 && overlaps(f.rva, 5, target, f.length)) return false;
        for (unsigned j = 0; j < i; ++j) {
            const auto& other = map.functions[j];
            if (!other.rva) continue;
            const DWORD otherTarget = other.kind == 3 ? other.reserved : other.rva;
            if (overlaps(target, f.length, otherTarget, other.length) ||
                (f.kind == 3 && overlaps(f.rva, 5, otherTarget, other.length)) ||
                (other.kind == 3 && overlaps(target, f.length, other.rva, 5)) ||
                (f.kind == 3 && other.kind == 3 && overlaps(f.rva, 5, other.rva, 5))) return false;
        }
    }
    // Never publish a partial address set on a rejected map.
    for (unsigned i = 0; i < kFunctionSlots; ++i) {
        rva[i] = map.functions[i].kind == 3 ? map.functions[i].reserved : map.functions[i].rva;
    }
    return true;
}
static bool ValidateSymbolAddresses(HMODULE module, void* const* addresses, size_t* rva) {
    BuildIdentity id{};
    ReadOnlyImage image{};
    if (!GetBuildIdentity(module, &id) || !GetReadOnlyImage(module, &image)) return false;
    const IMAGE_SECTION_HEADER* text = nullptr;
    for (unsigned i = 0; i < image.count; ++i) {
        const auto& section = image.sections[i];
        if (!memcmp(section.Name, ".text\0\0\0", 8) &&
            (section.Characteristics & IMAGE_SCN_MEM_EXECUTE)) {
            if (text) return false;
            text = &section;
        }
    }
    if (!text || text->VirtualAddress > image.size ||
        text->Misc.VirtualSize > image.size - text->VirtualAddress) return false;
    const auto inText = [&](size_t start, size_t length) {
        return start >= text->VirtualAddress &&
            start - text->VirtualAddress <= text->Misc.VirtualSize &&
            length <= text->Misc.VirtualSize - (start - text->VirtualAddress);
    };
    CompatibilityMap local{};
    local.magic = 0x504D4142;
    local.format = 6;
    local.guid = id.guid;
    local.age = id.age;
    local.machine = id.machine;
    local.timestamp = id.timestamp;
    local.imageSize = id.imageSize;
    for (unsigned i = 0; i < kFunctionSlots; ++i) {
        const auto pointer = reinterpret_cast<uintptr_t>(addresses[i]);
        const auto base = reinterpret_cast<uintptr_t>(module);
        if (pointer < base || pointer - base >= image.size) return false;
        const size_t entry = pointer - base;
        if (!inText(entry, 5)) return false;
        size_t target = entry;
        bool thunk = false;
        if (!FunctionContains(module, entry, 1) && image.base[entry] == 0xE9) {
            int displacement;
            memcpy(&displacement, image.base + entry + 1, sizeof(displacement));
            const int64_t destination = int64_t(entry) + 5 + displacement;
            if (destination < 0 || uint64_t(destination) >= image.size) return false;
            target = static_cast<size_t>(destination);
            thunk = true;
        }
        if (!inText(target, 32)) return false;
        auto& f = local.functions[i];
        f.rva = static_cast<DWORD>(entry);
        f.length = 32;
        f.kind = 0;
        if (!FunctionContains(module, target, 32)) {
            if (i == 3) {
                f.kind = 1;
                f.length = 13;
            } else if (i == 6 && FocusLeafLayout(image.base + target)) {
                f.kind = 2;
            } else {
                return false;
            }
        }
        if (thunk) {
            f.kind = 3;
            f.reserved = static_cast<DWORD>(target);
        }
        memcpy(f.code, image.base + target, f.length);
        memset(f.mask, 0xFF, f.length);
    }
    // Bounds, exact unwind entries, approved leaf shapes, direct E9 thunks,
    // and disjoint entry/body ranges are independent local safety checks.
    // These structural checks do not authenticate the author-hosted cache.
    return ValidateCompatibilityMap(module, local, rva);
}

// Standard named-cache parsing is retained for offline contract tests. Runtime
// fetching and local symbol caching belong to Windhawk's HookSymbols mechanism.
namespace SymbolCache {
static constexpr size_t kMaxCache=16384;
static constexpr const char* kSymbols[] = {
    "protected: virtual void __cdecl views::View::OnPaintBackground(class gfx::Canvas *)",
    "public: void __cdecl gfx::Canvas::DrawColor(unsigned int,enum SkBlendMode)",
    "public: class std::__Cr::basic_string_view<char,struct std::__Cr::char_traits<char> > __cdecl views::View::GetClassNameW(void)const",
    "private: virtual bool __cdecl BrowserDesktopWindowTreeHostWin_ChromiumImpl::ShouldWindowContentsBeTransparent(void)const",
    "public: __cdecl BraveVerticalTabStripContainerView::BraveVerticalTabStripContainerView(class BrowserView *,class views::View *)",
    "public: void __cdecl views::View::SetBackground(class std::__Cr::unique_ptr<class views::Background,struct std::__Cr::default_delete<class views::Background> >)",
    "public: virtual bool __cdecl LocationBarView::HasFocus(void)const",
    "public: virtual bool __cdecl views::View::HasFocus(void)const",
    "public: virtual void __cdecl ContentsWebView::OnThemeChanged(void)",
    "public: virtual void __cdecl ContentsWebView::RenderViewReady(void)",
    "public: virtual void __cdecl ui::LayerAnimator::SetColor(struct SkRGBA4f<3>)",
    "public: virtual void __cdecl content::WebContentsImpl::SetPageBaseBackgroundColor(class std::__Cr::optional<unsigned int>)",
    "public: virtual void __cdecl ContentsWebView::SetWebContents(class content::WebContents *)",
};
static_assert(ARRAYSIZE(kSymbols) == kFunctionSlots);
static bool ParseCache(const std::string& bytes, const BuildIdentity& id, size_t* result) {
    constexpr size_t count = kFunctionSlots;
    if (count != kFunctionSlots || bytes.empty() || bytes.size() > kMaxCache ||
        !std::all_of(bytes.begin(), bytes.end(),
                     [](unsigned char c) { return c >= 32 && c <= 126; }))
        return false;
    std::vector<std::string_view> fields;
    size_t begin = 0;
    for (size_t i = 0; i <= bytes.size(); ++i)
        if (i == bytes.size() || bytes[i] == '#') {
            fields.emplace_back(bytes.data() + begin, i - begin);
            begin = i + 1;
        }
    const auto identity =
        "x86-64_" + std::to_string(id.timestamp) + "_" + std::to_string(id.imageSize);
    if (fields.size() != 3 + count * 2 || fields[0] != "1" || fields[1] != "chrome.dll" ||
        fields[2] != identity)
        return false;
    std::array<size_t, kFunctionSlots> entries{};
    for (size_t i = 0; i < count; ++i) {
        const auto name = fields[3 + i * 2], number = fields[4 + i * 2];
        if (name != kSymbols[i] || number.empty() || number.size() > 10 || number.front() == '0')
            return false;
        uint64_t value = 0;
        for (const auto c : number) {
            if (c < '0' || c > '9')
                return false;
            value = value * 10 + c - '0';
        }
        if (!value || value >= id.imageSize ||
            std::find(entries.begin(), entries.begin() + i, value) != entries.begin() + i)
            return false;
        entries[i] = static_cast<size_t>(value);
    }
    std::copy(entries.begin(), entries.end(), result);
    return true;
}
}  // namespace SymbolCache



static bool ResolveSymbolAddresses(HMODULE module, size_t* rva) {
    void* addresses[kFunctionSlots]{};
    // chrome.dll
    WindhawkUtils::SYMBOL_HOOK chromeHooks[] = {
        {{L"protected: virtual void __cdecl views::View::OnPaintBackground(class gfx::Canvas *)"},
         &addresses[0]},
        {{L"public: void __cdecl gfx::Canvas::DrawColor(unsigned int,enum SkBlendMode)"},
         &addresses[1]},
        {{L"public: class std::__Cr::basic_string_view<char,struct std::__Cr::char_traits<char> > __cdecl views::View::GetClassNameW(void)const"},
         &addresses[2]},
        {{L"private: virtual bool __cdecl BrowserDesktopWindowTreeHostWin_ChromiumImpl::ShouldWindowContentsBeTransparent(void)const"},
         &addresses[3]},
        {{L"public: __cdecl BraveVerticalTabStripContainerView::BraveVerticalTabStripContainerView(class BrowserView *,class views::View *)"},
         &addresses[4]},
        {{L"public: void __cdecl views::View::SetBackground(class std::__Cr::unique_ptr<class views::Background,struct std::__Cr::default_delete<class views::Background> >)"},
         &addresses[5]},
        {{L"public: virtual bool __cdecl LocationBarView::HasFocus(void)const"}, &addresses[6]},
        {{L"public: virtual bool __cdecl views::View::HasFocus(void)const"}, &addresses[7]},
        {{L"public: virtual void __cdecl ContentsWebView::OnThemeChanged(void)"}, &addresses[8]},
        {{L"public: virtual void __cdecl ContentsWebView::RenderViewReady(void)"}, &addresses[9]},
        {{L"public: virtual void __cdecl ui::LayerAnimator::SetColor(struct SkRGBA4f<3>)"},
         &addresses[10]},
        {{L"public: virtual void __cdecl content::WebContentsImpl::SetPageBaseBackgroundColor(class std::__Cr::optional<unsigned int>)"},
         &addresses[11]},
        {{L"public: virtual void __cdecl ContentsWebView::SetWebContents(class content::WebContents *)"},
         &addresses[12]},
    };
    static_assert(ARRAYSIZE(chromeHooks) == kFunctionSlots);
    WH_HOOK_SYMBOLS_OPTIONS options{};
    options.optionsSize = sizeof(options);
    options.symbolServer = L"";  // Never fall back to downloading a multi-GB PDB.
    // Use Windhawk's default undecorated C++ prototypes for standard caching.
    options.onlineCacheUrl =
        s_useOnlineSymbolCache.load(std::memory_order_acquire) ? kOnlineSymbolCache : L"";
    // Resolve without installing hooks. HookSymbols can return partial outputs
    // on failure; nothing is published unless the entire set passes validation.
    if (!WindhawkUtils::HookSymbols(module, chromeHooks, ARRAYSIZE(chromeHooks), &options))
        return false;
    return ValidateSymbolAddresses(module, addresses, rva);
}

namespace SymbolCache {
static constexpr const char* kFeatureSymbols[]={
    "protected: virtual void __cdecl views::View::OnPaintBackground(class gfx::Canvas *)",
    "public: void __cdecl gfx::Canvas::DrawColor(unsigned int,enum SkBlendMode)",
    "public: class std::__Cr::basic_string_view<char,struct std::__Cr::char_traits<char> > __cdecl views::View::GetClassNameW(void)const",
    "private: virtual bool __cdecl BrowserDesktopWindowTreeHostWin_ChromiumImpl::ShouldWindowContentsBeTransparent(void)const",
    "public: __cdecl BraveVerticalTabStripContainerView::BraveVerticalTabStripContainerView(class BrowserView *,class views::View *)",
    "public: void __cdecl views::View::SetBackground(class std::__Cr::unique_ptr<class views::Background,struct std::__Cr::default_delete<class views::Background> >)",
    "public: virtual bool __cdecl LocationBarView::HasFocus(void)const",
    "public: virtual bool __cdecl views::View::HasFocus(void)const",
    "public: virtual void __cdecl ContentsWebView::OnThemeChanged(void)",
    "public: virtual void __cdecl ContentsWebView::RenderViewReady(void)",
    "public: virtual void __cdecl ui::LayerAnimator::SetColor(struct SkRGBA4f<3>)",
    "public: virtual void __cdecl content::WebContentsImpl::SetPageBaseBackgroundColor(class std::__Cr::optional<unsigned int>)",
    "public: virtual void __cdecl ContentsWebView::SetWebContents(class content::WebContents *)",
    "struct HWND__ * __cdecl views::HWNDForView(class views::View const *)",
    "public: unsigned int __cdecl ui::ColorProvider::GetColor(int)const",
    "public: virtual void __cdecl views::MenuScrollViewContainer::OnPaintBackground(class gfx::Canvas *)",
    "public: virtual void __cdecl views::BubbleBackground::Paint(class gfx::Canvas *,class views::View *)const",
    "public: virtual void __cdecl cc::RecordPaintCanvas::drawRRect(class SkRRect const &,class cc::PaintFlags const &)",
    "public: __cdecl RoundedOmniboxResultsFrame::RoundedOmniboxResultsFrame(class views::View *,class LocationBar *,bool)",
    "public: virtual __cdecl RoundedOmniboxResultsFrame::~RoundedOmniboxResultsFrame(void)",
    "private: virtual void __cdecl ui::Layer::SetRoundedCornersFromAnimation(class gfx::RoundedCornersF const &,enum ui::PropertyChangeReason)",
    "public: virtual void __cdecl views::SolidBackground::Paint(class gfx::Canvas *,class views::View *)const",
    "public: class gfx::Rect __cdecl views::View::GetLocalBounds(void)const",
    "public: static int __cdecl RoundedOmniboxResultsFrame::GetNonResultSectionHeight(bool)",
    "const views::SolidBackground::`vftable'",
    "public: virtual void __cdecl views::BubbleFrameView::OnThemeChanged(void)",
    "public: void __cdecl ui::Layer::SetFillsBoundsOpaquely(bool)",
    "public: virtual void __cdecl FadeLabel::OnPaintBackground(class gfx::Canvas *)",
    "public: class gfx::Rect __cdecl views::View::GetBoundsInScreen(void)const",
    "public: static void __cdecl RoundedOmniboxResultsFrame::OnBeforeWidgetInit(struct views::Widget::InitParams *,class views::Widget *)",
};
static bool ParseFeatureCache(const std::string& bytes,const BuildIdentity& id,size_t* result) {
    if(bytes.empty()||bytes.size()>kMaxCache||!std::all_of(bytes.begin(),bytes.end(),
        [](unsigned char c){return c>=32&&c<=126;}))return false;
    std::vector<std::string_view> fields;size_t begin=0;
    for(size_t i=0;i<=bytes.size();++i)if(i==bytes.size()||bytes[i]=='#'){
        fields.emplace_back(bytes.data()+begin,i-begin);begin=i+1;
    }
    const auto identity="x86-64_"+std::to_string(id.timestamp)+"_"+std::to_string(id.imageSize);
    if(fields.size()!=3+kFeatureSlots*2||fields[0]!="1"||fields[1]!="chrome.dll"||fields[2]!=identity)return false;
    std::array<size_t,kFeatureSlots> entries{};
    for(unsigned i=0;i<kFeatureSlots;++i){
        const auto name=fields[3+i*2],number=fields[4+i*2];
        if(name!=kFeatureSymbols[i])return false;
        if(number.empty())continue;
        if(number.size()>10||number.front()=='0')return false;
        uint64_t value=0;for(char c:number){if(c<'0'||c>'9')return false;value=value*10+c-'0';}
        if(!value||value>=id.imageSize||std::find(entries.begin(),entries.begin()+i,value)!=entries.begin()+i)return false;
        entries[i]=size_t(value);
    }
    // Every published address must serve a complete feature. An explicit cache
    // with no supported features is a safe diagnostic outcome, never a hook.
    const unsigned available=CompleteFeatures(entries.data());
    for(unsigned i=0;i<kFeatureSlots;++i)if(entries[i]){
        auto removed=entries;removed[i]=0;
        if(CompleteFeatures(removed.data())==available)return false;
    }
    std::copy(entries.begin(),entries.end(),result);return true;
}
}
