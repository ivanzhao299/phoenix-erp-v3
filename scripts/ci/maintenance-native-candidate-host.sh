#!/usr/bin/env bash
# Exclusive disposable GitHub-hosted VM only. Never a production entrypoint.
set -euo pipefail
umask 077
test "$(id -u)" = 0
test "${NATIVE_FIXTURE_HOSTED-}" = github-hosted-exclusive-vm
case "${NATIVE_FIXTURE_MAJOR-}" in 16|18) ;; *) exit 64 ;; esac
case "${NATIVE_FIXTURE_FLOW-candidate}" in candidate|legacy-first-switch) ;; *) exit 64 ;; esac
case "${NATIVE_FIXTURE_SHA-}" in *[!a-f0-9]*|'') exit 64 ;; esac
test "${#NATIVE_FIXTURE_SHA}" = 40
test -x "${NATIVE_FIXTURE_NODE-}"
test -d "${NATIVE_FIXTURE_SOURCE-}/.git"
test "$(git -c safe.directory="$NATIVE_FIXTURE_SOURCE" -C "$NATIVE_FIXTURE_SOURCE" rev-parse HEAD)" = "$NATIVE_FIXTURE_SHA"
test "$(docker info --format '{{.DockerRootDir}}')" = /var/lib/docker
test -z "$(docker ps -aq)"
test ! -e /.dockerenv
if [ "${NATIVE_FIXTURE_PREMOUNTED-0}" = 1 ]; then
  test -d /data
else
  test ! -e /data
fi
test ! -e /var/lib/phoenix-erp
test ! -e /var/lib/phoenix-background-control
test ! -e /home/phoenix-codex-deploy/production-deployment-state
test -d "${NATIVE_FIXTURE_OUTPUT-}"
test "$(stat -c %u "$NATIVE_FIXTURE_OUTPUT")" = 0
test "$(stat -c %a "$NATIVE_FIXTURE_OUTPUT")" = 700
test ! -e "$NATIVE_FIXTURE_OUTPUT/data.ext4"
native_phase=READONLY_HOST_PREFLIGHT
native_setup_exit() {
  native_exit=$?
  trap - EXIT
  NATIVE_SETUP_EXIT="$native_exit" NATIVE_SETUP_PHASE="$native_phase" "$NATIVE_FIXTURE_NODE" --input-type=module -e '
   import fs from "node:fs";import {execFileSync} from "node:child_process";
   let mount=null;try{mount=JSON.parse(execFileSync("findmnt",["-J","--mountpoint","/data"],{encoding:"utf8",timeout:3000,stdio:["ignore","pipe","ignore"]})).filesystems;}catch{}
   fs.writeFileSync(process.env.NATIVE_FIXTURE_OUTPUT+"/setup-result.json",JSON.stringify({fixtureOnly:true,productionReceipt:false,
    exitCode:Number(process.env.NATIVE_SETUP_EXIT),phase:process.env.NATIVE_SETUP_PHASE,
    backingFileExists:fs.existsSync(process.env.NATIVE_FIXTURE_OUTPUT+"/data.ext4"),observedDataMount:mount,
    cleanupComplete:false,disposition:"OWNED_VM_RETAINED_UNTIL_RUNNER_DISPOSAL"})+"\n",{mode:0o600,flag:"wx"});
  ' || { test "$native_exit" != 0 || native_exit=67; }
  exit "$native_exit"
}
trap native_setup_exit EXIT
"$NATIVE_FIXTURE_NODE" --input-type=module -e '
 import fs from "node:fs";
 fs.writeFileSync(process.env.NATIVE_FIXTURE_OUTPUT+"/host-intent.json",JSON.stringify({fixtureOnly:true,productionReceipt:false,
 sourceSha:process.env.NATIVE_FIXTURE_SHA,major:Number(process.env.NATIVE_FIXTURE_MAJOR),parentShellPid:process.ppid,
 backingFile:process.env.NATIVE_FIXTURE_OUTPUT+"/data.ext4",mountTarget:"/data",rootControl:"/var/lib/phoenix-erp",
 publicControl:"/var/lib/phoenix-background-control",allFixedPathsAbsent:true,dockerContainersEmpty:true,
 disposition:"CREATE_ONLY_IN_EXCLUSIVE_DISPOSABLE_VM"})+"\n",{mode:0o600,flag:"wx"});
'
# Inspect the real root/ancestors and ACLs before creating fixed paths. A runner
# label or environment variable is never substituted for this native check.
"$NATIVE_FIXTURE_NODE" --input-type=module -e '
 const p=process.env.NATIVE_FIXTURE_SOURCE;
 const {CONTRACT}=await import(p+"/scripts/ops/production-config-guard.mjs");
 const {inspectTrustedDirectory}=await import(p+"/scripts/ops/production-trusted-paths.mjs");
 inspectTrustedDirectory("/var/lib",CONTRACT);
'
native_phase=CREATE_OWNED_DATA_VOLUME
native_data_size=4G
if [ "${NATIVE_FIXTURE_FLOW-candidate}" = legacy-first-switch ]; then native_data_size=8G; fi
if [ "${NATIVE_FIXTURE_PREMOUNTED-0}" = 1 ]; then
  test -f "$NATIVE_FIXTURE_OUTPUT/data.ext4"
  mountpoint -q /data
else
  truncate -s "$native_data_size" "$NATIVE_FIXTURE_OUTPUT/data.ext4"
  mkfs.ext4 -q -F "$NATIVE_FIXTURE_OUTPUT/data.ext4"
  mkdir -m 0755 /data
  mount -o loop,nodev,nosuid "$NATIVE_FIXTURE_OUTPUT/data.ext4" /data
fi
"$NATIVE_FIXTURE_NODE" --input-type=module -e '
 import fs from "node:fs"; import {execFileSync} from "node:child_process";
 const mount=JSON.parse(execFileSync("findmnt",["-J","--target","/data"],{encoding:"utf8"}));
 if(mount.filesystems?.length!==1||mount.filesystems[0].target!=="/data"||mount.filesystems[0].fstype!=="ext4")throw Error("OWNED_DATA_MOUNT_REQUIRED");
 fs.writeFileSync(process.env.NATIVE_FIXTURE_OUTPUT+"/host-resources.json",JSON.stringify({fixtureOnly:true,productionReceipt:false,
 sourceSha:process.env.NATIVE_FIXTURE_SHA,major:Number(process.env.NATIVE_FIXTURE_MAJOR),backingFile:process.env.NATIVE_FIXTURE_OUTPUT+"/data.ext4",
 dataMount:mount.filesystems[0],rootMount:execFileSync("findmnt",["-T","/","-no","TARGET,SOURCE,FSTYPE"],{encoding:"utf8"}).trim(),
 disposition:"OWNED_VM_RETAINED_UNTIL_RUNNER_DISPOSAL",cleanupComplete:false},null,2)+"\n",{mode:0o600,flag:"wx"});
'
touch /data/.phoenix-data-volume
chmod 0444 /data/.phoenix-data-volume
native_phase=CREATE_OWNED_TEST_CONTROL_PATHS
mkdir -m 0700 /var/lib/phoenix-erp
mkdir -m 0700 /var/lib/phoenix-erp/production-deployment-state
mkdir -m 0700 /var/lib/phoenix-erp/production-checkout-recovery
"$NATIVE_FIXTURE_NODE" --input-type=module -e '
 import fs from "node:fs";
 fs.writeFileSync("/var/lib/phoenix-erp/production-deployment-state/native-candidate-host-fixture.json",JSON.stringify({schema:"phoenix.exclusive-native-host-fixture/v1",
 fixtureOnly:true,productionReceipt:false,sourceSha:process.env.NATIVE_FIXTURE_SHA,major:Number(process.env.NATIVE_FIXTURE_MAJOR),
 parentShellPid:process.ppid,createdAt:new Date().toISOString(),resourceDirectory:process.env.NATIVE_FIXTURE_OUTPUT})+"\n",{mode:0o600,flag:"wx"});
'
mkdir -m 0555 /var/lib/phoenix-background-control
mkdir -m 0755 /data/maintenance-native-pg /data/maintenance-native-uploads
chown 1000:1000 /data/maintenance-native-uploads
native_phase=CREATE_INDEPENDENT_TEST_SOURCE
git -c safe.directory="$NATIVE_FIXTURE_SOURCE" -c core.hooksPath=/dev/null clone --quiet --no-local --no-hardlinks --no-checkout "$NATIVE_FIXTURE_SOURCE" /data/phoenix-erp
git -C /data/phoenix-erp -c core.hooksPath=/dev/null checkout --quiet --detach "$NATIVE_FIXTURE_SHA"
git -C /data/phoenix-erp diff --quiet HEAD
test -d /data/phoenix-erp/.git
ln -s "$NATIVE_FIXTURE_SOURCE/node_modules" /data/phoenix-erp/node_modules
ln -s "$NATIVE_FIXTURE_SOURCE/apps/api/node_modules" /data/phoenix-erp/apps/api/node_modules
lock=/var/lib/phoenix-erp/production-deployment-state/mutation.lock
(set -o noclobber; : > "$lock")
chmod 0600 "$lock"
exec 9<>"$lock"
flock -n 9
cd /data/phoenix-erp
# Keep this exact shell alive as Node's direct parent holding genuine FD9.
native_phase=RUN_NATIVE_DEFAULT_COLLECTOR
set +e
if [ "${NATIVE_FIXTURE_FLOW-candidate}" = legacy-first-switch ]; then
  "$NATIVE_FIXTURE_NODE" scripts/ci/maintenance-full-first-switch.fixture.mjs
else
  "$NATIVE_FIXTURE_NODE" scripts/ci/maintenance-native-candidate-host.fixture.mjs
fi
result=$?
set -e
# Export only fixed non-secret receipts; never logs, source, .env or PG data.
export NATIVE_FIXTURE_RESULT="$result"
native_phase=EXPORT_FIXED_RECEIPTS
"$NATIVE_FIXTURE_NODE" --input-type=module -e '
 import fs from "node:fs";
 const source="/data/phoenix-erp/artifacts/maintenance-native-candidate-host/";
 const output=process.env.NATIVE_FIXTURE_OUTPUT;
 for(const name of ["result.json","candidate-binding.json","root-release.json","guard-counterexamples.json","protocol-file-manifest.json"]){
  if(fs.existsSync(source+name))fs.copyFileSync(source+name,output+"/"+name,fs.constants.COPYFILE_EXCL);
 }
 fs.writeFileSync(output+"/process-result.json",JSON.stringify({fixtureOnly:true,productionReceipt:false,exitCode:Number(process.env.NATIVE_FIXTURE_RESULT)})+"\n",{flag:"wx",mode:0o600});
'
exit "$result"
