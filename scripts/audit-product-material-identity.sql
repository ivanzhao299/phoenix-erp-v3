-- READ ONLY. Run only against an explicitly authorized data source. No automatic merge/backfill.
BEGIN READ ONLY;
-- Same normalized name identifies candidates only, never equivalence. Keep each role/code and evidence.
WITH objects AS (
 SELECT 'MATERIAL' AS domain,material_code AS code,material_name AS name,spec,unit,
   (SELECT count(*) FROM prc2_request_items WHERE item_code=m.material_code) AS requests,
   (SELECT count(*) FROM prc2_order_items WHERE item_code=m.material_code) AS purchases,
   (SELECT count(*) FROM prc2_receipt_items WHERE item_code=m.material_code) AS receipts,
   (SELECT count(*) FROM inv_batches WHERE material_code=m.material_code) AS batches
 FROM mst_materials m
 UNION ALL
 SELECT 'PRODUCT',product_code,product_name,specs::text,COALESCE(unit_zh,unit),0,0,0,
   (SELECT count(*) FROM inv_batches WHERE product_code=p.product_code) FROM mst_products p
 UNION ALL
 SELECT 'SKU',sku_code,sku_name,spec_code,
   (SELECT base_unit FROM packaging_specs WHERE spec_code=s.spec_code),0,0,0,
   (SELECT count(*) FROM inv_batches WHERE sku_code=s.sku_code) FROM product_skus s
), keyed AS (SELECT *,lower(regexp_replace(btrim(name),'[[:space:]]+','','g')) AS name_key FROM objects)
SELECT a.domain,a.code,a.name,a.spec,a.unit,a.requests,a.purchases,a.receipts,a.batches,
       b.domain AS candidate_domain,b.code AS candidate_code,b.name AS candidate_name,b.spec AS candidate_spec,b.unit AS candidate_unit,
       (a.unit IS NOT DISTINCT FROM b.unit) AS unit_agrees,(a.spec IS NOT DISTINCT FROM b.spec) AS spec_agrees,
       'CANDIDATE_ONLY: same name does not establish shared identity; material barcode / cross-domain mapping absent' AS assessment
FROM keyed a JOIN keyed b ON a.name_key=b.name_key AND a.name_key<>'' AND (a.domain,a.code)<(b.domain,b.code)
ORDER BY a.name_key,a.domain,a.code,b.domain,b.code;
-- Runtime's declared base unit is unit_zh (legacy unit is fallback only); discrepancies require human review.
SELECT s.sku_code,p.product_code,p.unit AS legacy_unit,p.unit_zh AS declared_base_unit,sp.base_unit,sp.display_unit,sp.qty_per_unit
FROM product_skus s JOIN mst_products p ON p.product_code=s.product_code JOIN packaging_specs sp ON sp.spec_code=s.spec_code
WHERE COALESCE(NULLIF(p.unit_zh,''),p.unit) IS DISTINCT FROM sp.base_unit OR sp.qty_per_unit<=0
   OR sp.qty_per_unit::text IN ('NaN','Infinity','-Infinity');
-- Same code in different domains is a separate ambiguity and must never silently resolve by first match.
SELECT m.material_code,m.material_name,s.sku_name,s.product_code,s.grade_code,s.spec_code
FROM mst_materials m JOIN product_skus s ON s.sku_code=m.material_code;
-- Legacy batches are ineligible for the new shared pool, even where today's unit/spec looks plausible.
SELECT batch_no,product_code,sku_code,grade_code_std,spec_code,unit,qty,qty_available,source_type,source_no
FROM inv_batches WHERE qty>0 AND (base_quantity_version IS DISTINCT FROM 1 OR unit IS NULL OR grade_code_std IS NULL);
SELECT id,sku_code,unit_price,min_qty,max_qty FROM sal_price_items WHERE quantity_snapshot IS NULL AND status='ACTIVE';
-- Pending WMS references use polymorphic codes, counted conservatively rather than claiming proven domain identity.
SELECT m.material_code,
 (SELECT count(*) FROM wms_inbound WHERE item=m.material_code AND status NOT IN ('COMPLETED','CANCELLED')) AS pending_inbound_headers,
 (SELECT count(*) FROM wms_inbound_items WHERE product_code=m.material_code) AS inbound_polymorphic_lines,
 (SELECT count(*) FROM wms_outbound_items WHERE product_code=m.material_code) AS outbound_polymorphic_lines
FROM mst_materials m;
ROLLBACK;
