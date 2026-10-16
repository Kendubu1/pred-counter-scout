
Native control-flow traces include `ripReferences`: instruction/operand, next-instruction-relative target, mapped file offset (or null), operand width and LEA address-only flag. These are private reference metadata, not decoded defaults or resolved indirect calls. Use them to audit tag getters and constants without guessing operand types.

`engine/scripts/resolve_native_import.py EXECUTABLE SLOT PRIVATE_OUTPUT` resolves a PE32+ import slot through its original thunk table. Names and ordinals are supported; absent original tables are not guessed from the IAT. Reports stay private. Import identity does not establish runtime seeds, implementation behavior or server parity.
