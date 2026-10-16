"""Private integration regression: default decoding must ignore saved export offsets.
Requires private decoded sample data and the built batch-defaults reader.
"""
import argparse,json,subprocess
from pathlib import Path

def run(reader, source, original_assets, output, baseline, profiles):
    subprocess.run(['dotnet',str(reader),str(source),str(original_assets),str(output),str(baseline),*profiles],check=True)

def verify(reader, source, original_assets, scratch, baseline, profiles):
    if scratch.exists():raise ValueError('Use a fresh private scratch directory')
    if source.resolve()==scratch.resolve() or source.resolve() in scratch.resolve().parents:raise ValueError('Scratch must be outside input tree')
    altered=scratch/'relocated';altered.mkdir(parents=True)
    files=list(source.rglob('*.uasset.json'))
    if not files:raise ValueError('No input samples')
    for path in files:
        doc=json.loads(path.read_text(encoding='utf8'))
        for export in doc['Exports']:
            if 'RawExport' in export['$type']:
                export['SerialOffset']=0
                export['SerialSize']=1
        dest=altered/path.relative_to(source);dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_text(json.dumps(doc),encoding='utf8')
    first=scratch/'original-results';second=scratch/'relocated-results'
    run(reader,source,original_assets,first,baseline,profiles)
    run(reader,altered,original_assets,second,baseline,profiles)
    exact=0;records=0
    for path in files:
        rel=path.relative_to(source)
        a=json.loads((first/rel).read_text(encoding='utf8'));b=json.loads((second/rel).read_text(encoding='utf8'))
        if a!=b:raise AssertionError('Decoded properties changed after metadata relocation')
        for record in a:
            records+=1;exact+=sum(v['exact'] and v['bytes']>0 for v in record['values'])
    if not records or not exact:raise AssertionError('No meaningful property coverage')
    return {'files':len(files),'records':records,'exactNonemptyProperties':exact}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('reader',type=Path);p.add_argument('source',type=Path);p.add_argument('original_assets',type=Path);p.add_argument('private_scratch',type=Path);p.add_argument('baseline',type=Path);p.add_argument('profiles',nargs='+');a=p.parse_args()
    print(json.dumps(verify(a.reader,a.source,a.original_assets,a.private_scratch,a.baseline,a.profiles)))
