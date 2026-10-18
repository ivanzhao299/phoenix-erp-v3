/** Test harness cancellation must poison late receipts, without skipping cleanup. */
export function ownedFixtureDeadline({signal,timeoutMs,now=Date.now}){
  if(!(signal instanceof AbortSignal)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>600000||typeof now!=='function')throw Error('OWNED_FIXTURE_DEADLINE_REQUIRED');
  const startedAt=now(),deadline=startedAt+timeoutMs;
  const expired=()=>signal.aborted||now()<startedAt||now()>=deadline;
  return Object.freeze({expired,assertActive(){if(expired())throw Error('OWNED_FIXTURE_DEADLINE_EXCEEDED');},finalize(record){return expired()?{...record,result:'FAIL',failure:'OWNED_FIXTURE_DEADLINE_EXCEEDED'}:{...record};}});
}
export function assertSuccessfulFixtureRecord(record){if(record?.result!=='PASS')throw Error('OWNED_FIXTURE_FINAL_RECEIPT_FAILED');}
