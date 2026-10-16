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


An optional sixth argument is the reviewed PRIVATE PredGameplayAbility field tree
from recover_native_class.py. This is a specific partial parent profile, not an
automatic native superclass resolver. Its ownership must first be traced from the
native registration entry to the constructor/class-parameter record. The class
probe interprets the observed packed descriptor profile and folds array/map/enum
helper entries; unknown native superclass fields remain unsupported. Supply the
additional native enums with the fifth argument. The enum extractor supports
repeated --additional-name options with the same descriptor validation.

The seventh optional argument supplies reviewed PRIVATE native struct dependencies
from recover_native_dependencies.py; pass explicitly traced --root parameter
addresses for this executable build. The tool follows struct registration
constructors, folds helper entries and rejects conflicting owners or malformed
metadata. Its output carries the executable hash and must never be committed.
It currently covers AbilityInfo/GameplayAttribute and shared actor/tag filters.
Layout recovery does not establish query evaluation or targeting behavior.

The eighth optional argument supplies the reviewed GameplayAbility own-field tree
from recover_native_class.py. This explicitly links PredGameplayAbility to its
traced native parent; it does not discover further native inheritance. Text,
field-path, name and integer properties now have native type mappings. Unknown
property kinds still stop recovery. Four trailing bytes observed in completed
property streams remain opaque; reaching property end is not whole-CDO parity.


Native behavior investigation uses engine/scripts/trace_native_control_flow.py.
Install Capstone in a private analysis environment and expose it through PYTHONPATH
for that tool and test_native_control_flow.py. Inputs: installed executable,
reviewed entry address and PRIVATE JSON output; --limit bounds instructions.
The tracer follows direct branches, reports calls/indirect branches, and rejects
unmapped or overlapping instructions. It does not execute the game, resolve calls,
or certify behavior. Exception-directory bounds may describe code fragments.
Never commit generated instruction output. The curve-helper review documents why
native override selection must be resolved before treating packaged defaults as
effective gameplay values.


An explicit ninth argument, --all-raw, opts into reviewed non-default raw exports
such as native configuration data assets. Omit it to retain Default__ selection.
The native schema dictionary can contain reviewed class-own layouts as well as
struct layouts; unprovided ancestors remain unresolved. Native kind 13 is mapped
to soft-object serialization for the observed soft-class references. Two private
mode configurations verify exact map bytes and reference targets. Do not use
CDO-specific aggregate terminology for these non-default exports, or treat an
opaque trailing span as verified property data.


RawExport.Data is the parsing source and bound. Earlier serialization can change
saved SerialOffset/SerialSize metadata relative to original files. The original
asset-root argument is retained for invocation compatibility, but raw-property
reads no longer seek into those files. Use verify_default_offset_relocation.py
with a built reader, private decoded samples, original root, a fresh private
scratch directory, baseline directory and profile arguments to test this invariant.
It corrupts metadata and requires identical nonempty property results; no source
assets are changed and all generated results remain private.


For reviewed native enums with legacy aliases, recover_native_enums.py accepts
--allow-aliases. It emits one entry per explicit numeric value and retains every
additional registered name in aliases; the first registered name is the canonical
label. Numeric values are sorted, never renumbered. Strict mode remains default;
both modes reject duplicate labels, invalid ownership and sparse numeric profiles.
The batch reader consumes canonical entries without losing the private alias map.

Native dictionary entries may specify a reviewed superType name, preserving own-field indices and explicit ancestry. Added primitive mappings include bitfield bools, UInt64, weak objects and delegates. Unvisited serialized fields are not validated merely because a mapping exists. Run verify_projectile_defaults.py against the private three-record projectile recovery to gate exact spans, inherited Actor fields, UInt64 timer storage and reviewed collision flags. This does not certify whole exports or gameplay.

For targeted schema follow-ups, run compare_default_recovery.py with private
baseline and follow-up directory arguments. The follow-up may be a subset, but
every record in it must retain all previously exact property identities, spans
and decoded values. The gate rejects completion regressions and emits counts
only. A passing gate proves preservation, not runtime semantics.
