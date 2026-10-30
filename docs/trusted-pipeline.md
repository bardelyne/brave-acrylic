# Symbol cache hosting and trust

From 3.9, Brave Acrylic uses Windhawk's ordinary `HookSymbols` and `onlineCacheUrl` mechanism. The earlier workflow/artifact verification gate is removed, including its extra GitHub API calls, proof locators, compiled workflow hashes and separate proof-storage format.

**bardelyne controls the symbol service, repository and publishing workflow.** This is an author-hosted cache, not an official Windhawk service. The owner can change published locations without another mod release. Users must trust that operator and the hosting infrastructure. Valid function locations are data, but redirecting hooks or native calls can still crash or compromise Brave.

The mod retains executable-range, exact unwind-entry, known helper-leaf, direct-thunk and overlap checks. These catch structural errors; they do not authenticate the cache operator, verify the generating workflow, prove a function's behavior, or restrict a malicious address to appearance changes. Do not describe these checks as an appearance-only security gate.

The workflow still verifies official Brave archive checksums, PE/PDB GUID and DBI age, compiler aliases and complete feature groups. Actions are pinned. Generation and publication use the same run revision. These are publishing safeguards under the author's control, not independent client authentication.

The client only downloads small compatibility files through Windhawk. It has no upload, login, telemetry, custom HTTP verifier, polling or retry thread. GitHub sees the requester's IP and requested build-cache URL. Offline mode uses suitable existing local symbols. Remote PDB downloads are disabled.

Older cache namespaces are retained for older mod versions. New data is published in the current namespace described in [compatibility](compatibility.md). Restart Brave after installing, updating, changing settings or waiting for newly required data.
