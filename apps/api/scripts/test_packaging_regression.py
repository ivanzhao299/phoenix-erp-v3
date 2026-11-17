#!/usr/bin/env python3
"""Offline setup checks only; the live packaging assertions are never mocked as PASS."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parent
SETUP = (SCRIPTS / 'packaging-regression.sh').read_text().split('cyan "▶ T1:', 1)[0]
HOUSE = 'HSE-00000000000000000001'
MOCK = r'''#!/usr/bin/env python3
import json,os,pathlib,sys
args=sys.argv[1:]; tool=pathlib.Path(sys.argv[0]).name; record=pathlib.Path(os.environ['MOCK_RECORD'])
with record.open('a') as out: out.write(json.dumps({'tool':tool,'args':args})+'\n')
if tool=='psql':
 if os.environ.get('SQL_FAIL'): sys.exit(3)
 sql=args[args.index('-c')+1]
 if 'shobj_description' in sql: print(os.environ.get('FIXTURE_OWNER','phoenix-ci-breeding-regression'))
 elif 'FROM sys_organizations' in sql: print('COMP-TEST|SITE-TEST')
 elif 'SELECT COUNT(*) FROM pkg_shifts' in sql: print('2')
 sys.exit(0)
url=next(a for a in args if a.startswith('http://'))
if url.endswith('/auth/login'): print('{"token":"offline-unit-token"}');sys.exit(0)
if os.environ.get('HTTP_FAIL'): print('{"message":"fixture rejected"}\n400');sys.exit(0)
rows=[json.loads(line) for line in record.read_text().splitlines()]
if url.endswith('/crud/brd_houses'): value={'houseCode':os.environ.get('HOUSE_CODE','HSE-00000000000000000001')}
elif url.endswith('/packaging/shifts'): value={'id':100+sum(r['tool']=='curl' and any(a.endswith('/packaging/shifts') for a in r['args']) for r in rows)}
else: value={'msg':'Created successfully'}
print(json.dumps(value,separators=(',',':'))+'\n201')
'''


class PackagingSetupTest(unittest.TestCase):
    def run_setup(self, **overrides):
        with tempfile.TemporaryDirectory(prefix='.packaging-unit-', dir=SCRIPTS) as directory:
            root = Path(directory)
            for name in ('curl', 'psql'):
                p = root / name
                p.write_text(MOCK)
                p.chmod(0o700)
            record = root / 'calls.jsonl'
            env = {**os.environ, 'PATH':f"{root}:{os.environ['PATH']}", 'PSQL':str(root/'psql'), 'MOCK_RECORD':str(record), 'CI':'true', 'PGHOST':'127.0.0.1', 'DB_NAME':'phoenix_flock_compat', 'API_URL':'http://127.0.0.1:3100'}
            for key in ('SQL_FAIL','FIXTURE_OWNER','HOUSE_CODE','HTTP_FAIL'):
                env.pop(key, None)
            env.update(overrides)
            result = subprocess.run(['bash','-c',SETUP], env=env, capture_output=True, text=True, timeout=15)
            rows = [json.loads(line) for line in record.read_text().splitlines()] if record.exists() else []
            return result, rows

    def test_generated_house_identity_reaches_both_real_legacy_shift_requests(self):
        result, rows = self.run_setup()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        posts = [r for r in rows if r['tool']=='curl' and '-d' in r['args'] and any('/api/crud/' in a or '/api/packaging/shifts' in a for a in r['args'])]
        payloads = [json.loads(r['args'][r['args'].index('-d')+1]) for r in posts]
        self.assertEqual(len(payloads),4)
        farm, house, first, second = payloads
        self.assertNotIn('house_code',house)
        self.assertEqual(house['farm_code'],farm['farm_code'])
        self.assertEqual([first['house_code'],second['house_code']],[HOUSE,HOUSE])
        for retired in ('company_code','site_code','store_code'):
            self.assertNotIn(retired,house)
        self.assertTrue(any(HOUSE in str(r['args']) and 's.id IN' in str(r['args']) for r in rows))

    def test_missing_or_invalid_generated_identity_stops_before_shifts(self):
        for code in ('','H-REGR-PKG','HSE-INVALID'):
            with self.subTest(code=code):
                result, rows = self.run_setup(HOUSE_CODE=code)
                self.assertEqual(result.returncode,99)
                self.assertFalse(any(any(a.endswith('/packaging/shifts') for a in r['args']) for r in rows))

    def test_nonlocal_api_or_nonfixture_database_never_reaches_tools(self):
        for args in ({'API_URL':'http://remote.invalid'},{'API_URL':'http://127.0.0.1.evil.invalid'},{'PGHOST':'remote.invalid'},{'DB_NAME':'business_db'},{'CI':'false'}):
            with self.subTest(args=args):
                result, rows = self.run_setup(**args)
                self.assertEqual(result.returncode,99)
                self.assertEqual(rows,[])

    def test_unowned_database_stops_before_login_or_cleanup(self):
        result, rows = self.run_setup(FIXTURE_OWNER='other')
        self.assertEqual(result.returncode,99)
        self.assertFalse(any(r['tool']=='curl' or 'DELETE' in str(r['args']) for r in rows))

    def test_sql_failure_is_fatal(self):
        result, rows = self.run_setup(SQL_FAIL='1')
        self.assertEqual(result.returncode,99)
        self.assertFalse(any(r['tool']=='curl' for r in rows))

    def test_http_seed_rejection_preserves_failure_and_stops(self):
        result, rows = self.run_setup(HTTP_FAIL='1')
        self.assertEqual(result.returncode,99)
        self.assertIn('HTTP 400',result.stderr)
        self.assertFalse(any(any(a.endswith('/packaging/shifts') for a in r['args']) for r in rows))


if __name__ == '__main__':
    unittest.main()
