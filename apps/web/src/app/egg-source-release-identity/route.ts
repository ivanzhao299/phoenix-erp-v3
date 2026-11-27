import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

export const dynamic='force-dynamic';

export async function GET() {
  let file:Awaited<ReturnType<typeof open>>|undefined;
  const headers={'Cache-Control':'no-store','Content-Type':'text/plain'};
  try {
    file=await open('/etc/phoenix-egg-source-release-identity',constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const stat=await file.stat();
    if (stat.isFile()&&stat.uid===0&&(stat.mode&0o022)===0&&stat.size===64) {
      const identity=await file.readFile('utf8');
      if (/^[a-f0-9]{64}$/.test(identity)) return new Response(identity,{headers:{...headers,'Content-Length':'64'}});
    }
  } catch {
    // Only the production release workflow can make this instance eligible.
  } finally {
    await file?.close();
  }
  return new Response(null,{status:404,headers});
}
