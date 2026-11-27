import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

export type EggSourceReleaseEvidence = {
  readonly commit: string;
  readonly apiDigest: string;
  readonly webDigest: string;
  readonly run: string;
  readonly deployRun: string;
  readonly resultDigest: string;
  readonly expiresAt: string;
};

const defaultPath='/etc/phoenix-egg-source-cutover.json';

export async function readEggSourceReleaseEvidence():Promise<EggSourceReleaseEvidence|null> {
  const testPath=process.env.NODE_ENV==='test' ? process.env.EGG_SOURCE_TEST_RELEASE_EVIDENCE : undefined;
  let file:Awaited<ReturnType<typeof open>>|undefined;
  try {
    file=await open(testPath??defaultPath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const stat=await file.stat();
    if (!stat.isFile()||(!testPath&&stat.uid!==0)||(stat.mode&0o022)!==0||stat.size>4096) return null;
    const parsed=JSON.parse(await file.readFile('utf8')) as EggSourceReleaseEvidence;
    const digest=/^sha256:[a-f0-9]{64}$/;
    const expiry=Date.parse(parsed.expiresAt);
    if (!/^[a-f0-9]{40}$/.test(parsed.commit)||!digest.test(parsed.apiDigest)||!digest.test(parsed.webDigest)||
        !/^[1-9][0-9]*\/[1-9][0-9]*$/.test(parsed.run)||!/^[1-9][0-9]*\/[1-9][0-9]*$/.test(parsed.deployRun)||!/^[a-f0-9]{64}$/.test(parsed.resultDigest)||
        !Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+48*60*60*1000) return null;
    if (!testPath) {
      const identity=createHash('sha256').update([parsed.commit,parsed.apiDigest,parsed.webDigest,parsed.run,parsed.deployRun,parsed.resultDigest].join('|')).digest('hex');
      const web=await fetch('http://web:3000/egg-source-release-identity',{
        redirect:'error',cache:'no-store',signal:AbortSignal.timeout(1500),
      });
      if (!web.ok||web.headers.get('content-type')!=='text/plain'||
        web.headers.get('content-length')!=='64'||(await web.text())!==identity) return null;
    }
    return {commit:parsed.commit,apiDigest:parsed.apiDigest,webDigest:parsed.webDigest,run:parsed.run,
      deployRun:parsed.deployRun,resultDigest:parsed.resultDigest,expiresAt:new Date(expiry).toISOString()};
  } catch {
    return null;
  } finally {
    await file?.close();
  }
}
