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
    if 'FROM sys_organizations' in sql:
        print(os.environ.get('ORG_CONTEXT', 'COMP-TEST|SITE-TEST'))
    elif "dict_type='BRD_BREED'" in sql:
        print(os.environ.get('BREED', 'HY_LINE_BROWN'))
    sys.exit(0)
url = next(a for a in args if a.startswith('http://'))
if url.endswith('/auth/login'):
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
                   "API_URL": "http://offline-unit.invalid", "DB_NAME": "isolated_unit_db"}
            # Do not inherit fixture overrides from a caller's environment.
            for key in ("FAIL_AT", "SQL_FAIL", "ORG_CONTEXT", "BREED", "HTTP_OK", "HTTP_FAIL", "TRANSPORT_FAIL"):
                env.pop(key, None)
            env.update(overrides)
            result = subprocess.run(["bash", "-c", SETUP], env=env,
                                    capture_output=True, text=True, timeout=15)
            rows = [json.loads(line) for line in record.read_text().splitlines()]
            return result, rows

    def seed_calls(self, rows):
        return [r for r in rows if r["tool"] == "curl" and any("/api/crud/" in a for a in r["args"])]

    def test_valid_seed_identity_and_active_master_data(self):
        result, rows = self.run_setup()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("seed 完成", result.stdout)
        calls = self.seed_calls(rows)
        self.assertEqual(len(calls), 4)
        payloads = [json.loads(r["args"][r["args"].index("-d") + 1]) for r in calls]
        farm, house_a, house_b, flock = payloads
        self.assertEqual(farm["status"], "ACTIVE")
        for house in (house_a, house_b):
            self.assertEqual(house["status"], "ACTIVE")
            self.assertEqual(house["farm_code"], farm["farm_code"])
        self.assertEqual(flock["house_code"], house_a["house_code"])
        self.assertEqual(flock["farm_code"], farm["farm_code"])
        self.assertEqual(flock["breed_code"], "HY_LINE_BROWN")
        for payload in (farm, flock):
            self.assertEqual(payload["company_code"], "COMP-TEST")
        self.assertEqual(farm["mapped_site_code"], "SITE-TEST")
        self.assertEqual(flock["site_code"], "SITE-TEST")
        for house in (house_a, house_b):
            for retired in ("company_code", "site_code", "store_code"):
                self.assertNotIn(retired, house)
        self.assertEqual(flock["initial_qty"], 4800)
        self.assertEqual(flock["current_qty"], 4800)
        today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
        self.assertEqual(flock["placement_date"], today)
        self.assertEqual(flock["start_date"], today)
        queries = [r["args"][r["args"].index("-c") + 1] for r in rows if r["tool"] == "psql"]
        self.assertTrue(any("s.status='ACTIVE'" in q and "c.status='ACTIVE'" in q for q in queries))
        self.assertTrue(any("dict_type='BRD_BREED'" in q and "status='ACTIVE'" in q for q in queries))
        for row in rows:
            if row["tool"] == "psql":
                self.assertIn("isolated_unit_db", row["args"])
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

    def test_each_http_seed_rejection_stops_and_reports_body(self):
        for index, table in enumerate(("brd_farms", "brd_houses", "brd_houses", "brd_flocks"), 1):
            with self.subTest(index=index):
                result, rows = self.run_setup(FAIL_AT=str(index))
                self.assertEqual(result.returncode, 99)
                self.assertIn(f"Seed {table} failed: HTTP 400", result.stderr)
                self.assertIn("请选择标准 BRD_BREED 品种", result.stderr)
                self.assertNotIn("seed 完成", result.stdout)
                self.assertEqual(len(self.seed_calls(rows)), index)

    def test_server_error_is_not_success(self):
        result, _ = self.run_setup(FAIL_AT="4", HTTP_FAIL="500")
        self.assertEqual(result.returncode, 99)
        self.assertIn("HTTP 500", result.stderr)
        self.assertNotIn("seed 完成", result.stdout)

    def test_transport_error_is_not_success(self):
        result, rows = self.run_setup(FAIL_AT="1", TRANSPORT_FAIL="1")
        self.assertEqual(result.returncode, 99)
        self.assertIn("transport failure", result.stderr)
        self.assertNotIn("seed 完成", result.stdout)
        self.assertEqual(len(self.seed_calls(rows)), 1)

    def test_all_success_statuses_are_accepted(self):
        for status in ("200", "201", "204"):
            with self.subTest(status=status):
                result, _ = self.run_setup(HTTP_OK=status)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("seed 完成", result.stdout)

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


if __name__ == "__main__":
    unittest.main()
