# Private class-layout recovery probe

Run only against a private extraction. Output contains proprietary decoded assets;
never commit it. Supply `-p:UAssetApiProject=<private patched UAssetAPI.csproj>`
when building, then pass input and output directories to the executable.

Requires the existing private UE5.4-profile bytecode reader plus this opt-in
adapter in `NormalExport` (the upstream library is not vendored here):

```csharp
public int ReviewPrefixLength = -1;
public byte[] ReviewOpaquePrefix;
// At the start of Read:
if (this is ClassExport && ReviewPrefixLength >= 0) {
    ReviewOpaquePrefix = reader.ReadBytes(ReviewPrefixLength);
    Data = new List<PropertyData>();
    return;
}
// At the start of Write:
if (this is ClassExport && ReviewOpaquePrefix != null) {
    writer.Write(ReviewOpaquePrefix);
    return;
}
```

This deliberately skips an opaque prefix; it does not decode that prefix.
The probe bounds candidate headers, checks child references and property counts,
requires exactly one candidate with a byte-identical reserialized body, and
preserves the uninterpreted trailer. `BODY_MATCH` is candidate-level logging;
only the final `fields=` line means a unique candidate was accepted.

The scan uses the existing UE5.4 parser profile, not proof of the game's engine
version. It examines GA_/GE_/GMMC_/GCN_ assets only. Class fields are metadata,
not defaults. Native inheritance and struct layouts still need evidence.
The 4096-byte prefix search limit is a probe bound, not a game constant.

`engine/scripts/audit_recovered_schemas.py` compares private recovered output
with baseline raw exports and emits aggregate-only metadata. It independently
checks identity and opaque boundaries; it cannot reverify body serialization
from JSON alone. Keep the original source, reader and scan log privately.
