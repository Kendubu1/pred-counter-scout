from pathlib import Path
import json,collections,hashlib
import argparse
parser=argparse.ArgumentParser(description='Sanitize a private mechanics decode into coverage metadata; never exports instruction bodies.')
parser.add_argument('--work-root',required=True,type=Path)
parser.add_argument('--output',required=True,type=Path)
a=parser.parse_args()
r=a.work_root;out=r/'full-mechanics-decoded';selected=json.loads((r/'full-mechanics-selection.json').read_text(encoding='utf8')); rows=[]
def area(p):
 if '/Eternals/' in p:return 'eternals'
 if '/Items/' in p:return 'items'
 if '/Characters/Heroes/' in p:return 'heroes'
 if '/Characters/Shared/' in p:return 'shared-character'
 return 'world-and-framework'
for p in sorted(out.rglob('*.uasset.json')):
 rel=p.relative_to(out).as_posix()[:-5];d=json.loads(p.read_text(encoding='utf8'));ex=d.get('Exports',[]);fs=[e for e in ex if e.get('ScriptBytecode')]
 rows.append({'path':rel,'area':area(rel),'selected':rel in selected,'functions':len(fs),'verifiedFunctionStreams':sum(e.get('ReviewBytecodeMatches') is True for e in fs),'rawExports':sum('RawExport' in e.get('$type','') for e in ex),'sha256':hashlib.sha256((r/'full-mechanics-assets'/rel).read_bytes()).hexdigest(),'uexpSha256':hashlib.sha256((r/'full-mechanics-assets'/rel).with_suffix('.uexp').read_bytes()).hexdigest()})
manifest=json.loads((out/'parse-manifest.json').read_text(encoding='utf8'))
report={'generatedDate':'2026-10-16','scope':'Broad installed-client mechanics inventory, not all-game behavior certification','selection':'GA_, GE_, GMMC_, GCN_ asset prefixes across archive; containing directories also include dependencies. Nonmatching assets outside these directories remain unexamined.','limits':['Bytecode roundtrip verifies decoding only; not native functions, default bindings or server parity.','Raw exports require property schemas; no usmap/pdb entries found in archive index.','Existing baseline reader used basename output; this pass preserves full paths to avoid collisions.','Extracted/decoded is not manually reviewed or integrated into the simulator.'],'selectedAssetCount':len(selected),'decodedAssetCount':len(rows),'selectedDecodedCount':sum(x['selected'] for x in rows),'functionCount':sum(x['functions'] for x in rows),'verifiedFunctionStreams':sum(x['verifiedFunctionStreams'] for x in rows),'rawExportCount':sum(x['rawExports'] for x in rows),'parseErrors':[{'path':x['path'].replace(chr(92),'/'),'error':x['error']} for x in manifest if x['status']=='error'],'areas':{},'assets':rows}
for category in sorted(set(x['area'] for x in rows)):
 rs=[x for x in rows if x['area']==category];report['areas'][category]={'assets':len(rs),'functions':sum(x['functions'] for x in rs),'rawExports':sum(x['rawExports'] for x in rs)}
decoded={x['path'] for x in rows}
assert len(decoded)==len(rows), 'Duplicate full paths'
errors={x['path'] for x in report['parseErrors']}
report['missingSelectedAssets']=sorted(set(selected)-decoded-errors)
report['selectedParseErrorCount']=len(set(selected)&errors)
assert report['selectedDecodedCount']+report['selectedParseErrorCount']+len(report['missingSelectedAssets'])==len(selected)
report['nonRoundtrippingFunctions']=sum(x['functions']-x['verifiedFunctionStreams'] for x in rows)
counts=collections.Counter(Path(x).name for x in selected)
report['duplicateBasenames']={k:v for k,v in counts.items() if v>1}
report['limits'].append('Archive assets may include unused, retired or unreleased content; directory presence does not establish active roster/mechanics.')
a.output.write_text(json.dumps(report,indent=1)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k not in ['assets','parseErrors']},indent=1));print('Parse errors',len(report['parseErrors']))
