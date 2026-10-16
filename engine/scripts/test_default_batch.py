import json, tempfile, unittest
from pathlib import Path
from audit_default_batch import audit

class BatchAuditTest(unittest.TestCase):
 def test_partial_zero_spans_errors_and_privacy(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);manifest=[]
   for area in ['Items','Characters/Heroes']:
    rel=area+'/GA_Same.uasset.json';p=root/rel;p.parent.mkdir(parents=True,exist_ok=True)
    record={'ended':False,'consumed':4,'size':8,'stop':'PRIVATE_ERROR','values':[{'exact':True,'bytes':0,'property':'PRIVATE_VALUE'},{'exact':True,'bytes':4},{'exact':False,'bytes':2}]}
    p.write_text(json.dumps([record]),encoding='utf8');manifest.append({'path':rel,'status':'processed'})
   manifest.append({'path':'failed.uasset.json','status':'error','error':'PRIVATE_ERROR'})
   (root/'manifest.json').write_text(json.dumps(manifest),encoding='utf8')
   (root/"schema-library.json").write_text(json.dumps({"count":4,"ambiguous":["PRIVATE_CLASS"],"schemaErrors":[{"file":"PRIVATE_PATH","error":"PRIVATE_MESSAGE"}]}),encoding="utf8")
   r=audit(root)
   self.assertEqual(r['counts']['filesAttempted'],3)
   self.assertEqual(r['counts']['fileErrors'],1)
   self.assertEqual(r['counts']['sharedSchemas'],4)
   self.assertEqual(r['counts']['ambiguousSharedNamesExcluded'],1)
   self.assertEqual(r['counts']['schemaBuildErrors'],1)
   self.assertEqual(r['counts']['exactPropertySpans'],4)
   self.assertEqual(r['counts']['exactNonemptyPropertySpans'],2)
   self.assertEqual(r['counts']['fullyConsumedRecordsWithExactProperties'],0)
   self.assertEqual(set(r['areas']),{'items','heroes'})
   self.assertNotIn('PRIVATE',json.dumps(r))
   manifest.append(manifest[0]);(root/'manifest.json').write_text(json.dumps(manifest),encoding='utf8')
   with self.assertRaises(ValueError):audit(root)
if __name__=='__main__':unittest.main()
