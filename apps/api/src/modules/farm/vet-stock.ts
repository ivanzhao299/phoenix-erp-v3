import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataScopeContext } from '../org/services/data-scope.service';

export const batchIdentity = `b.material_code = mat.material_code AND b.item_type = 'MATERIAL'
  AND b.sku_code IS NULL AND (b.material_type IS NULL OR b.material_type = 'VET_DRUG')`;
export const stockUnit = "COALESCE(NULLIF(trim(b.unit),''),mat.unit)";

export async function resolveVetMaterial(db: {query:(sql:string,args:unknown[])=>Promise<any[]>},
  material: string | undefined, kind: 'VACCINE'|'MEDICATION') {
  if (!material?.trim()) throw new BadRequestException('请选择实际库存物料。历史计划可选择实际疫苗，或取消后重建');
  const [row]=await db.query(`SELECT mat.material_code,mat.material_name,mat.unit,mat.vet_withdraw_days
    FROM brd_vet_material_catalog mat
    WHERE mat.material_code=$1 AND mat.status='ACTIVE' AND mat.effective_vet_kind=$2
      AND NULLIF(trim(mat.unit),'') IS NOT NULL FOR SHARE OF mat`,[material.trim(),kind]);
  if (!row) throw new BadRequestException('请在物料档案确认兽药用途分类、启用状态及库存单位');
  return row;
}

export async function assertVetSiteAccess(db: {query:(sql:string,args:unknown[])=>Promise<any[]>},
  scope: DataScopeContext | undefined, site: string, company: string) {
  if (!scope) throw new ForbiddenException('缺少养殖数据范围');
  if (scope.isGlobal) return;
  if (!scope.allowedCompanyCodes.includes(company)) throw new ForbiddenException('无权访问该公司兽药数据');
  if (scope.allowedSiteCodes.length) {
    if (!scope.allowedSiteCodes.includes(site)) throw new ForbiddenException('无权访问该场站兽药数据');
    return;
  }
  const farms=scope.allowedFarmCodes || [];
  const [farm]=await db.query(`SELECT 1 FROM brd_farms WHERE mapped_site_code=$1 AND company_code=$2
    ${farms.length ? 'AND farm_code=ANY($3)' : ''} LIMIT 1`,farms.length ? [site,company,farms] : [site,company]);
  if (!farm) throw new ForbiddenException('无权访问该农场所在场站的兽药数据');
}

export function assertStockWarehouse(scope: DataScopeContext | undefined, warehouse?: string) {
  if (!scope || (!scope.isGlobal && (!scope.allowedWarehouseCodes?.length ||
      (warehouse && !scope.allowedWarehouseCodes.includes(warehouse))))) {
    throw new ForbiddenException('无权访问该药品仓库存');
  }
}

export function stockQuantity(value: unknown): number {
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isSafeInteger(Math.round(qty * 1000))
    || Math.abs(qty - Math.round(qty * 1000) / 1000) > 1e-12 || Math.round(qty * 1000) === 0) {
    throw new BadRequestException('实际库存数量必须大于零，最多三位小数');
  }
  return qty;
}

export function checkStockUnit(unit: string | null, requested?: string) {
  if (!unit || (requested && requested !== unit)) {
    throw new BadRequestException('耗用单位与库存批次单位不一致，请按库存单位登记');
  }
}

export async function listVetLots(db: {query: (sql:string, args:unknown[])=>Promise<any[]>},
  scope: DataScopeContext | undefined, code: string, site: string, company: string, day: string,
  warehouse?: string, vaccineOnly = false, lockedBatches?: string[]) {
  assertStockWarehouse(scope, warehouse);
  const args: unknown[] = [code, site, company, day];
  const filters = [
    'mat.material_code=$1',
    "mat.status='ACTIVE'","NULLIF(trim(mat.unit),'') IS NOT NULL",
    "b.status = 'AVAILABLE'", 'LEAST(b.qty,COALESCE(b.qty_available,b.qty,0)) > 0',
    '(b.expire_date IS NULL OR b.expire_date >= $4::date)',
    '(b.inbound_date IS NULL OR b.inbound_date <= $4::date)',
    "(b.store_code IS NULL OR b.store_code IN ('ALL',$2))",
    '(b.company_code IS NULL OR b.company_code = $3)',
    'COALESCE(b.company_code,w.company_code) = $3',
    "COALESCE(NULLIF(b.store_code,'ALL'),w.site_code) = $2",
    "w.domain = 'OPERATIONAL'", "w.status = 'ACTIVE'", "w.type = 'MEDICINE'",
    '(w.site_code IS NULL OR w.site_code = $2)', '(w.company_code IS NULL OR w.company_code = $3)',
  ];
  if (lockedBatches?.length) filters.push(`b.batch_no = ANY($${args.push(lockedBatches)})`);
  if (warehouse) filters.push(`b.warehouse_code = $${args.push(warehouse)}`);
  else if (!scope!.isGlobal) filters.push(`b.warehouse_code = ANY($${args.push(scope!.allowedWarehouseCodes)})`);
  filters.push(vaccineOnly ? "mat.effective_vet_kind='VACCINE'" : "mat.effective_vet_kind='MEDICATION'");
  return db.query(`SELECT b.batch_no,mat.material_code,b.product_code,
    LEAST(b.qty,COALESCE(b.qty_available,b.qty,0)) AS qty_available,${stockUnit} AS unit,b.expire_date::text,
    b.inbound_date::text,b.warehouse_code,b.manufacturer_batch_no
    FROM brd_vet_material_catalog mat JOIN inv_batches b ON ${batchIdentity}
    JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code WHERE ${filters.join(' AND ')}
    ORDER BY b.expire_date ASC NULLS LAST,b.inbound_date ASC NULLS LAST,b.created_at,b.batch_no ${lockedBatches ? 'FOR UPDATE OF b FOR SHARE OF w' : ''}`,args);
}
