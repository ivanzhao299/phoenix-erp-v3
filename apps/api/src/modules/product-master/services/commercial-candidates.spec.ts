import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ProductMasterService } from './product-master.service';
import { ProductSkusController } from '../controllers/product-skus.controller';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';

function fixture() {
  const rows = [
    {sku_code:'LEGACY',product_code:'P0',grade_code:'G',spec_code:'S',variety_code:null,org_context_required:false,status:'ACTIVE',today:'2026-11-11'},
    {sku_code:'RED',product_code:'PR',grade_code:'G',spec_code:'S',variety_code:'EGG_RED',org_context_required:true,status:'ACTIVE',today:'2026-11-11'},
    {sku_code:'PINK-B',product_code:'PP',grade_code:'G',spec_code:'S',variety_code:'EGG_PINK',org_context_required:true,status:'ACTIVE',today:'2026-11-11'},
  ];
  const state = { actor: {userId:'U1',isGlobal:false,scopeLevel:'COMPANY',allowedCompanyCodes:['C-A'],allowedWarehouseCodes:[],allowedProjectCodes:[],allowedFarmCodes:[],allowedSiteCodes:[]}, sale:true, sqlFailure:false };
  const query = jest.fn(async (sql:string,args:unknown[]=[]) => {
    if (sql.includes('FROM sys_organizations')) return [{org_code:args[0]}];
    if (sql.includes('FROM product_skus s')) return rows;
    if (sql.includes('FROM product_skus WHERE')) return rows.filter(r=>r.sku_code===args[0]);
    if (sql.includes('FROM md_sku_org_scope')) {
      if(state.sqlFailure) throw Object.assign(new Error('fixture DB failure'),{code:'42501'});
      if(args[0]!=='RED'||args[1]!=='C-A') return [];
      return [{scope_type:'COMPANY',scope_code:'C-A',status:'ACTIVE',sale_enabled:state.sale,stock_enabled:true,today:'2026-11-11',effective_date:null,expire_date:null}];
    }
    if (sql.includes('FROM mst_products')) {
      const sku=rows.find(r=>r.product_code===args[0]);
      return sku?[{status:'ACTIVE',unit:'枚',unit_zh:'枚',variety_code:sku.variety_code}]:[];
    }
    if (sql.includes('FROM product_grades')) return [{status:'ACTIVE',is_saleable:true,is_storable:true}];
    if (sql.includes('FROM packaging_specs')) return [{status:'ACTIVE',base_unit:'枚',display_unit:'托',qty_per_unit:30}];
    if (sql.includes('FROM md_product_varieties')) return [{variety_code:args[0],status:'ACTIVE',effective_date:null,expire_date:null}];
    throw new Error(`unexpected query: ${sql}`);
  });
  const manager = {query,queryRunner:{isTransactionActive:true}};
  const em={transaction:jest.fn(async(fn:(m:typeof manager)=>unknown)=>fn(manager))};
  const cls={get:(key:string)=>key==='dataScope'?state.actor:undefined};
  const service=new ProductMasterService(em as never,{} as never,cls as never);
  return {service,state,query,em};
}

describe('company commercial candidates',()=>{
  it('uses authenticated company context and excludes another company managed SKU, not house profiles',async()=>{
    const f=fixture();
    await expect(f.service.listCommercialSkus({companyCode:'C-A',usage:'sale-stock'})).resolves.toEqual([
      expect.objectContaining({sku_code:'LEGACY'}),expect.objectContaining({sku_code:'RED'}),
    ]);
    expect(f.query.mock.calls.some(([sql])=>/brd_|md_egg_source_profiles/.test(sql))).toBe(false);
    expect(f.em.transaction).toHaveBeenCalledTimes(1);
  });
  it('supports stock-only preparation without granting sale eligibility',async()=>{
    const f=fixture();f.state.sale=false;
    expect((await f.service.listCommercialSkus({companyCode:'C-A',usage:'any'})).map(r=>r.sku_code)).toEqual(['LEGACY','RED']);
    expect((await f.service.listCommercialSkus({companyCode:'C-A',usage:'sale-stock'})).map(r=>r.sku_code)).toEqual(['LEGACY']);
  });
  it('does not accept a different company or an absent actor scope',async()=>{
    const f=fixture();
    await expect(f.service.listCommercialSkus({companyCode:'C-B'})).rejects.toBeInstanceOf(ForbiddenException);
    const noActor=new ProductMasterService(f.em as never,{} as never);
    await expect(noActor.listCommercialSkus({companyCode:'C-A'})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('propagates SQL permission failures rather than silently returning no managed candidates',async()=>{
    const f=fixture();f.state.sqlFailure=true;
    await expect(f.service.listCommercialSkus({companyCode:'C-A'})).rejects.toMatchObject({code:'42501'});
  });
  it('keeps the commercial route before detail and applies DataScopeGuard',async()=>{
    expect(Reflect.getMetadata(GUARDS_METADATA,ProductSkusController.prototype.commercialCandidates)).toContain(DataScopeGuard);
    const svc={listCommercialSkus:jest.fn().mockResolvedValue([])};
    await new ProductSkusController(svc as never).commercialCandidates('C-A',undefined,undefined,undefined);
    expect(svc.listCommercialSkus).toHaveBeenCalledWith(expect.objectContaining({companyCode:'C-A',usage:'sale-stock'}));
  });
});
