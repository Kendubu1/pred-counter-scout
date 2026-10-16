# Partial default recovery

Use the private patched UAssetAPI project described in ../schema-recovery/README.md.
Build with `-p:UAssetApiProject=<private project path>`. Pass a recovered asset JSON
and the matching original uasset. Console output contains private game data;
redirect it outside the repository. This probe never modifies the original files.

First run engine/scripts/recover_native_structs.py against the installed executable.
It requires unique descriptors and validates the four expected field sequences,
property kinds and flags. Preserve its executable hash and metadata privately.
The four schema declarations here correspond to that observed profile; do not
reuse them on a different executable unless the native probe validates it again.

The probe parses class-default properties in order. Each VERIFIED_BYTES result
requires exact reserialization of that property span. UNVERIFIED_WRITE means a
property read but did not pass that check; STOP means decoding ended at the first
unsupported property. Neither indicates complete asset or gameplay verification.
Earlier properties can be read after an unverified write, so byte identity of a
later span does not prove the entire preceding record or runtime semantics.

2026-10-16: Energized's handle and StacksOnHit pass. StormBreaker also passes six
scalable-float fields and two effect handles. Native inheritance and GameplayTag
remain unresolved. Cooked ScalableFloat ElementSize metadata is 56 while the
installed native descriptor reports size 40; do not use either memory size as a
serialized span length or claim whole ABI parity. Observed serialized properties
roundtrip with the recovered reflected field order.
