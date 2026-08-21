import { describe, expect, it, vi } from 'vitest';
vi.mock('./api-client',()=>({default:vi.fn().mockResolvedValue({})}));
import request from './api-client';
import { lbl, shareholderApi } from './shareholder-api';
describe('shareholder API helpers',()=>{
  it.each([[undefined,'—'],[null,'—'],['A','甲'],['B','B']] as const)('labels %#',(key,expected)=>expect(lbl({A:'甲'},key)).toBe(expected));
  it('encodes project filter',async()=>{await shareholderApi.listBeneficial('P A');expect(request).toHaveBeenCalledWith('/shareholders/beneficial?projectCode=P%20A');});
  it('omits empty project filter',async()=>{await shareholderApi.listEquity();expect(request).toHaveBeenCalledWith('/shareholders/equity');});
});
