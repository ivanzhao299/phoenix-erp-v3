import { birdCount, reportLossBalance } from './daily-stock-policy';
import { deriveOrgScope, dailyLogScopeWhere, scopeWhere } from './farm.service';

describe('daily loss policy', () => {
  it('deducts both losses and reverses corrections without using initial_qty', () => {
    expect(reportLossBalance(9000,undefined,{mortality_qty:30,elimination_qty:20})).toBe(8950);
    expect(reportLossBalance(8950,{mortality_qty:30,elimination_qty:20},{mortality_qty:30,elimination_qty:20})).toBe(8950);
    expect(reportLossBalance(8950,{mortality_qty:30,elimination_qty:20},{mortality_qty:10,elimination_qty:0})).toBe(8990);
  });
  it.each([-1,NaN,Infinity,1.5,null,'',true])('rejects invalid counts %p',(value)=>expect(()=>birdCount(value,'count')).toThrow());
  it('rejects negative stock rather than silently clamping to zero',()=>expect(()=>reportLossBalance(1,undefined,{mortality_qty:2})).toThrow('超过'));
  it('does not expand explicit site grants with projected parent company or legacy store',()=>{
    const scope=deriveOrgScope({user:{storeCode:'LPH-OTHER'},dataScope:{isGlobal:false,
      allowedCompanyCodes:['C'],allowedFarmCodes:['F','OTHER'],allowedSiteCodes:['S'],
      allowedBreedingFarmCodes:['F'],allowedBreedingSiteCodes:['S'],allowedBreedingCompanyCodes:[]}});
    expect(scope.farmCodes).toEqual(['F']); expect(scope.companyCodes).toEqual([]);
    expect(dailyLogScopeWhere({isGlobal:false,farmCode:null,siteCode:null},[])).toBe('1=0');
    expect(scopeWhere({isGlobal:false,farmCode:null,siteCode:null},[])).toBe('1=0');
  });
});
