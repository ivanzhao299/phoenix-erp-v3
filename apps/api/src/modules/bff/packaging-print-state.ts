/** Events must be ordered by server_at,id (the persisted server ordering). */
export function packingPrintBlocked(events:any[],boxId:string):boolean {
 const requests=events.filter(e=>e.event_type==='PRINT_REQUEST'&&e.box_id===boxId);
 return requests.some(request=>{
  const results=events.filter(e=>e.event_type==='PRINT_RESULT'&&e.payload?.requestId===request.id);
  const last=results[results.length-1];
  return !last||!['DISPATCHED','FAILED'].includes(last.payload?.type);
 });
}
