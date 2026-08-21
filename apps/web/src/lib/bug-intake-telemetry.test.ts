import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBugIntakeSnapshot, recordFailedRequest } from './bug-intake-telemetry';
describe('bug intake telemetry',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('is SSR safe',()=>expect(getBugIntakeSnapshot()).toEqual({consoleErrors:[],failedRequests:[]}));
  it('records and bounds response excerpts',()=>{vi.stubGlobal('window',{});recordFailedRequest({url:'/api/x',method:'GET',status:500,responseExcerpt:'x'.repeat(1300)});const row=getBugIntakeSnapshot().failedRequests[0];expect(row.status).toBe(500);expect(row.responseExcerpt).toHaveLength(1200);});
});
