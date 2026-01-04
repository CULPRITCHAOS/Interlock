import json
import os
import subprocess
import tempfile
import unittest

class TestOperatorPackVerifier(unittest.TestCase):
    def setUp(self):
        self.tools_dir = os.path.join(os.getcwd(), 'tools')
        self.verify_script = os.path.join(self.tools_dir, 'verify_operatorpack.py')
        self.append_script = os.path.join(self.tools_dir, 'append_receipt_index.py')

    def create_mock_receipt(self, data):
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.json', mode='w')
        json.dump(data, tmp)
        tmp.close()
        return tmp.name

    def run_verify(self, receipt_path):
        result = subprocess.run(['py', self.verify_script, receipt_path], capture_output=True, text=True)
        return result.returncode, json.loads(result.stdout)

    def test_alias_keys_summary(self):
        # Test using build_time_s_at_maxN and memory_mb_at_maxN
        data = {
            "operatorpack_version": "1.0",
            "created_at": "2026-01-04T00:00:00Z",
            "project": "Test",
            "environment": "Dev",
            "geometry": {},
            "operator": {},
            "benchmarks": {
                "verify_scaling": {
                    "summary": {
                        "max_N": 10000,
                        "build_time_s_at_maxN": 100.0,
                        "memory_mb_at_maxN": 400.0,
                        "reciprocity_range": [1e-17, 2e-17]
                    }
                }
            }
        }
        path = self.create_mock_receipt(data)
        code, out = self.run_verify(path)
        os.remove(path)
        self.assertEqual(code, 0)
        self.assertEqual(out["verdict"], "PASS")
        self.assertEqual(out["build_time_s_at_maxN"], 100.0)

    def test_alias_keys_cases(self):
        # Test fallback to cases with alias keys (build_s, mem_mb)
        data = {
            "operatorpack_version": "1.0",
            "created_at": "2026-01-04T00:00:00Z",
            "project": "Test",
            "environment": "Dev",
            "geometry": {},
            "operator": {},
            "benchmarks": {
                "verify_scaling": {
                    "cases": [
                        {
                            "N": 10000,
                            "build_s": 50.0,
                            "mem_mb": 300.0,
                            "reciprocity": 1e-16
                        }
                    ]
                }
            }
        }
        path = self.create_mock_receipt(data)
        code, out = self.run_verify(path)
        os.remove(path)
        self.assertEqual(code, 0)
        self.assertEqual(out["verdict"], "PASS")
        self.assertEqual(out["build_time_s_at_maxN"], 50.0)
        self.assertEqual(out["mem_mb_at_maxN"], 300.0)

    def test_fail_threshold(self):
        data = {
            "operatorpack_version": "1.0",
            "created_at": "2026-01-04T00:00:00Z",
            "project": "Test",
            "environment": "Dev",
            "geometry": {},
            "operator": {},
            "benchmarks": {
                "verify_scaling": {
                    "summary": {
                        "max_N": 10000,
                        "build_s_at_maxN": 200.0, # Fails threshold (>150)
                        "mem_mb_at_maxN": 400.0,
                        "reciprocity_range": [1e-17]
                    }
                }
            }
        }
        path = self.create_mock_receipt(data)
        code, out = self.run_verify(path)
        os.remove(path)
        self.assertEqual(code, 2)
        self.assertEqual(out["verdict"], "FAIL")

    def test_append_index_numeric(self):
        # Test index append format
        data = {
            "operatorpack_version": "1.0",
            "created_at": "2026-01-04T00:00:00Z",
            "project": "Test",
            "environment": "Dev",
            "geometry": {},
            "operator": {},
            "benchmarks": {
                "verify_scaling": {
                    "summary": {
                        "max_N": 5000,
                        "build_s_at_maxN": 60.0,
                        "mem_mb_at_maxN": 250.0,
                        "reciprocity_range": [1e-18]
                    }
                }
            }
        }
        receipt_path = self.create_mock_receipt(data)
        with tempfile.NamedTemporaryFile(delete=False, suffix='.md', mode='w') as tmp:
            index_path = tmp.name
        
        subprocess.run(['py', self.append_script, receipt_path, index_path], capture_output=True, text=True)
        
        with open(index_path, 'r') as f:
            content = f.read()
        
        os.remove(receipt_path)
        os.remove(index_path)
        
        # Check for numeric memory (no " MB")
        self.assertIn("| 250.0 |", content)
        self.assertNotIn("MB", content)

if __name__ == "__main__":
    unittest.main()
