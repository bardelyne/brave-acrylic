#pragma once
#include <windows.h>
#include <cstddef>
void TestLog(PCWSTR, ...);
#define Wh_Log(...) TestLog(__VA_ARGS__)
PCWSTR Wh_GetStringSetting(PCWSTR, ...);
void Wh_FreeStringSetting(PCWSTR);
int Wh_GetIntSetting(PCWSTR);
size_t Wh_GetBinaryValue(PCWSTR, void*, size_t);
BOOL Wh_SetBinaryValue(PCWSTR, const void*, size_t);
BOOL Wh_SetFunctionHook(void*, void*, void**);
BOOL Wh_ApplyHookOperations();
