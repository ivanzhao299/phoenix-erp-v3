#!/usr/bin/env python3
"""Offline tests for the real breeding script's setup (no API/DB required).

Run: python3 -m unittest discover -s apps/api/scripts -p 'test_breeding_regression.py' -v
Only the setup prefix is executed; the 24 live regression assertions are not mocked
or represented as having passed. Temporary mock executables stay in this directory.
"""
import datetime
import json
import os
import sqlite3
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parent
SOURCE = (SCRIPTS / "breeding-regression.sh").read_text()
SETUP = SOURCE.split("# 孤儿表基线（用于 B2 增长检测）", 1)[0]
MOCK = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
record = pathlib.Path(os.environ['MOCK_RECORD'])
with record.open('a') as out:
    out.write(json.dumps({'tool': pathlib.Path(sys.argv[0]).name, 'args': args}) + '\n')
if pathlib.Path(sys.argv[0]).name == 'psql':
    if os.environ.get('SQL_FAIL'):
        print('mock SQL error', file=sys.stderr)
        sys.exit(3)
    sql = args[args.index('-c') + 1]
    if 'obj_description' in sql:
        print(os.environ.get('FIXTURE_OWNER', 'phoenix-ci-breeding-regression'))
    elif 'FROM sys_organizations' in sql:
        print(os.environ.get('ORG_CONTEXT', 'COMP-TEST|SITE-TEST'))
    elif "dict_type='BRD_BREED'" in sql:
        print(os.environ.get('BREED', 'HY_LINE_BROWN'))
    sys.exit(0)
url = next(a for a in args if a.startswith('http://'))
if url.endswith('/auth/login'):
    if os.environ.get('TRANSPORT_FAIL'):
        sys.exit(7)
    print('{"token":"offline-unit-token"}')
    sys.exit(0)
rows = [json.loads(line) for line in record.read_text().splitlines()]
calls = [r for r in rows if r['tool'] == 'curl' and any('/api/crud/' in a for a in r['args'])]
if len(calls) == int(os.environ.get('FAIL_AT', '0')):
    if os.environ.get('TRANSPORT_FAIL'):
        print('mock connection refused', file=sys.stderr)
        sys.exit(7)
    print('{"message":"请选择标准 BRD_BREED 品种"}')
    print(os.environ.get('HTTP_FAIL', '400'), end='')
else:
    print('{"msg":"Created successfully"}')
    print(os.environ.get('HTTP_OK', '201'), end='')
'''


class BreedingSetupTest(unittest.TestCase):
    def run_setup(self, **overrides):
        with tempfile.TemporaryDirectory(prefix=".breeding-unit-", dir=SCRIPTS) as tmp:
            root = Path(tmp)
            for name in ("curl", "psql"):
                path = root / name
                path.write_text(MOCK)
                path.chmod(0o700)
            record = root / "calls.jsonl"
            env = {**os.environ, "PATH": f"{root}:{os.environ['PATH']}",
                   "PSQL": str(root / "psql"), "MOCK_RECORD": str(record),
                   "API_URL": "http://127.0.0.1:3100", "DB_NAME": "phoenix_flock_compat", "CI": "true", "PGHOST": "127.0.0.1"}
            # Do not inherit fixture overrides from a caller's environment.
            for key in ("FAIL_AT", "SQL_FAIL", "ORG_CONTEXT", "BREED", "HTTP_OK", "HTTP_FAIL", "TRANSPORT_FAIL", "FIXTURE_OWNER"):
                env.pop(key, None)
            env.update(overrides)
            result = subprocess.run(["bash", "-c", SETUP], env=env,
                                    capture_output=True, text=True, timeout=15)
            rows = [json.loads(line) for line in record.read_text().splitlines()] if record.exists() else []
            return result, rows

    def seed_calls(self, rows):
        return [r for r in rows if r["tool"] == "curl" and any("/api/crud/" in a for a in r["args"])]

    def test_valid_seed_identity_and_active_master_data(self):
        result, rows = self.run_setup()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("seed 完成", result.stdout)
        self.assertFalse(self.seed_calls(rows), 'legacy setup must never reopen CRUD admission')
        seed = next(r['args'][r['args'].index('-c')+1] for r in rows if r['tool']=='psql' and 'INSERT INTO brd_flocks' in r['args'][r['args'].index('-c')+1])
        with sqlite3.connect(':memory:') as db:
            db.executescript('CREATE TABLE brd_farms(farm_code,farm_name,location,company_code,mapped_site_code,status);CREATE TABLE brd_houses(house_code,house_name,farm_code,capacity,max_capacity,status);CREATE TABLE brd_flocks(flock_no,farm_code,house_code,company_code,site_code,breed_code,placement_date,start_date,initial_qty,current_qty,status);')
            db.executescript(seed)
            self.assertEqual(db.execute('SELECT company_code,mapped_site_code,status FROM brd_farms').fetchall(), [('COMP-TEST','SITE-TEST','ACTIVE')])
            self.assertEqual(db.execute('SELECT house_code,current_qty,breed_code FROM brd_flocks ORDER BY flock_no').fetchall(), [('H-REGR-A01',4800,'HY_LINE_BROWN'),('H-REGR-B01',1000,'HY_LINE_BROWN')])
            today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat()
            self.assertEqual(db.execute('SELECT DISTINCT placement_date,start_date FROM brd_flocks').fetchall(), [(today,today)])
        queries = [r["args"][r["args"].index("-c") + 1] for r in rows if r["tool"] == "psql"]
        self.assertTrue(any("s.status='ACTIVE'" in q and "c.status='ACTIVE'" in q for q in queries))
        self.assertTrue(any("dict_type='BRD_BREED'" in q and "status='ACTIVE'" in q for q in queries))
        for row in rows:
            if row["tool"] == "psql":
                self.assertIn("phoenix_flock_compat", row["args"])
                self.assertIn("ON_ERROR_STOP=1", row["args"])
                self.assertIn("-X", row["args"])

    def test_org_lookup_supports_frozen_baseline_parent_without_company_code(self):
        # Execute the script's real SELECT against the minimal frozen-baseline
        # organization shape. This catches the prior incorrect join on the
        # SITE's NULL company_code, rather than having the mock bless any SQL.
        result, rows = self.run_setup()
        self.assertEqual(result.returncode, 0)
        sql = next(r["args"][r["args"].index("-c") + 1] for r in rows
                   if r["tool"] == "psql" and "FROM sys_organizations" in r["args"][r["args"].index("-c") + 1])
        with sqlite3.connect(":memory:") as db:
            db.execute("CREATE TABLE sys_organizations (id INTEGER, org_code TEXT, parent_id INTEGER, company_code TEXT, org_type TEXT, status TEXT)")
            db.execute("INSERT INTO sys_organizations VALUES (1,'COMP-LAO-AGRI',NULL,'COMP-LAO-AGRI','COMPANY','ACTIVE')")
            db.execute("INSERT INTO sys_organizations VALUES (2,'SITE-MENGSAI-LAYER',1,NULL,'SITE','ACTIVE')")
            self.assertEqual(db.execute(sql).fetchall(), [("COMP-LAO-AGRI|SITE-MENGSAI-LAYER",)])
            db.execute("UPDATE sys_organizations SET company_code='OTHER' WHERE id=2")
            self.assertEqual(db.execute(sql).fetchall(), [])
            db.execute("UPDATE sys_organizations SET company_code='COMP-LAO-AGRI', status='INACTIVE' WHERE id=2")
            self.assertEqual(db.execute(sql).fetchall(), [])
            db.execute("UPDATE sys_organizations SET status='ACTIVE' WHERE id=2")
            db.execute("UPDATE sys_organizations SET status='INACTIVE' WHERE id=1")
            self.assertEqual(db.execute(sql).fetchall(), [])

    def test_nonlocal_api_or_unowned_database_is_rejected_before_access(self):
        for overrides in ({'API_URL':'https://remote.invalid'}, {'API_URL':'http://127.0.0.1.evil.invalid'}, {'API_URL':'http://localhost:3100/path'}, {'CI':'false'}, {'PGHOST':'remote.invalid'}, {'DB_NAME':'business_db'}):
            with self.subTest(overrides=overrides):
                result, rows = self.run_setup(**overrides)
                self.assertEqual(result.returncode,99)
                self.assertFalse(rows)
        result, rows = self.run_setup(FIXTURE_OWNER='not-owned')
        self.assertEqual(result.returncode,99)
        self.assertFalse(any(r['tool']=='curl' for r in rows))
        self.assertFalse(any('DELETE' in str(r['args']) for r in rows))

    def test_http_login_transport_error_is_not_success(self):
        result, rows = self.run_setup(TRANSPORT_FAIL='1')
        self.assertEqual(result.returncode,99)
        self.assertNotIn('seed 完成', result.stdout)
        self.assertFalse(any('DELETE' in str(r['args']) for r in rows))

    def test_missing_or_unsafe_organization_fails_before_http_seed(self):
        for context in ("", "COMP-TEST|", '|SITE-TEST', 'COMP-TEST|SITE-"bad'):
            with self.subTest(context=context):
                result, rows = self.run_setup(ORG_CONTEXT=context)
                self.assertEqual(result.returncode, 99)
                self.assertNotIn("seed 完成", result.stdout)
                self.assertFalse(self.seed_calls(rows))

    def test_missing_or_duplicate_breed_fails_before_http_seed(self):
        for breed in ("", "HY_LINE_BROWN\nHY_LINE_BROWN", "LOCAL"):
            with self.subTest(breed=breed):
                result, rows = self.run_setup(BREED=breed)
                self.assertEqual(result.returncode, 99)
                self.assertNotIn("seed 完成", result.stdout)
                self.assertFalse(self.seed_calls(rows))

    def test_sql_failure_is_fatal_before_http_seed(self):
        result, rows = self.run_setup(SQL_FAIL="1")
        self.assertEqual(result.returncode, 3)
        self.assertIn("mock SQL error", result.stderr)
        self.assertNotIn("seed 完成", result.stdout)
        self.assertFalse(self.seed_calls(rows))

    def test_quantity_expectations_remain_strict(self):
        self.assertIn('assert_eq "A2.1 4800-(5+3)=4792" "4792" "$CUR"', SOURCE)
        self.assertIn('assert_eq "A2.3 修后 4800-(3+3)=4794" "4794" "$CUR2"', SOURCE)
        # A4 deliberately exercises the legacy ungraded path; adding grades
        # would bypass FARM_IN and stop testing the original regression.
        self.assertNotIn("eggs_by_grade", SOURCE)
        self.assertIn("AND ref_no='$FLOCK_B'", SOURCE)
        self.assertIn('trap restore_batches EXIT', SOURCE)
        self.assertNotIn('XHIDDEN-', SOURCE)


if __name__ == "__main__":
    unittest.main()
