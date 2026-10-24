#pragma once
#include <windhawk_api.h>
namespace WindhawkUtils {
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
