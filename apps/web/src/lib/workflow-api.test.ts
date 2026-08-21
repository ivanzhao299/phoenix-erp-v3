import { afterEach, describe, expect, it, vi } from 'vitest';
import { workflowApi } from './workflow-api';
describe('workflow API contracts',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('loads definitions',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[]})});vi.stubGlobal('fetch',fetch);await workflowApi.definitions();expect(fetch.mock.calls[0][0]).toBe('/api/workflow/definitions');});
  it('encodes instance filters',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[]})});vi.stubGlobal('fetch',fetch);await workflowApi.instances('IN PROGRESS');expect(fetch.mock.calls[0][0]).toContain('status=IN%20PROGRESS');});
  it('posts cancellation comments',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({})});vi.stubGlobal('fetch',fetch);await workflowApi.cancelInstance(7,'why');expect(fetch.mock.calls[0][1]).toMatchObject({method:'POST',body:'{"comment":"why"}'});});
  it('surfaces API errors',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:500,json:async()=>({message:'boom'})}));await expect(workflowApi.todo()).rejects.toThrow('boom');});
});
