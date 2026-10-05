# UAT Dependency Order — U0 Placeholder

The live database reports 98 foreign-key constraints. The child-to-parent topology was exported in segment `40-fk-dependencies` and retained as raw evidence. Any future cleanup must follow the live FK graph and the additional logical links in `uat-logical-dependencies.md`; no destructive order is approved by U0.

U1 added a concrete gate for the only ambiguous candidate: `wms_outbound` has one related inventory ledger row and one related inventory batch, with no sales or workflow runtime match. Because the batch and ledger are authoritative inventory facts under a formal company/warehouse, the dependency classification is `FORMAL_FACT_DEPENDENCY=YES`; no deletion topology may be generated for this row.
