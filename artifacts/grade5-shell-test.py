import os, pathlib, subprocess, tempfile, json, yaml
workflow=pathlib.Path('.github/workflows/egg-grade5-sku-manifest-production-rollout.yml')
y=yaml.safe_load(workflow.read_text()); steps=y['jobs']['preflight']['steps']
execute=next(s['run'] for s in steps if s.get('id')=='execute').replace('${{ inputs.revision }}','test-revision')
validate=next(s['run'] for s in steps if s.get('name')=='Validate strict audit artifact and rc')
final=steps[-1]['run']
for job in y['jobs'].values():
 for step in job['steps']:
  if 'run' in step:
   p=subprocess.run(['bash','-n'],input=step['run'],text=True,capture_output=True)
   assert p.returncode==0,p.stderr
assert steps[-2]['uses']=='actions/upload-artifact@v4' and steps[-2]['if']=='always()'
ssh='''#!/usr/bin/env python3
import os,sys,subprocess,pathlib
s=sys.stdin.read().replace('/tmp/phoenix-production-readonly-audit-',os.environ['CASE_ROOT']+'/phoenix-production-readonly-audit-')
if os.environ['CASE']=='ssh255': sys.exit(255)
cmd=sys.argv[-1]
assert "ASSERTION_SQL_PATH='scripts/ops/readonly-audits/egg-grade5-production-snapshot.sql'" in cmd
assert "AUDIT_BUNDLE_REVISION='test-revision'" in cmd
sys.exit(subprocess.run(['bash','-c',cmd],input=s,text=True).returncode)
'''
scp='''#!/usr/bin/env python3
import os,sys,pathlib,shutil
assert '-P' in sys.argv and '-p' not in sys.argv
src=sys.argv[-2].split(':',1)[1].replace('/tmp/',os.environ['CASE_ROOT']+'/')
isresult=src.endswith('result.json'); case=os.environ['CASE']
if (case=='result-fail' and isresult) or (case=='log-fail' and not isresult): sys.exit(9)
if not pathlib.Path(src).exists(): sys.exit(1)
shutil.copyfile(src,sys.argv[-1])
if isresult and case in ('empty','malformed'): pathlib.Path(sys.argv[-1]).write_text('' if case=='empty' else '{bad')
'''
for case in ('success','ssh255','result-fail','log-fail','sql-fail','empty','malformed','tamper'):
 with tempfile.TemporaryDirectory(prefix='grade5-test-') as td:
  root=pathlib.Path(td); bindir=root/'bin'; bindir.mkdir()
  for name,script in [('ssh',ssh),('scp',scp)]:
   p=bindir/name; p.write_text(script); p.chmod(0o700)
  repo=root/'repo'; script=repo/'scripts/ops/run-production-readonly-audit.sh'; script.parent.mkdir(parents=True)
  script.write_text('echo simulated-readonly-audit\nexit '+('7' if case=='sql-fail' else '0')+'\n')
  env=dict(os.environ,PATH=str(bindir)+':'+os.environ['PATH'],CASE=case,CASE_ROOT=td,RUNNER_TEMP=td,AUDIT_RUN_ID='12345',DEPLOY_HOST='stub',DEPLOY_USER='stub',DEPLOY_PORT='2222',DEPLOY_SSH_KEY='dummy',DEPLOY_PROXY_KEY='dummy',DEPLOY_PROXY_HOST='',DEPLOY_PATH=str(repo),GITHUB_OUTPUT=str(root/'outputs'))
  def run(s,e=env): return subprocess.run(['bash','--noprofile','--norc','-eo','pipefail','-c',s],cwd=root,env=e,text=True,capture_output=True)
  result=run(execute); outputs=dict(line.split('=',1) for line in (root/'outputs').read_text().splitlines())
  assert outputs['ssh_rc']==('255' if case=='ssh255' else '7' if case=='sql-fail' else '0'),outputs
  payload=root/'grade5-preflight-payload.json'
  if case=='tamper':
   p=json.loads(payload.read_text()); p['ssh_rc']=99; payload.write_text(json.dumps(p))
  check=run(validate,dict(env,EXPECTED_RUN_ID='12345',**{'EXECUTE_'+k.upper():v for k,v in outputs.items()}))
  end=run(final)
  if case=='success': assert result.returncode==check.returncode==end.returncode==0,(result.stderr,check.stderr,end.stderr)
  else: assert result.returncode or check.returncode or end.returncode,case
  if case in ('ssh255','result-fail','log-fail','sql-fail'): assert result.returncode!=0,case
  if case=='sql-fail': assert json.loads(payload.read_text())['status']=='FAIL' and end.returncode!=0
  if case=='tamper': assert check.returncode!=0 and end.returncode!=0
  if case in ('empty','malformed'): assert check.returncode!=0 and end.returncode!=0
  assert (root/'grade5-preflight.log').exists() or case in ('ssh255','log-fail')
  print(case, 'execute=',result.returncode,'validate=',check.returncode,'final=',end.returncode,outputs)
print('PASS: YAML, extracted bash syntax, actual shell/remote Python, transport and tamper cases')
