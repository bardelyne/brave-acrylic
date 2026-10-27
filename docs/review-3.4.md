# Review changes in 3.4

Historical notes for 3.4/3.4.1. Version 3.5 adds a bounded HTTPS pipeline-proof gate; see [trusted-pipeline.md](trusted-pipeline.md) for the current trust model and network behavior.

Addresses the [3.3 AI review](https://github.com/ramensoftware/windhawk-mods/pull/6471#issuecomment-6390506396) and the [maintainer's online-cache suggestion](https://github.com/ramensoftware/windhawk-mods/pull/6471#issuecomment-6391627353).

- Removed the custom WinHTTP fetcher, download worker, periodic retry, downloaded binary-map storage, old download setting and WinHTTP link dependency. Unknown builds use `WindhawkUtils::HookSymbols` and `WH_HOOK_SYMBOLS_OPTIONS::onlineCacheUrl` with Windhawk's default C++ prototypes. Remote PDB fallback is disabled; an offline-only setting remains.
- The producer resolves exact mangled PDB names before publishing their corresponding full readable prototypes in standard `pdb_<GUID-age>.txt` files. The 3.4.1 follow-up removes the built-in reference table; every build now uses Windhawk symbol resolution. All thirteen lookup results must pass local structural checks before seven hooks are registered. The cache publisher is still trusted; those checks do not authenticate function names.
- Defaulted caption hiding off and restored Brave Appearance's **Use compact mode** guidance. The opt-in setting explicitly describes removal of the real system-menu style and potential menu/tool effects. Existing saved caption preferences remain unchanged.
- Moved caption-style restoration into `Wh_ModBeforeUninit`, while style hooks are still installed. A hidden native-frame regression test checks that the actual system-menu bit and ownership property are restored before teardown.
- Used `WH_MOD_VERSION` in logs and expanded the dense validation, leaf, dependency and resolver code for review.
- Retained the documented page-base lifetime: existing tabs may keep their stored transparent base until Brave is reopened normally after disabling the mod. No unsafe retained WebContents pointers or object-layout offsets were added to undo it.

## Validation

Portable tests cover standard cache generation/parsing, exact PDB names, aliases, metadata skip decisions, provenance and publisher rejection. Windows tests cover all-or-nothing native discovery, invalid addresses, online/offline options, hook failure, activation/shutdown ordering, caption restoration, native ownership, address focus and repeated tab selection preserving authored colors. The real Brave DLL is mapped without executing its initialization for address checks.

A separate hidden x64 process tested the production resolver against the real Windhawk 1.7.3 engine: missing, partial and wrong-name caches installed no native hooks; a complete 1,411-byte cache resolved thirteen functions and registered seven hooks; the next process reused Windhawk's local cache with no HTTP request. This lookup test does not exercise browser rendering or interactive system menus.

The official submission parser extracts all thirteen prototypes successfully. Its remaining warning is that `chrome.dll` is absent from Winbindex's Windows filename list. This is a third-party Brave DLL. The declaration retains its correct target instead of obscuring it to bypass that check; maintainer handling of that validation rule is still needed.
