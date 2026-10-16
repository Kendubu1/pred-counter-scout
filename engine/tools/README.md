
Native control-flow traces include `ripReferences`: instruction/operand, next-instruction-relative target, mapped file offset (or null), operand width and LEA address-only flag. These are private reference metadata, not decoded defaults or resolved indirect calls. Use them to audit tag getters and constants without guessing operand types.
