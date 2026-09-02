# Recruiting Control Room — proposed integration and data contract

> **Status: proposed future state.** This contract describes how approved aggregate data could move from source systems into a production Recruiting Control Room. The current portfolio artifact is a local synthetic prototype; it has no live integrations, production data, external writes, or production SLA.

**Interview summary:** The proposed contract moves only minimum-necessary aggregate data through versioned, idempotent interfaces, preserves source-to-decision lineage, and fails safely to the last reconciled snapshot instead of presenting partial data as current.

## 1. Scope and contract principles

The production path should use versioned, aggregate, minimum-necessary contracts. The ATS, calendar, workforce plan, benchmark store, task platform, and optional notification platform remain authoritative for their own domains.

Every inbound batch or outbound action should carry:

- `contract_version`, `source_system`, `source_tenant`, and `environment`
- `batch_id`, `correlation_id`, `extracted_at`, and `received_at`
- `period_start`, `period_end`, `snapshot_as_of`, and enterprise timezone
- `record_count`, `schema_hash`, validation status, and source owner

Accepted snapshots are immutable. Corrections create a new version; they do not overwrite lineage. Times use ISO 8601 UTC in transit, with the enterprise reporting timezone preserved as metadata.

## 2. Explicit exclusions

The following data is excluded from the proposed contract:

- Raw email messages, subjects, bodies, attachments, and mailbox metadata.
- Candidate names, email addresses, phone numbers, postal addresses, résumés, interview notes, evaluations, compensation, demographic data, and other candidate-level personal data.
- Calendar attendee names, event titles, descriptions, meeting links, and free text.
- Automated candidate scoring, ranking, disposition, communication, offer, or hiring action.

If excluded data is detected, reject and quarantine the batch, restrict access, notify Privacy/Security and the source owner, and do not promote a snapshot.

## 3. Source contracts

### 3.1 ATS requisition and stage data

- **System of record:** ATS.
- **Integration method:** Read-only incremental API or change export every 1–4 hours; full extract and reconciliation nightly. Governed CSV is the fallback.
- **Required aggregate fields:** `period_start`, `period_end`, `requisition_id`, `role`, `function`, `owner`, `applied_count`, `recruiter_screen_count`, `hiring_manager_count`, `interview_count`, `offer_count`, `hired_count`; production metadata adds `requisition_status`, `source_updated_at`, and `snapshot_as_of`.
- **Field owner:** ATS/HRIS administrator for source configuration; Recruiting Operations for canonical stage definitions and business semantics.
- **Sync cadence:** Incremental every 1–4 hours; nightly full reconciliation.
- **Freshness SLA:** Incremental data available within 4 hours of an authoritative change; reconciled daily snapshot available before the agreed business-morning cutoff.
- **Idempotency/deduplication key:** `source_tenant + requisition_id + period_start + period_end + snapshot_as_of`; within a batch, retain the latest `source_updated_at` for an identical key.
- **Validation rules:** Required keys present; counts are non-negative integers; stage counts do not increase downstream without an approved stage-model exception; requisition IDs are unique at the snapshot grain; period end is not before period start; stage taxonomy and status map to approved values.
- **Failure and retry behavior:** Reject the affected batch, retain the last-known-good snapshot, retry with the same `batch_id`, then run full reconciliation. Material variance requires source-owner and Recruiting Operations approval before promotion.
- **Manual fallback:** Authorized aggregate CSV using the prototype’s ATS stage snapshot shape, plus required production metadata and two-person reconciliation.
- **Retention:** Proposed 30 days in restricted landing, 13 months as accepted aggregate snapshots, and 24 months for decision/audit references; final policy requires approval.
- **Permissions:** Read-only service account; least-privilege ingestion role; no candidate-record write scope.
- **Downstream consumers:** Normalization, funnel calculations, requisition risk context, weekly review, lineage, monitoring, and approved task handoff.

### 3.2 Interview calendar aggregates

- **System of record:** Enterprise calendar or approved scheduling platform; the aggregate service is a derived source, not authoritative for event content.
- **Integration method:** Privacy-preserving aggregation job or approved scheduling API; no raw event storage in Recruiting Control Room.
- **Required aggregate fields:** `period_start`, `period_end`, `requisition_id`, `interviews_due`, `interviews_completed_on_time`, `panel_status`, `snapshot_as_of`; optional approved metrics may include aggregate cancellation or reschedule counts.
- **Field owner:** Calendar/scheduling administrator for extraction; Recruiting Operations for SLA definitions.
- **Sync cadence:** Every 1–4 hours, with a nightly summary.
- **Freshness SLA:** Aggregate updates within 4 hours; nightly summary before the business-morning cutoff.
- **Idempotency/deduplication key:** `source_tenant + requisition_id + period_start + period_end + snapshot_as_of`.
- **Validation rules:** Non-negative integers; completed-on-time does not exceed due unless an approved definition explains it; requisition ID maps to the accepted ATS/plan record; panel status uses the approved enumeration; no attendee or free-text fields are present.
- **Failure and retry behavior:** Mark calendar metrics unavailable, never as zero; retry the aggregate job with the same batch key; do not block unrelated sources, but prevent decisions that depend on missing calendar evidence.
- **Manual fallback:** Aggregate CSV with the prototype’s interview calendar summary fields; source owner confirms privacy filtering and counts.
- **Retention:** Proposed 30 days in landing and 13 months as aggregate snapshots; no raw calendar content retained.
- **Permissions:** Read-only aggregate scope; no access to bodies, attachments, attendee identity, or private calendar content.
- **Downstream consumers:** Interview SLA, panel-readiness context, exception scan, weekly review, and lineage.

### 3.3 Requisition and workforce plan

- **System of record:** Approved workforce-planning system, HRIS position control, or finance-approved demand ledger.
- **Integration method:** Read-only API or governed extract; approved-demand event webhook only if it carries high decision value and passes security review.
- **Required aggregate fields:** `requisition_id`, `role`, `function`, `owner`, `open_date`, `target_hires`, `target_date`, `priority`, `approved_status`; production metadata adds `plan_version`, `effective_at`, and `source_updated_at`.
- **Field owner:** Workforce-planning/HRIS owner for approved demand; TA leader for recruiting priority; Recruiting Operations for canonical mapping.
- **Sync cadence:** Nightly and on approved-demand events.
- **Freshness SLA:** Approved demand reflected by the next nightly snapshot; approved high-value event reflected within the agreed event SLA.
- **Idempotency/deduplication key:** `source_tenant + requisition_id + plan_version + effective_at`.
- **Validation rules:** Requisition ID maps to ATS or is explicitly marked pre-open; target hires is a positive integer; priority and approval status use controlled values; owner resolves to an active enterprise principal; target date is valid; canceled demand cannot remain active.
- **Failure and retry behavior:** Hold the prior accepted plan, flag demand freshness, retry idempotently, and block new priorities based on unconfirmed demand.
- **Manual fallback:** Authorized requisition-plan CSV plus documented plan version and approver.
- **Retention:** Proposed 30 days in landing, 13 months in snapshots, and plan history per the workforce system’s records policy.
- **Permissions:** Read-only plan scope; limited to approved demand and minimum role metadata.
- **Downstream consumers:** Demand reconciliation, age/priority/risk context, forecast context, weekly review, and action ownership.

### 3.4 Prior-period benchmark

- **System of record:** Governed analytics store or previously accepted Recruiting Control Room snapshots.
- **Integration method:** Versioned query or snapshot export using the same canonical stage model.
- **Required aggregate fields:** `period_start`, `period_end`, `stage`, `stage_count`, `conversion_benchmark`; production metadata adds `benchmark_version`, `population_definition`, and `approved_at`.
- **Field owner:** Recruiting Operations; TA leader approves operational thresholds and population changes.
- **Sync cadence:** Nightly refresh when a reporting period closes; threshold and forecast review monthly.
- **Freshness SLA:** Approved benchmark available before the next reporting period’s first weekly review.
- **Idempotency/deduplication key:** `population_definition + period_start + period_end + stage + benchmark_version`.
- **Validation rules:** Stage maps to the canonical taxonomy; counts and rates are non-negative; conversion is in the approved scale; population and period are complete; benchmark method and approver are recorded.
- **Failure and retry behavior:** Mark comparison unavailable rather than substituting a stale or mismatched population; retry the versioned query; require approval for a method change.
- **Manual fallback:** Authorized prior-period benchmark CSV with population and version metadata.
- **Retention:** Proposed 25 months for comparable aggregate benchmarks; final duration subject to records policy.
- **Permissions:** Read access to governed aggregates; threshold changes limited to approved administrators.
- **Downstream consumers:** Period deltas, conversion comparison, bottleneck context, monthly calibration, and lineage.

### 3.5 External task-management system

- **System of record:** Enterprise task-management platform for action state after an approved handoff.
- **Integration method:** Outbound API using a restricted service account; read-back API or webhook for task status. No handoff occurs without human approval.
- **Required aggregate fields:** `decision_id`, `requisition_id`, `action_type`, `action_summary`, `owner_principal_id`, `due_at`, `priority`, `approval_actor_id`, `approval_at`, `source_snapshot_id`, `idempotency_key`, `status`, and returned `external_task_id`.
- **Field owner:** TA leader owns priority/approval; action owner owns completion evidence; task-system administrator owns technical fields.
- **Sync cadence:** On approved action; status read-back at least daily and before Friday closure.
- **Freshness SLA:** Creation/update acknowledged within 5 minutes or marked failed; status reflected by the next daily reconciliation.
- **Idempotency/deduplication key:** `environment + decision_id + action_type + approved_revision`.
- **Validation rules:** Approval actor and time present; owner is active; due date is valid; snapshot exists and was accepted; no candidate-level data or raw email content; returned task ID is unique.
- **Failure and retry behavior:** Retry with the same key using bounded backoff; after threshold, use the controlled manual register and escalate. Read back before any retry that could create a duplicate.
- **Manual fallback:** Controlled action register containing the same fields; create the external task later with the original key and reconcile IDs.
- **Retention:** Task content follows the task platform’s approved policy; Recruiting Control Room retains the decision-to-task audit reference for the proposed 24 months.
- **Permissions:** Create/update only in the approved project or queue; no delete, workspace-admin, or unrelated-project scope.
- **Downstream consumers:** Weekly commitments, Thursday exception check, Friday closure, audit, and operational reporting.

### 3.6 Optional notification platform

- **System of record:** Recruiting Control Room decision audit for why a notification was approved; notification platform for delivery status.
- **Integration method:** Approved outbound API, queue, or webhook after human approval or a separately approved incident rule.
- **Required aggregate fields:** `notification_event_id`, `decision_id`, `template_code`, `audience_group_id`, `channel`, `severity`, `approved_by`, `approved_at`, `source_snapshot_id`, `sent_at`, and `delivery_status`.
- **Field owner:** TA leader owns business message and audience; IT/Security owns channel integration; Communications or Privacy reviews templates where required.
- **Sync cadence:** Event-driven only for approved decisions or incidents; delivery reconciliation daily.
- **Freshness SLA:** Delivery acknowledgement within 5 minutes or marked failed.
- **Idempotency/deduplication key:** `environment + decision_id + template_code + approved_revision + audience_group_id`.
- **Validation rules:** Approved template and audience; no candidate identifiers or free-form source content; valid snapshot and approval; permitted channel and severity.
- **Failure and retry behavior:** Bounded retry with the same key; suppress duplicates; escalate rather than switching channels without approval.
- **Manual fallback:** Named human sends the approved message through the approved channel and records the delivery reference.
- **Retention:** Delivery metadata per platform policy; decision/approval reference under the proposed audit retention.
- **Permissions:** Send only with approved templates and audience groups; no directory export, channel administration, or unrestricted direct messaging.
- **Downstream consumers:** Operational awareness, incident communication, and delivery audit. Notifications do not create decisions or tasks.

## 4. Cross-source validation and snapshot promotion

A candidate snapshot is promotable only when:

1. All required source contracts pass schema and privacy validation.
2. Requisition IDs reconcile across ATS, approved demand, and applicable calendar aggregates.
3. Period, timezone, stage taxonomy, and snapshot grain are consistent.
4. Duplicate, rejected-row, and variance rates are below approved tolerances.
5. Calculation and threshold versions are recorded.
6. Source freshness is within SLA or a named human approves a visible limitation.
7. Recruiting Operations records the promotion actor, time, and correlation ID.

Partial batches may be stored for diagnosis but must not silently replace the accepted decision snapshot.

## 5. Source-to-decision lineage example

**Illustrative only; no live integration is implied.**

1. ATS snapshot `ATS-2026-09-07-0600` reports 90 recruiter screens and 35 hiring-manager advances for requisition `SYN-2002`.
2. Calendar aggregate `CAL-2026-09-07-0600` reports 16 interviews due and 5 completed on time.
3. Approved plan `PLAN-2026-09-07-v3` reports four target hires, high priority, and an approved status.
4. Canonical calculation version `RCR-CALC-1.0` derives 38.9% screen-to-hiring-manager conversion and 31.3% interview SLA.
5. Threshold version `RCR-THRESH-1.0` marks SLA below 65% as high risk and proposes: “Restore interview feedback and scheduling SLA.”
6. A recruiter validates the operating context; the TA leader approves the priority, owner, and due date.
7. Task handoff key `prod:SYN-2002:restore-interview-sla:r1` creates one external task. The audit retains all source IDs, formulas, versions, approval, and returned task ID.

The source metrics produce a review recommendation, not a candidate or hiring decision.

## 6. Production incident example — failed nightly ATS reconciliation

**Scenario:** The nightly full extract returns 8% fewer open requisitions than the accepted incremental view and fails the approved variance tolerance.

1. Monitoring marks the batch failed and opens an incident with source, batch ID, counts, variance, and last-known-good snapshot.
2. Snapshot promotion stops; the workspace remains on the prior accepted snapshot and displays its actual `as of` time.
3. New task and notification handoffs based on affected ATS data are frozen. Existing human-owned tasks remain intact.
4. The ATS/HRIS administrator checks API pagination, permissions, deleted/closed requisitions, and schema change; IT/Security checks credential and service health.
5. The job retries with the same batch ID and idempotency keys, then performs a complete source-total reconciliation.
6. Recruiting Operations compares corrected ATS results with demand and calendar coverage and documents any downstream decisions affected.
7. The ATS/HRIS administrator confirms source integrity; Recruiting Operations approves the recovered snapshot; the TA leader approves resuming affected operating decisions.
8. The incident record captures root cause, duration, affected snapshots/tasks, corrective action, and a monitoring improvement.

No source data is rewritten from Recruiting Control Room, no failed audit event is deleted, and no stale snapshot is presented as current.

## 7. Contract changes and unresolved production decisions

- Backward-compatible optional fields may use a minor contract version; required-field, meaning, grain, or enum changes require a major version and migration plan.
- Producers and consumers should test both current and next contract versions before cutover.
- Unknown fields may be retained in restricted staging for diagnosis but are not promoted automatically.
- Final decisions remain open for vendor APIs, regional residency, enterprise timezone, stage taxonomy, tolerance thresholds, SLA cutoff, retention, encryption/key management, incident severity, task platform, notification channel, and production support ownership.
