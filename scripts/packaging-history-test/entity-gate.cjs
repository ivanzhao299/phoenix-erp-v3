const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const result=JSON.parse(fs.readFileSync('artifacts/packaging-history-local/entity-diff-current.json','utf8'));
if(!/^artifacts\/packaging-history-local\/entity-diff-[0-9]+\.ts$/.test(result.file)||!fs.existsSync(result.file))throw Error('ACTUAL_DIFF_REQUIRED');
const run=spawnSync('bash',['scripts/check-entity-drift-baseline.sh','.github/entity-drift-baseline.txt',result.file],{stdio:'inherit'});
process.exitCode=run.status??1;
