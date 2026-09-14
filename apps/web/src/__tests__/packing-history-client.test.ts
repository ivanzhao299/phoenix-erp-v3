/** @vitest-environment jsdom */
import {beforeEach,expect,it,vi} from 'vitest';
import {packingHistoryRequest} from '@/lib/packing-history-api';
beforeEach(()=>{sessionStorage.clear();localStorage.clear();vi.restoreAllMocks();});
it.each([undefined,{packingCode:'TEST'}])('401 does not refresh or replay %j',async body=>{const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:401}));await expect(packingHistoryRequest('history/TEST',{body})).rejects.toThrow('会话已失效');expect(fetch).toHaveBeenCalledTimes(1);});
it('preserves explicit idempotency key and original production date in a write',async()=>{const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{"code":200,"data":{"ok":true}}'));await packingHistoryRequest('warehouse/confirm',{key:'TEST-KEY',body:{productionDate:'2026-01-02'}});expect(fetch.mock.calls[0][1]).toMatchObject({method:'POST',headers:{'Idempotency-Key':'TEST-KEY'},body:'{"productionDate":"2026-01-02"}'});});
it('rejects HTTP-200 application errors rather than claiming success',async()=>{vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{"code":409,"message":"EVIDENCE_PARTIAL"}'));await expect(packingHistoryRequest('warehouse/confirm',{body:{}})).rejects.toThrow('EVIDENCE_PARTIAL');});
it('rejects non-JSON responses without replay',async()=>{const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('<html>proxy</html>'));await expect(packingHistoryRequest('history')).rejects.toThrow('无法核实');expect(fetch).toHaveBeenCalledTimes(1);});
