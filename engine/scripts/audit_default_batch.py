"""Aggregate-only audit of private default-recovery output."""
import argparse, collections, json
from pathlib import Path

def audit(root):
    manifest=json.loads((root/'manifest.json').read_text(encoding='utf8'))
    areas=collections.defaultdict(collections.Counter)
    totals=collections.Counter()
    blockers=collections.Counter()
    seen=set()
    for item in manifest:
        rel=item['path'].replace('\\','/')
        if rel in seen:raise ValueError('Duplicate manifest path')
        seen.add(rel)
        totals['filesAttempted']+=1
        if item['status']!='processed':
            totals['fileErrors']+=1
            continue
        totals['filesProcessed']+=1
        records=json.loads((root/rel).read_text(encoding='utf8'))
        area=next((label for marker,label in [('/Characters/Heroes/','heroes'),('/Items/','items'),('/Eternals/','eternals')] if marker in '/'+rel),'other')
        if not records:totals['filesWithoutRawDefault']+=1
        for r in records:
            counts={'defaultRecords':1,'exactPropertySpans':sum(v['exact'] for v in r['values']),
                    'exactNonemptyPropertySpans':sum(v['exact'] and v['bytes']>0 for v in r['values']),
                    'unverifiedPropertySpans':sum(not v['exact'] for v in r['values']),
                    'reachedPropertyEnd':int(r['ended']),
                    'fullyConsumedRecordsWithExactProperties':int(r['ended'] and r['consumed']==r['size'] and all(v['exact'] for v in r['values']))}
            totals.update(counts);areas[area].update(counts)
            stop=r['stop']
            prefix='Failed to find a valid schema for parent name '
            if stop.startswith(prefix):blockers['missing-struct-or-parent-schema']+=1
            elif stop.startswith('Failed to find a valid property for schema index '):blockers['unresolved-inherited-property-index']+=1
            elif stop:blockers['other-parse-stop']+=1
    library = root/'schema-library.json'
    shared = json.loads(library.read_text(encoding='utf8')) if library.exists() else None
    if shared is not None:
        totals['sharedSchemas'] = shared['count']
        totals['ambiguousSharedNamesExcluded'] = len(shared['ambiguous'])
        totals['schemaBuildErrors'] = len(shared['schemaErrors'])
    return {'scope':'Partial defaults across recovered-class subset, not the entire 5630-asset inventory or gameplay coverage','counts':dict(totals),'areas':{k:dict(v) for k,v in sorted(areas.items())},'stopCategories':dict(blockers),'limits':['Exact spans include zero-byte properties; nonempty spans are reported separately.','Property-span roundtrip does not establish runtime behavior, default inheritance or whole-asset parity.','Fully consumed records still require default inheritance and native behavior validation.','Manifest processing success does not mean default parsing completed.','No private values, parser messages or decoded bodies are exported.']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
    r=audit(a.root);a.output.write_text(json.dumps(r,indent=2)+'\n',encoding='utf8');print(json.dumps(r['counts']))
