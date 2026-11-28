import assert from 'node:assert/strict';
import fs from 'node:fs';

export const admissionMigration = Object.freeze({
  source_file: 'apps/api/dist/database/migrations/1791878400000-CreateChanjetExecutionAdmissions.js',
  class_name: 'CreateChanjetExecutionAdmissions1791878400000',
  effective_name: 'CreateChanjetExecutionAdmissions1791878400000',
  timestamp: 1791878400000,
});
export const featureMigrations = Object.freeze([
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794402000000-AddImmuneIssueLines.js',
    class_name: 'AddImmuneIssueLines1794402000000',
    effective_name: 'AddImmuneIssueLines1794402000000',
    timestamp: 1794402000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794403000000-AddGradeInventoryPolicy.js',
    class_name: 'AddGradeInventoryPolicy1794403000000',
    effective_name: 'AddGradeInventoryPolicy1794403000000',
    timestamp: 1794403000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794405000000-AddWmsDefectDisposition.js',
    class_name: 'AddWmsDefectDisposition1794405000000',
    effective_name: 'AddWmsDefectDisposition1794405000000',
    timestamp: 1794405000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794500000000-FreezeRetiredEggGrades.js',
    class_name: 'FreezeRetiredEggGrades1794500000000',
    effective_name: 'FreezeRetiredEggGrades1794500000000',
    timestamp: 1794500000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794600000000-AnnotateGradeStatusLifecycle.js',
    class_name: 'AnnotateGradeStatusLifecycle1794600000000',
    effective_name: 'AnnotateGradeStatusLifecycle1794600000000',
    timestamp: 1794600000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794700000000-AddMstProductsUnitColumn.js',
    class_name: 'AddMstProductsUnitColumn1794700000000',
    effective_name: 'AddMstProductsUnitColumn1794700000000',
    timestamp: 1794700000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794800000000-AddWmsInboundItemIdentity.js',
    class_name: 'AddWmsInboundItemIdentity1794800000000',
    effective_name: 'AddWmsInboundItemIdentity1794800000000',
    timestamp: 1794800000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794601000000-AddInventoryClass.js',
    class_name: 'AddInventoryClass1794601000000',
    effective_name: 'AddInventoryClass1794601000000',
    timestamp: 1794601000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794879957217-InvBatchesIntegrityConstraints.js',
    class_name: 'InvBatchesIntegrityConstraints1794879957217',
    effective_name: 'InvBatchesIntegrityConstraints1794879957217',
    timestamp: 1794879957217,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794880267031-InvLedgerChangeTypeDictSeed.js',
    class_name: 'InvLedgerChangeTypeDictSeed1794880267031',
    effective_name: 'InvLedgerChangeTypeDictSeed1794880267031',
    timestamp: 1794880267031,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794885912725-InvEggCostingColumns.js',
    class_name: 'InvEggCostingColumns1794885912725',
    effective_name: 'InvEggCostingColumns1794885912725',
    timestamp: 1794885912725,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794899000000-FlockBaseSchema.js',
    class_name: 'FlockBaseSchema1794899000000',
    effective_name: 'FlockBaseSchema1794899000000',
    timestamp: 1794899000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794900000000-FlockLifecycleLedger.js',
    class_name: 'FlockLifecycleLedger1794900000000',
    effective_name: 'FlockLifecycleLedger1794900000000',
    timestamp: 1794900000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794901000000-FlockProductionProvenance.js',
    class_name: 'FlockProductionProvenance1794901000000',
    effective_name: 'FlockProductionProvenance1794901000000',
    timestamp: 1794901000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794902000000-FlockActivitySources.js',
    class_name: 'FlockActivitySources1794902000000',
    effective_name: 'FlockActivitySources1794902000000',
    timestamp: 1794902000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794903000000-FlockReportCorrection.js',
    class_name: 'FlockReportCorrection1794903000000',
    effective_name: 'FlockReportCorrection1794903000000',
    timestamp: 1794903000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794904000000-TempProductionReversalDictSeed.js',
    class_name: 'TempProductionReversalDictSeed1794904000000',
    effective_name: 'TempProductionReversalDictSeed1794904000000',
    timestamp: 1794904000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794971000000-OfficialInventoryCutover.js',
    class_name: 'OfficialInventoryCutover1794971000000',
    effective_name: 'OfficialInventoryCutover1794971000000',
    timestamp: 1794971000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794972000000-ProductionInboundDocuments.js',
    class_name: 'ProductionInboundDocuments1794972000000',
    effective_name: 'ProductionInboundDocuments1794972000000',
    timestamp: 1794972000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794973000000-ProductionHandoverAndPeriods.js',
    class_name: 'ProductionHandoverAndPeriods1794973000000',
    effective_name: 'ProductionHandoverAndPeriods1794973000000',
    timestamp: 1794973000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794974000000-ProductionInstallmentDictionaries.js',
    class_name: 'ProductionInstallmentDictionaries1794974000000',
    effective_name: 'ProductionInstallmentDictionaries1794974000000',
    timestamp: 1794974000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794975000000-OfficialProductionReportGrain.js',
    class_name: 'OfficialProductionReportGrain1794975000000',
    effective_name: 'OfficialProductionReportGrain1794975000000',
    timestamp: 1794975000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794976000000-ProductionCutoverManifests.js',
    class_name: 'ProductionCutoverManifests1794976000000',
    effective_name: 'ProductionCutoverManifests1794976000000',
    timestamp: 1794976000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794977000000-OfficialInventoryLedgerCost.js',
    class_name: 'OfficialInventoryLedgerCost1794977000000',
    effective_name: 'OfficialInventoryLedgerCost1794977000000',
    timestamp: 1794977000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795005390930-OfficialRawCollectionReceipts.js',
    class_name: 'OfficialRawCollectionReceipts1795005390930',
    effective_name: 'OfficialRawCollectionReceipts1795005390930',
    timestamp: 1795005390930,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795011331222-OfficialInventoryConversions.js',
    class_name: 'OfficialInventoryConversions1795011331222',
    effective_name: 'OfficialInventoryConversions1795011331222',
    timestamp: 1795011331222,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795025712607-ProductionCutoverEvidenceBarriers.js',
    class_name: 'ProductionCutoverEvidenceBarriers1795025712607',
    effective_name: 'ProductionCutoverEvidenceBarriers1795025712607',
    timestamp: 1795025712607,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795029621917-ProductionCutoverExecutionAdmissions.js',
    class_name: 'ProductionCutoverExecutionAdmissions1795029621917',
    effective_name: 'ProductionCutoverExecutionAdmissions1795029621917',
    timestamp: 1795029621917,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795400100000-ProductionDocumentContinuations.js',
    class_name: 'ProductionDocumentContinuations1795400100000',
    effective_name: 'ProductionDocumentContinuations1795400100000',
    timestamp: 1795400100000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795400200000-ProductionFinanceReview.js',
    class_name: 'ProductionFinanceReview1795400200000',
    effective_name: 'ProductionFinanceReview1795400200000',
    timestamp: 1795400200000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795400300000-CutoverStateReceipts.js',
    class_name: 'CutoverStateReceipts1795400300000',
    effective_name: 'CutoverStateReceipts1795400300000',
    timestamp: 1795400300000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795478400000-EggWithdrawalReview.js',
    class_name: 'EggWithdrawalReview1795478400000',
    effective_name: 'EggWithdrawalReview1795478400000',
    timestamp: 1795478400000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795500000000-VetMaterialAllocation.js',
    class_name: 'VetMaterialAllocation1795500000000',
    effective_name: 'VetMaterialAllocation1795500000000',
    timestamp: 1795500000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795500100000-VetMaterialIdentity.js',
    class_name: 'VetMaterialIdentity1795500100000',
    effective_name: 'VetMaterialIdentity1795500100000',
    timestamp: 1795500100000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795564800000-EggSourceChanges.js',
    class_name: 'EggSourceChanges1795564800000',
    effective_name: 'EggSourceChanges1795564800000',
    timestamp: 1795564800000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795564900000-EggCollectionProductionDay.js',
    class_name: 'EggCollectionProductionDay1795564900000',
    effective_name: 'EggCollectionProductionDay1795564900000',
    timestamp: 1795564900000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795565000000-ApprovedEggProductDomainExtension.js',
    class_name: 'ApprovedEggProductDomainExtension1795565000000',
    effective_name: 'ApprovedEggProductDomainExtension1795565000000',
    timestamp: 1795565000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795565100000-LegacyMobileProductionSummary.js',
    class_name: 'LegacyMobileProductionSummary1795565100000',
    effective_name: 'LegacyMobileProductionSummary1795565100000',
    timestamp: 1795565100000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795565200000-FarmMedicineInboundReceipts.js',
    class_name: 'FarmMedicineInboundReceipts1795565200000',
    effective_name: 'FarmMedicineInboundReceipts1795565200000',
    timestamp: 1795565200000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795565300000-ScopedFarmFeedLedger.js',
    class_name: 'ScopedFarmFeedLedger1795565300000',
    effective_name: 'ScopedFarmFeedLedger1795565300000',
    timestamp: 1795565300000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795651200000-EggSourceIndependentPermissions.js',
    class_name: 'EggSourceIndependentPermissions1795651200000',
    effective_name: 'EggSourceIndependentPermissions1795651200000',
    timestamp: 1795651200000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795654800000-EggSourceHouseContract.js',
    class_name: 'EggSourceHouseContract1795654800000',
    effective_name: 'EggSourceHouseContract1795654800000',
    timestamp: 1795654800000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795658400000-EggSourceLegacyCreationGate.js',
    class_name: 'EggSourceLegacyCreationGate1795658400000',
    effective_name: 'EggSourceLegacyCreationGate1795658400000',
    timestamp: 1795658400000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795658500000-InventoryStocktakeSubmissions.js',
    class_name: 'InventoryStocktakeSubmissions1795658500000',
    effective_name: 'InventoryStocktakeSubmissions1795658500000',
    timestamp: 1795658500000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795658600000-WarehouseDailyCloseCapture.js',
    class_name: 'WarehouseDailyCloseCapture1795658600000',
    effective_name: 'WarehouseDailyCloseCapture1795658600000',
    timestamp: 1795658600000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795658700000-TransferCostEvidence.js',
    class_name: 'TransferCostEvidence1795658700000',
    effective_name: 'TransferCostEvidence1795658700000',
    timestamp: 1795658700000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795658800000-EggSourceStandardGrants.js',
    class_name: 'EggSourceStandardGrants1795658800000',
    effective_name: 'EggSourceStandardGrants1795658800000',
    timestamp: 1795658800000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795658900000-EggSourceCutoverEvidence.js',
    class_name: 'EggSourceCutoverEvidence1795658900000',
    effective_name: 'EggSourceCutoverEvidence1795658900000',
    timestamp: 1795658900000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795659000000-EggSourceOperationReceipts.js',
    class_name: 'EggSourceOperationReceipts1795659000000',
    effective_name: 'EggSourceOperationReceipts1795659000000',
    timestamp: 1795659000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795719000000-EnsureFinanceApPaymentAllocations.js',
    class_name: 'EnsureFinanceApPaymentAllocations1795719000000',
    effective_name: 'EnsureFinanceApPaymentAllocations1795719000000',
    timestamp: 1795719000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1795800000000-PackagingShiftCloseSnapshot.js',
    class_name: 'PackagingShiftCloseSnapshot1795800000000',
    effective_name: 'PackagingShiftCloseSnapshot1795800000000',
    timestamp: 1795800000000,
  }),
]);
const pinned = JSON.parse(fs.readFileSync(new URL('./typeorm-ledger-rehearsal-historical-inventory.json', import.meta.url), 'utf8'));
const sorted = entries => [...entries].sort((a,b) => a.timestamp-b.timestamp);

/** This fixture rehearses the pinned historical ledger, not newly added feature DDL. */
export function partitionRehearsalInventory(entries) {
  assert.equal(pinned.schema, 'phoenix.typeorm-historical-rehearsal-inventory/1');
  assert.equal(pinned.historicalCount, 96);
  assert.equal(pinned.entries.length, 96);
  const expectedTotal = pinned.entries.length + 1 + featureMigrations.length;
  assert.equal(entries.length, expectedTotal, `expected ${expectedTotal} pinned historical/reviewed migrations, got ${entries.length}`);
  assert.equal(new Set(entries.map(e => e.timestamp)).size, expectedTotal, 'canonical timestamps must remain unique');
  assert.equal(new Set(entries.map(e => e.effective_name)).size, expectedTotal, 'canonical effective names must remain unique');
  const added = entries.filter(e => e.timestamp === admissionMigration.timestamp);
  assert.equal(added.length, 1, 'admission migration must be present exactly once');
  assert.deepEqual(added[0], admissionMigration, 'admission class/name/path must match the reviewed control migration');
  for (const feature of featureMigrations) {
    const matches = entries.filter(e => e.timestamp === feature.timestamp);
    assert.equal(matches.length, 1, `feature migration ${feature.timestamp} must be present exactly once`);
    assert.deepEqual(matches[0], feature, `feature migration ${feature.timestamp} metadata changed`);
  }
  const excluded = new Set([admissionMigration.timestamp, ...featureMigrations.map(feature => feature.timestamp)]);
  const history = entries.filter(e => !excluded.has(e.timestamp));
  assert.deepEqual(sorted(history), sorted(pinned.entries), 'historical 96-member ledger inventory changed or contains an unknown migration');
  return { history, admission: added[0] };
}
