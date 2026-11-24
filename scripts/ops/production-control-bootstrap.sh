# Evaluated from the reviewed Actions runner payload, never from an old production checkout.
# This sourceable fragment retains FD9 in the calling workflow shell.
: "${PRODUCTION_CONTRACT_B64:?reviewed contract payload required}"
: "${PRODUCTION_PATH_HELPER_B64:?reviewed path helper payload required}"
STATE_DIR="$(node --input-type=module -e 'try { const h=await import("data:text/javascript;base64,"+process.env.PRODUCTION_PATH_HELPER_B64);const c=JSON.parse(Buffer.from(process.env.PRODUCTION_CONTRACT_B64,"base64"));console.log(h.bootstrapPreflight(c)); } catch(e) { console.error(e.message.startsWith("CONFIG_HOLD=")?e.message:"CONTROL_BOOTSTRAP=HOLD");process.exitCode=1; }')"
exec 9<>"$STATE_DIR/mutation.lock"
flock -n 9 || { echo 'PRODUCTION_MUTATION=HOLD_LOCK_BUSY'; exit 24; }
BASE_SSH_COMMAND="${GIT_SSH_COMMAND:-$(command git -c "safe.directory=$DEPLOY_REPO_ROOT" config --get core.sshCommand || true)}"
GIT_SSH_COMMAND="$(BASE_SSH_COMMAND="$BASE_SSH_COMMAND" node --input-type=module -e 'try { const h=await import("data:text/javascript;base64,"+process.env.PRODUCTION_PATH_HELPER_B64);console.log(h.strictSshCommand(process.env.BASE_SSH_COMMAND,process.env.GIT_SSH)); } catch(e) { console.error(e.message.startsWith("CONFIG_HOLD=")?e.message:"CONTROL_BOOTSTRAP=HOLD");process.exitCode=1; }')"
export GIT_SSH_COMMAND
unset BASE_SSH_COMMAND


held_follow_up() {
  if [ -n "${HELD_FOLLOW_UP:-}" ]; then node "$HELD_SOURCE/scripts/ops/production-held-follow-up.mjs" "$1"; fi
}
stage_held_follow_up() {
  HELD_SOURCE="$(mktemp -d "$STATE_DIR/held-$DEPLOY_RUN_ID.XXXXXX")"
  export HELD_SOURCE
  git archive "$TARGET_SHA" scripts/ops | tar -x -C "$HELD_SOURCE"
  HELD_ADMISSION="$(held_follow_up admit)"
  echo "$HELD_ADMISSION"
}
export -f held_follow_up
