# Broad partial-default recovery

Build against the same private patched UAssetAPI project as ../defaults-recovery.
First validate the installed executable using recover_native_structs.py. This
runner uses the same six observed struct layouts. Arguments are recovered-class
JSON root, matching original extracted asset root, PRIVATE output directory,
and baseline decoded-asset root. The reader overlays recovered files by full
relative path, builds a shared Blueprint schema library, and excludes ambiguous
short class names from cross-asset lookup. Each asset retains its own local class
schema. Native inheritance beyond recovered parents still requires native metadata.
Do not commit its output: it contains game default properties. Paths are preserved.

It attempts every recovered-class JSON, records processing failures in a manifest,
and stops each CDO at its first unreadable property. Readable but non-roundtripping
properties remain explicitly unverified. The runner does not skip unknown bytes,
invent missing native schemas or assert that the entire CDO was verified.

Use audit_default_batch.py to emit aggregate-only public counts. Its file-level
processed count is distinct from property-stream completion, full export consumption,
and runtime behavior verification. Baseline uses the first four native layouts;
follow-up adds GameplayTag and empty PointerToUberGraphFrame. These reports cover
1,237 recovered-class assets, not all 5,630 selected mechanics assets. The other
assets and 17 per-file failures remain outside this default pass's recovered output.

Next common blockers: native/inherited class-property layouts (953 records),
PredActorFilter (66), PredFilterAndEffectsContainer (47). Resolve shared schemas
before attempting item-by-item numerical changes. No production rankings changed.


An optional fifth argument supplies private JSON from recover_native_enums.py.
The loader preserves explicit numeric values and rejects wrong owner labels,
duplicate values and sparse maps unsupported by this UAssetAPI profile. Run the
extractor against the installed executable before reuse; preserve its hash.
Do not commit the generated mappings. The enum-enabled pass resolves all 17
previous file-level errors; counts remain partial-property evidence.
