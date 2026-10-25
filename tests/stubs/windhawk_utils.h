#pragma once
#include <windhawk_api.h>
#include <initializer_list>
#include <string_view>
namespace WindhawkUtils {
struct SYMBOL_HOOK {
    std::initializer_list<std::wstring_view> symbols;
    void** originalFunction;
    void* hookFunction = nullptr;
    bool optional = false;
};
bool HookSymbols(HMODULE, const SYMBOL_HOOK*, size_t, const WH_HOOK_SYMBOLS_OPTIONS*);
template<typename Function>
bool SetFunctionHook(Function target, Function hook, Function* original) {
    return Wh_SetFunctionHook(reinterpret_cast<void*>(target), reinterpret_cast<void*>(hook),
                              reinterpret_cast<void**>(original)) != FALSE;
}
class StringSetting {
    PCWSTR value;
    explicit StringSetting(PCWSTR text) : value(text) {}
public:
    ~StringSetting() { Wh_FreeStringSetting(value); }
    StringSetting(const StringSetting&) = delete;
    PCWSTR get() const { return value; }
    template<typename... Args>
    static StringSetting make(PCWSTR name, Args... args) { return StringSetting(Wh_GetStringSetting(name, args...)); }
};
}
