import base64, json, tempfile, unittest
from pathlib import Path
from audit_recovered_schemas import audit

class SchemaAuditTest(unittest.TestCase):
    def test_boundaries_privacy_and_duplicate_basename(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for area in ['A', 'B']:
                rel = Path(area) / 'GA_Test.uasset.json'
                before = {'$type': 'RawExport', 'ObjectName': 'PRIVATE_NAME', 'Data': base64.b64encode(b'preBODYtail').decode()}
                after = {'$type': 'ClassExport', 'ObjectName': 'PRIVATE_NAME', 'ReviewPrefixLength': 3, 'ReviewOpaquePrefix': base64.b64encode(b'pre').decode(), 'Extras': base64.b64encode(b'tail').decode(), 'LoadedProperties': [{'Name': 'PRIVATE_FIELD'}]}
                for folder, record in [('full-mechanics-decoded', before), ('full-schema-recovered', after)]:
                    p = root / folder / rel
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_text(json.dumps({'Exports': [record]}), encoding='utf8')
            result = audit(root)
            self.assertEqual(result['counts']['classes'], 2)
            self.assertEqual(result['counts']['declaredFields'], 2)
            self.assertNotIn('PRIVATE', json.dumps(result))
            after['Extras'] = base64.b64encode(b'wrong').decode()
            p.write_text(json.dumps({'Exports': [after]}), encoding='utf8')
            with self.assertRaises(ValueError):
                audit(root)

if __name__ == '__main__':
    unittest.main()
