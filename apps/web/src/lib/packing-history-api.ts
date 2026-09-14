/** Explicit commands never refresh/replay authentication or print implicitly. */
export function packingIdentity(user: unknown): string {
  if (!user) return '';
  const u=user as Record<string,unknown>;
  return JSON.stringify([u.id,u.userId,u.user_id,u.username,u.roles,u.permissions,u.perms_version,u.companyCode,u.farmCode]);
}
export async function packingHistoryRequest(path:string,options:{body?:unknown;key?:string;signal?:AbortSignal;timeoutMs?:number}={}) {
  const token=sessionStorage.getItem('phoenix_token')||localStorage.getItem('phoenix_token')||'';
  const abort=new AbortController();
  const cancel=()=>abort.abort();options.signal?.addEventListener('abort',cancel,{once:true});
  if(options.signal?.aborted)abort.abort();
  const timer=setTimeout(cancel,options.timeoutMs??30000);
  try {
    const response=await fetch(`/api/packaging/terminal/${path}`,{method:options.body===undefined?'GET':'POST',cache:'no-store',signal:abort.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(options.key?{'Idempotency-Key':options.key}:{})},
      body:options.body===undefined?undefined:JSON.stringify(options.body)});
    if(response.status===401)throw new Error('会话已失效，请重新登录后核实本单；操作没有自动重放');
    let result:any;try{result=await response.json();}catch{throw new Error('服务器响应无法核实；请查询操作结果，未自动重发');}
    if(!response.ok||result?.code!==200)throw new Error(typeof result?.message==='string'?result.message:`读取或操作失败（${response.status}）`);
    return result.data;
  }catch(e){if(abort.signal.aborted)throw new Error('请求已取消或超时；写入结果未知，请查询原操作，未自动重发');throw e;}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
