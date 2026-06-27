# Follow-Up Agent Contract Template

## Source Task ID

`{{source_task_id}}`

## Source Agent

`{{source_agent}}`

## Source Conclusion

`{{source_conclusion}}`

## Changed Files

{{changed_files}}

## Conditions

{{conditions}}

## Blockers

{{blockers}}

## Required Review Scope

{{required_review_scope}}

## Allowed Actions

1. Read the source result summary.
2. Inspect only the files necessary for this follow-up.
3. Run the checks explicitly allowed by the follow-up contract.
4. Write the required output report under `docs/ops/`.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write to any database.
6. Do not modify production deployment logic.
7. Do not change files outside the follow-up contract.

## Required Output Report

`{{required_output_report}}`

## Stop Rules

Stop immediately if the follow-up requires migration/schema/entity/table/column changes, DB writes, deployment, destructive git operations, or work outside the approved scope.
