"""Synthetic regression for coverage accounting; contains no game assets."""
import json, subprocess, sys, tempfile, unittest
from pathlib import Path

class CoverageAuditTest(unittest.TestCase):
 def test_preserves_same_name_assets_and_exposes_missing_or_failed_decodes(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp); decoded=r/'full-mechanics-decoded'; decoded.mkdir()
   paths=['A/GA_Test.uasset','B/GA_Test.uasset','C/GE_Failed.uasset','D/GE_Missing.uasset']
   (r/'full-mechanics-selection.json').write_text(json.dumps(paths),encoding='utf8')
   for path in paths[:2]:
    target=decoded/(path+'.json');target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps({'Exports':[{'ScriptBytecode':['PRIVATE_BODY'],'ReviewBytecodeMatches':path.startswith('A')},{'$type':'RawExport'}]}),encoding='utf8')
    source=r/'full-mechanics-assets'/path;source.parent.mkdir(parents=True,exist_ok=True);source.write_bytes(b'synthetic');source.with_suffix('.uexp').write_bytes(b'synthetic-export')
   (decoded/'parse-manifest.json').write_text(json.dumps([{'path':paths[2],'status':'error','error':'SyntheticError','message':'PRIVATE_MESSAGE'}]),encoding='utf8')
   output=r/'report.json'
   subprocess.run([sys.executable,str(Path(__file__).with_name('audit-decoded-mechanics.py')),'--work-root',str(r),'--output',str(output)],check=True,capture_output=True)
   text=output.read_text(encoding='utf8');d=json.loads(text)
   self.assertEqual(d['selectedDecodedCount'],2)
   self.assertEqual(d['selectedParseErrorCount'],1)
   self.assertEqual(d['missingSelectedAssets'],[paths[3]])
   self.assertEqual(d['nonRoundtrippingFunctions'],1)
   self.assertEqual(d['duplicateBasenames'],{'GA_Test.uasset':2})
   self.assertNotIn('PRIVATE_',text)
if __name__=='__main__':unittest.main()
