"""Summarize private class recovery without publishing game fields or values."""
import argparse, base64, collections, hashlib, json
from pathlib import Path

def audit(root):
    recovered = root / 'full-schema-recovered'
    baseline = root / 'full-mechanics-decoded'
    counts = collections.Counter()
    areas = collections.defaultdict(collections.Counter)
    for path in sorted(recovered.rglob('*.uasset.json')):
        rel = path.relative_to(recovered)
        old = json.loads((baseline / rel).read_text(encoding='utf8'))['Exports']
        new = json.loads(path.read_text(encoding='utf8'))['Exports']
        if len(old) != len(new):
            raise ValueError('Export count changed')
        area = next((label for part, label in [('/Eternals/', 'eternals'), ('/Items/', 'items'), ('/Characters/Heroes/', 'heroes'), ('/Characters/Shared/', 'shared-character')] if part in '/' + rel.as_posix()), 'world-and-framework')
        file_classes = 0
        for before, after in zip(old, new):
            if 'RawExport' not in before.get('$type', '') or 'ClassExport' not in after.get('$type', ''):
                continue
            raw = base64.b64decode(before['Data'], validate=True)
            prefix = base64.b64decode(after['ReviewOpaquePrefix'], validate=True)
            tail = base64.b64decode(after['Extras'], validate=True)
            if before['ObjectName'] != after['ObjectName'] or len(prefix) != after['ReviewPrefixLength']:
                raise ValueError('Export identity or prefix length changed')
            if not raw.startswith(prefix) or (tail and not raw.endswith(tail)) or len(prefix) + len(tail) >= len(raw):
                raise ValueError('Opaque boundaries do not match original')
            for key, value in {'classes': 1, 'declaredFields': len(after['LoadedProperties']), 'opaquePrefixBytes': len(prefix), 'opaqueTailBytes': len(tail)}.items():
                counts[key] += value
                areas[area][key] += value
            file_classes += 1
        if not file_classes:
            raise ValueError('Output file contains no recovered classes')
        counts['assets'] += 1
        areas[area]['assets'] += 1
    return {'scope': 'Partial class-layout recovery; not default-value or gameplay verification', 'counts': dict(counts), 'areas': {k: dict(v) for k,v in sorted(areas.items())}, 'validation': 'Recovery probe requires one candidate and exact reserialization of the interpreted body. This audit independently checks export identity and opaque boundaries against the baseline raw bytes.', 'limits': ['Opaque prefix and trailer are preserved, not interpreted.', 'Declared fields are schema metadata, never class-default values.', 'Native inherited layouts, default bindings and runtime/server behavior remain unresolved.', 'Recovered assets are a subset of the 5630 selected mechanics assets, which include potentially inactive content.', 'No simulator formulas or build rankings change from this report.']}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--work-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = audit(args.work_root)
    args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print(json.dumps(report['counts']))
