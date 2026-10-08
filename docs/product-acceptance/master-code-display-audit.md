# Master name/code product acceptance audit

BASE_MAIN=063ec1bc5d7d1cd6e10c398cb8178a8c96abc0ad
LATEST_ORIGIN_MAIN=063ec1bc5d7d1cd6e10c398cb8178a8c96abc0ad
BRANCH=codex/fix-master-name-code-display

Static scope: all 220 admin TSX files; searched all 11 requested code fields, direct JSX values, table column keys, selectors, fallback expressions, and their response/lookup sources. This is a static candidate audit, not a claim that every historical production row has a complete master name. Read-only UI fixture coverage and production evidence are recorded in the fix report.

Field-bearing file counts (not defect counts): `{"farm_code": 11, "house_code": 39, "warehouse_code": 21, "location_code": 8, "store_code": 21, "supplier_code": 10, "customer_code": 10, "project_code": 6, "company_code": 28, "sku_code": 19, "material_code": 7}`.

SAME_CLASS_PAGES_FIXED=26
AUDIT_RECORDS=63
NO_AUTHORITATIVE_NAME_SOURCE_COUNT=0. Missing/inactive/inaccessible master records still fall back to their unchanged code; no scope bypass is used to obtain labels.

Sources verified: GenericCrud localizedReadSource (`apps/api/src/modules/generic-crud/generic-crud.service.ts`, inv_batches/wms_stocktake), house daily report (`modules/farm/farm.service.ts`), scoped lookup controller (`modules/product-master/controllers/lookup.controller.ts`). Lookup guards resolve company/farm/site/WarehouseScope and fail closed. SKU catalog is the existing authenticated business inventory-items lookup, not the PBAC-restricted SKU maintenance endpoint. Zones use existing warehouse-scoped CRUD in bounded pages, never a per-row request.

Shared policy: requested locale name -> canonical name -> code. Farm/house use real `farm_name`/`house_name`; no translation seed or new schema. Names returned by the authoritative source are protected with the existing `data-i18n-skip` contract so the DOM hydrator cannot manufacture or partially translate business names. Existing strict master-maintenance translation contracts are preserved; canonical fallback is explicit for newly fixed business rows.

| PAGE | FIELD | CURRENT_DISPLAY (before fix) | NAME_SOURCE | LOCALIZATION_SOURCE | DECISION | FIX |
|---|---|---|---|---|---|---|
| breeding/flock | farm_code / house_code | code-only; farmName mixed code/name | scoped business lookup/farms + lookup/houses backed by brd_farms.farm_name / brd_houses.house_name | canonical; future snake/camel locale projections | FIXED_THIS_PR | raw facts + memoized labels; primary name/secondary code; search all 6 fields; Drawer name(code) |
| breeding/immune | house_code | farm_house / house_code | existing brd_houses preload | canonical + retained locale fields | FIXED_THIS_PR | reuse raw preload; localized compact name(code) |
| breeding/medicine | house_code | flock reference / house code | scoped lookup/houses + existing flock association | canonical + future locale fields | FIXED_THIS_PR | retain flock reference; add actual associated house name(code) |
| breeding/henreport | house_code | code-only | farm.service.ts daily report LEFT JOIN brd_houses, house_name | canonical response | FIXED_THIS_PR | format existing read projection |
| breeding/device | erp_house_code | recent alarm code | same all-summary response houses.houseName | canonical projection | FIXED_THIS_PR | map same response; no new lookup |
| breeding/med-stock | house_code | ledger code / historical free text | lookup/houses under breeding scope | canonical; historical free text kept if unmatched | FIXED_THIS_PR | label matched houses; preserve historical values |
| breeding | house_code | notice interpolation code | scoped lookup/houses | canonical/current locale | FIXED_THIS_PR | retain structured houseCode; derive notice name at render |
| analytics/inventory | house_code | expiry batch code | scoped lookup/houses | canonical/current locale | FIXED_THIS_PR | bulk map, preserve grade/SKU classification |
| analytics/feed | supplier_code | receipt supplier code | lookup/suppliers code/name; company/shared scope | canonical lookup; future locale fields retained | FIXED_THIS_PR | bulk supplier label |
| packaging/inbound | house_code / warehouse | code-only columns | lookup/houses; lookup/warehouses with WarehouseScope | house canonical; warehouse real zh/en/lo | FIXED_THIS_PR | replace unused CRUD preload with scoped bulk maps; values unchanged |
| packaging | house_code | batch summary code suffix | scoped lookup/houses | canonical/current locale | FIXED_THIS_PR | compact name(code) in batch summary |
| quality/farm | house_code | code-only column | scoped lookup/houses | canonical/current locale | FIXED_THIS_PR | one bulk lookup; display only |
| quality/backward | warehouse_code / location_code / product_code | code-only columns | GenericCrud inv_batches LEFT JOIN warehouses/locations/products | warehouse/product real locale projections; location canonical | FIXED_THIS_PR | use response names; canonical warehouse fallback |
| quality/forward | warehouse_code / customer_code | raw KV values | lookup/warehouses; lookup/customers code/name; existing customer snapshot | warehouse locale names; customer canonical | FIXED_THIS_PR | present copied KV values; preserve queried records |
| quality/product | sku_code | code-only column | business lookup/inventory-items SKU itemName, global ACTIVE catalog | canonical read projection; future locale fields accepted | FIXED_THIS_PR | bulk lookup; no MENU_MASTER_SKU requirement |
| warehouse/loss-report | warehouse_code / zone_code | code-only columns | existing wms_stocktake warehouse projection; warehouse-scoped paginated wms_zones | warehouse locale projections; zone canonical | FIXED_THIS_PR | render names; paginate bulk zone load (<=1000 rows/request) |
| sales2/orders | fulfillment_warehouse_code | detail warehouse code | lookup/warehouses with WarehouseScope | real zh/en/lo + canonical | FIXED_THIS_PR | one bulk map; existing order payload unchanged |
| sales2/delivery | fulfillment_warehouse_code / company_code | detail warehouse; driver/vehicle company codes | lookup/warehouses + lookup/companies with scope | warehouse locale names; canonical company org names | FIXED_THIS_PR | read-only detail/card labels |
| sales2/pricing | customer_code / company_code | price book customer; anomaly company code | lookup/customers + lookup/companies with scope | canonical/current locale | FIXED_THIS_PR | localized compact labels; pricing semantics unchanged |
| finance2/ar | company_code / project_code | detail codes | existing invoice company_name/project_name response | canonical snapshot / locale if returned | FIXED_THIS_PR | name(code) in detail only |
| finance2/ap | company_code / project_code | company code-first; project code | existing invoice company_name/project_name response | canonical snapshot / locale if returned | FIXED_THIS_PR | name(code) in detail only |
| finance2/reports | companyCode | report company codes | lookup/companies company-scope | canonical organization names | FIXED_THIS_PR | name(code) for report company rows |
| store/losses | store_code / sku_code | code-only business list | scoped lookup/stores; authorized lookup/inventory-items catalog | store actual locales; SKU canonical projection | FIXED_THIS_PR | bulk labels; no store/user scope change |
| store | store_code | fallback suffix when wave_no absent | scoped lookup/stores | real locale names + canonical | FIXED_THIS_PR | wave reference unchanged; store label only if no wave |
| breeding/henhouse | house_code | name present | house_name primary/code secondary (reference page) | existing helper/canonical | ALREADY_CORRECT | no change |
| breeding/daily | house_code | name present | existing brd_houses houseName mapping | existing helper/canonical | ALREADY_CORRECT | no change |
| breeding/daily-inbound-ledger | house_code | name present | existing response house_name + formatMasterData | existing helper/canonical | ALREADY_CORRECT | no change |
| warehouse/inbound | warehouse_code / material_code | name present | existing localized GenericCrud projection | existing helper/canonical | ALREADY_CORRECT | no change |
| warehouse/outbound | warehouse_code / material_code / destination | name present | existing localized read projection | existing helper/canonical | ALREADY_CORRECT | no change |
| warehouse/transfer | from/to warehouse | name present | existing read name projection | existing helper/canonical | ALREADY_CORRECT | no change |
| warehouse/stocktake | warehouse_code | name present | existing read name projection | existing helper/canonical | ALREADY_CORRECT | no change |
| warehouse/query | warehouse/location/store/sku/material | name present | existing locale read projection | existing helper/canonical | ALREADY_CORRECT | no change |
| warehouse/locations | warehouse_code / zone_code / store_code | name present | existing name(code) + separate master name | existing helper/canonical | ALREADY_CORRECT | no change |
| warehouse/zones | warehouse_code | name present | existing master display | existing helper/canonical | ALREADY_CORRECT | no change |
| warehouse/ledger | store_code / warehouse_code | name present | existing name formatters | existing helper/canonical | ALREADY_CORRECT | no change |
| procurement2/requests | company/project/material | name present | existing purchase-request display helpers + material names | existing helper/canonical | ALREADY_CORRECT | no change |
| procurement2/orders | company/supplier/project/material | name present | existing company/supplier names and item formatters | existing helper/canonical | ALREADY_CORRECT | no change |
| procurement2/receipts | warehouse/supplier/material | name present | existing name projections and detail labels | existing helper/canonical | ALREADY_CORRECT | no change |
| sales2/returns | customer/company/sku | name present | existing localized master display | existing helper/canonical | ALREADY_CORRECT | no change |
| sales2/inventory | warehouse/sku/material in main lists | name present | existing localized master display; ranking exception below | existing helper/canonical | ALREADY_CORRECT | no change |
| sales2/customers | customer/channel | name present | existing localized master display | existing helper/canonical | ALREADY_CORRECT | no change |
| sales2/reports | customer/product | name present | existing localized master display | existing helper/canonical | ALREADY_CORRECT | no change |
| finance2/reimbursements | company_code | name present | existing company_name snapshot | existing helper/canonical | ALREADY_CORRECT | no change |
| settings/pos-config | store_code | name present | store name primary, code secondary | existing helper/canonical | ALREADY_CORRECT | no change |
| store/replenish | store/warehouse/sku | name present | existing names and masterNameWithCode | existing helper/canonical | ALREADY_CORRECT | no change |
| store/inventory | warehouse/location/sku | name present | existing read projections | existing helper/canonical | ALREADY_CORRECT | no change |
| store-pos | sku_code | name present | business name primary; SKU secondary | existing helper/canonical | ALREADY_CORRECT | no change |
| master-data/* | all 11 domains | name present | existing localized master-page display; no repeated redesign | existing helper/canonical | ALREADY_CORRECT | no change |
| breeding/egg-ledger | none | code/reference | deprecated redirect; no active business table | n/a | CODE_INTENTIONAL | preserved |
| breeding/device-ops | erp_farm_code / erp_house_code | code/reference | explicit external mapping audit; house name also shown | n/a | CODE_INTENTIONAL | preserved |
| traceability | farm_code | code/reference | farm name and identifier shown separately in lineage inspection | n/a | CODE_INTENTIONAL | preserved |
| traceability | house/store/company/sku references | code/reference | technical lineage reference fields; names absent in aggregate, no scope-safe source in this endpoint | n/a | CODE_INTENTIONAL | preserved |
| master/farms | farm_code | code/reference | editable master code column alongside name | n/a | CODE_INTENTIONAL | preserved |
| master/stores | store_code | code/reference | editable master code column alongside name | n/a | CODE_INTENTIONAL | preserved |
| warehouse/warehouses | warehouse_code | code/reference | editable code column alongside multilingual name columns | n/a | CODE_INTENTIONAL | preserved |
| packaging/exceptions | store_code | code/reference | form payload field only; no code-only business column | n/a | CODE_INTENTIONAL | preserved |
| shared-selectors/BatchSelector | batch_no / item code | code/reference | batch identifier selection with availability; technical reference | n/a | CODE_INTENTIONAL | preserved |
| settings/users | store_code | code/reference | account authorization reference beside user ID | n/a | CODE_INTENTIONAL | preserved |
| finance2/chanjet-integration | warehouse/reference codes | code/reference | explicit external mapping/accounting audit; no Chanjet changes | n/a | CODE_INTENTIONAL | preserved |
| sales2/orders,pricing,returns | SKU badges/item references | code/reference | name shown elsewhere in same row/card; code kept as reference | n/a | CODE_INTENTIONAL | preserved |
| breeding/med-stock | legacy house_code free text | historical house labels such as 2号舍/全场 | legacy value is not a master code and cannot be matched reliably | historical original text | SEPARATE_MASTER_DATA_GAP | matched codes fixed; no data rewrite |
| sales2/inventory | sku_code in loss-by-batch ranking | code-only badge | scoped business inventory-items lookup | canonical/current locale when projected | FIXED_THIS_PR | bulk SKU map for ranking only; main named lists retained |
| breeding/device-alerts | farm_code | ownership code only | existing scoped lookup/farms; deny/empty remains fail-closed for device-only scopes | canonical + future locale fields | FIXED_THIS_PR | one bulk lookup, current scope respected; no IoT row scope changed |


## Post-deploy production record exception — 2026-10-08

The original63 static page/field audit records and26 fixed pages remain unchanged. A new real-data exception was independently verified during authorized readonly acceptance:

| PAGE | FIELD | CURRENT_DISPLAY | NAME_SOURCE | LOCALIZATION_SOURCE | DECISION | FIX |
|---|---|---|---|---|---|---|
| breeding/flock, historical FK-DEBUG-001 | F-DEBUG / H-DEBUG-A01 association | house code once | lookup house H-DEBUG-A01 belongs to LPH_MENGSAI and has name X; no matching F-DEBUG+H-DEBUG-A01 master | no authoritative name for this association | SEPARATE_MASTER_DATA_GAP | safe fallback retained; no incorrect cross-farm label, scope broadening or data repair |

Legal GET lookup/houses and CRUD brd_flocks both returned200 and confirmed different farm codes. `flockMasterLabels` uses the composite farm/house identity; matching solely by house code would mislabel this row. Independent readonly review agreed. This adds an observed record-level data-quality exception, not another code-only page defect or a claim that production uniqueness constraints were checked. [Closeout evidence](c3-production-transition-closeout.md) records final production scope and empty-branch limitations.
