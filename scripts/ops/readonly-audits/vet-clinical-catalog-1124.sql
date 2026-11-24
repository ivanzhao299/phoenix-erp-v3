-- Clinical catalog provenance and document usage. Aggregates exclude patient, operator and customer information.
WITH candidates AS (
  SELECT medication_code,medication_name,status,product_type,unit_code,specification,store_code,created_at::date AS created_on
    FROM brd_medications
   WHERE medication_code IN ('MED-001','MED-002','MED-003','MED-004','MED-005','MED-006','MED-007','MED-008','LPH-MED-045')
)
SELECT 'VET_CLINICAL_CATALOG' AS section,c.*,
       (SELECT count(*) FROM sys_dict d WHERE d.dict_code=c.medication_code) AS dictionary_code_matches,
       (SELECT count(*) FROM brd_vaccinations v WHERE c.medication_code IN (v.vaccine_code,v.vaccine)) AS vaccination_records,
       (SELECT count(*) FROM brd_medication_records r WHERE r.medication_code=c.medication_code) AS medication_records,
       (SELECT count(*) FROM inv_batches b WHERE c.medication_code IN (b.product_code,b.material_code)) AS inventory_batches,
       (SELECT count(*) FROM brd_vaccination_issue_lines i WHERE i.vaccine_code=c.medication_code) AS vaccination_allocations,
       (SELECT count(*) FROM brd_medication_issue_lines i WHERE to_jsonb(i)->>'medication_code'=c.medication_code) AS medication_allocations
FROM candidates c ORDER BY c.medication_code;

SELECT 'VET_ACTUAL_MATERIALS' AS section,material_code,material_name,spec,unit,status,
       (SELECT count(*) FROM inv_batches b WHERE b.material_code=m.material_code AND b.item_type='MATERIAL') AS inventory_batches
FROM mst_materials m WHERE material_type='VET_DRUG' ORDER BY material_code;
