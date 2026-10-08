import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const REVISION = /^[a-f0-9]{40}$/;
export const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
export function executionEnv() {
  // No inherited credentials, Compose routing, flags or remote Docker context.
  return { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    DOCKER_CONFIG: '/home/phoenix-codex-deploy/.docker', DOCKER_HOST: 'unix:///var/run/docker.sock' };
}
export function captureRuntime(run = (args) => execFileSync('docker', args, { env: executionEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()) {
  const result = {};
  for (const service of ['api', 'web']) {
    const imageId = run(['inspect', `phoenix-v3-${service}`, '--format', '{{.Image}}']);
    if (!IMAGE_ID.test(imageId)) throw new Error(`RUNTIME_HOLD=${service.toUpperCase()}_IMAGE_ID_UNAVAILABLE`);
    const revision = run(['image', 'inspect', imageId, '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}']);
    if (!REVISION.test(revision)) throw new Error(`RUNTIME_HOLD=${service.toUpperCase()}_REVISION_UNAVAILABLE`);
    result[service] = { imageId, revision };
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(captureRuntime())); }
  catch (error) { console.error(error.message.startsWith('RUNTIME_HOLD=') ? error.message : 'RUNTIME_HOLD=INSPECTION_FAILED'); process.exitCode = 1; }
}
