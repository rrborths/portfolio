# Recruiting Control Room — proposed production operating model

> **Status: proposed future state.** This document describes a recommended path from the working local, synthetic prototype to a production implementation. It does not claim that production integrations, automated syncs, external writes, or production controls exist today.

**Interview summary:** I would productionize the prototype as a snapshot-based decision system: read-only incremental feeds keep data current, nightly reconciliation creates the trusted operating view, and humans retain authority over priorities and every external action.

## 1. Business purpose and intended users

Recruiting Control Room would give Talent Acquisition (TA) leaders a stable, traceable decision workspace for answering four questions: What changed? Where is delivery at risk? Which decision is needed? Who owns the next action?

The intended users are:

- **TA leader:** process owner and final prioritization authority.
- **Recruiting Operations:** data steward, control owner, and weekly meeting operator.
- **Recruiter:** requisition expert and approved-action owner.
- **Hiring manager:** owner of role context, hiring-team commitments, and business decisions.
- **ATS/HRIS administrator:** source-system and integration owner.
- **IT/Security:** owner of identity, permissions, credentials, monitoring, and incident support.

The workspace should support operating decisions; it should not rank candidates, make selection decisions, or replace recruiter and hiring-manager judgment.

## 2. Systems of record

| Domain | Proposed system of record | Recruiting Control Room responsibility |
|---|---|---|
| Requisitions and aggregate recruiting stages | ATS | Read and normalize approved requisition metadata and aggregate stage counts. Never become the authoritative source for candidate status. |
| Interview activity | Enterprise calendar or approved scheduling platform | Ingest aggregate completion and timeliness signals only; exclude attendees, subjects, bodies, and candidate-level records. |
| Approved demand and workforce plan | HRIS, workforce-planning system, or finance-approved demand ledger | Read approved headcount, priority, target dates, and ownership. |
| Prior-period benchmark | Governed analytics store or approved historical snapshot | Supply comparison baselines using the same stage definitions and reporting grain. |
| Follow-up work | Enterprise task-management system | Receive only human-approved action handoffs; remain the system of record for task state. |
| Notifications | Optional approved notification platform | Deliver approved operational alerts; never act as the decision or audit system of record. |

## 3. Proposed hybrid integration architecture

The recommended architecture combines scheduled API syncs, nightly reconciliations, an aggregate snapshot layer, and a controlled manual CSV fallback:

1. **Source adapters** read approved aggregate fields from the ATS, calendar, workforce plan, and benchmark store.
2. **Landing and validation** preserve source timestamps, schema version, row counts, and validation results in a restricted staging area.
3. **Normalization** maps source fields and stage names to a versioned canonical contract.
4. **Reconciliation** compares incremental results with source totals and the prior accepted snapshot.
5. **Snapshot promotion** makes a complete, reconciled, immutable snapshot available to the workspace.
6. **Calculation and exception logic** derives funnel conversion, period change, interview SLA, delivery risk, forecast context, and review recommendations.
7. **Human review** confirms priority, context, owner, and due date.
8. **Action handoff** creates or updates an external task only after explicit human approval; optional notifications follow the same boundary.

The core decision workspace should use **stable, reconciled snapshots**, not a continuously changing event stream. Real-time processing should be reserved for genuine high-value events—for example, an approved requisition opening or cancellation, a material integration incident, or another event whose delay would create a clear business risk. Routine stage movement and calendar activity do not require real-time processing for a weekly operating rhythm.

## 4. Operating cadence

| Control or activity | Recommended cadence | Decision use |
|---|---|---|
| ATS/API incremental sync | Every 1–4 hours | Maintain a current working view without destabilizing the decision snapshot. |
| Full ATS reconciliation | Nightly | Confirm totals, close gaps, detect deletes/closures, and promote the next trusted snapshot. |
| Calendar aggregates | Every 1–4 hours, with nightly summary | Monitor interview-capacity and completion signals without ingesting event content. |
| Requisition/workforce plan | Nightly and on approved-demand events | Keep approved demand, priorities, owners, and target dates aligned. |
| Agentic read-only exception scan | Each business morning | Identify stale data, threshold breaches, and conflicts for human review; take no action. |
| Human TA operating review | Weekly | Set priorities, assign actions, and confirm commitments. |
| Threshold and forecast review | Monthly | Recalibrate rules, benchmarks, and forecast assumptions with evidence. |
| Access, retention, and governance review | Quarterly | Revalidate need-to-know access, service accounts, retention, controls, and open risks. |

## 5. Data-to-decision flow and approval boundaries

### Ingestion and normalization

- Integrations use read-only service accounts wherever possible.
- Every batch carries a source-system identifier, extraction time, reporting period, schema version, and idempotency key.
- Validation rejects missing keys, invalid dates, negative counts, impossible stage sequences, duplicate records, and unapproved demand states.
- A failed source does not silently produce a partial decision snapshot.

### Calculation and review

- Versioned rules calculate aggregate stage totals, transition conversion, period deltas, interview SLA, requisition age, threshold-based risk, and forecast context.
- Each displayed recommendation retains lineage to the accepted source snapshot, fields, calculation version, and threshold version.
- The read-only exception scan may propose review items; it may not change ATS records, assign people, contact candidates, or create tasks.

### Human approval and action handoff

- The **TA leader** owns final prioritization and any decision that changes the weekly operating plan.
- **Recruiting Operations** confirms data readiness and operates the review.
- The **recruiter** validates role context before accepting an action.
- The **hiring manager** owns business commitments and role decisions.
- External task creation, notification, or source-system change requires a named human approver and a recorded approval event.
- Candidate evaluation, candidate communication, disposition, offer, and hiring decisions remain outside automated scope.

## 6. Access and least privilege

Recommended access profiles:

- **Viewer:** read accepted aggregate snapshots and approved decisions.
- **Recruiter:** viewer access plus update rights for assigned operational notes and tasks, not integration configuration.
- **Recruiting Operations:** manage mappings, validate snapshots, operate reviews, and administer calculation thresholds through change control.
- **TA leader:** approve priorities, action handoffs, and threshold changes.
- **ATS/HRIS administrator:** manage source credentials and adapters; no default authority over TA decisions.
- **IT/Security:** manage identity, secrets, logs, monitoring, and incident response; no default access to recruiting content beyond operational need.

Use single sign-on, role groups, time-bounded elevated access, separate service accounts, secrets management, environment separation, and quarterly access certification. No shared credentials should be permitted.

## 7. Audit, retention, monitoring, and recovery

### Audit trail

Record source batch, validation result, snapshot promotion, calculation version, threshold version, recommendation, human approval or rejection, task handoff, actor, timestamp, and correlation ID. Audit events should be append-only and searchable without exposing candidate-level data.

### Proposed retention defaults

- Raw aggregate landing files: 30 days.
- Validation and integration logs: 90 days.
- Accepted aggregate snapshots: 13 months for annual comparison.
- Decision and approval audit: 24 months.
- External task and notification records: governed by their systems of record.

Legal, Privacy, Security, and records-management owners must approve final periods before launch.

### Monitoring

Monitor source freshness, batch completeness, schema drift, duplicate rate, rejected-row rate, reconciliation variance, snapshot promotion, calculation failures, action-handoff failures, permission changes, and unusual access. Alerts should name the affected source, last-known-good snapshot, business impact, and owner.

### Failure recovery

If an incremental or nightly job fails, retain the last-known-good snapshot, label it with its actual `as of` time, and suppress promotion of incomplete data. Retry with the same idempotency key, reconcile against source totals, and require Recruiting Operations to approve the recovered snapshot when material variance or schema change occurred. Rollback means repointing the decision workspace to the last accepted immutable snapshot; it does not alter the source system.

## 8. Manual CSV fallback

The local prototype’s four aggregate contracts provide the proposed fallback shape: ATS stage snapshot, interview calendar summary, requisition plan, and prior-period benchmark.

Production fallback should require:

1. Export by an authorized source-system owner.
2. Aggregate-only files with the approved schema and no candidate-level personal data.
3. Malware scan, schema validation, row-count reconciliation, and source-period confirmation.
4. Two-person review by Recruiting Operations and the applicable source owner.
5. A uniquely versioned fallback batch and full audit record.
6. Promotion only after all four required sources are complete or an approved exception documents the missing source and resulting limitations.

Fallback files should enter the same normalization, validation, calculation, approval, and retention controls as API-sourced data.

## 9. Recommended 90-day implementation plan

### Days 1–30 — decide and control

- Confirm business owner, pilot group, systems of record, source owners, and success measures.
- Approve the canonical aggregate contract, stage taxonomy, identity model, retention, and candidate-data exclusion.
- Complete Security, Privacy, Legal, and architecture reviews.
- Establish non-production environments, service accounts, secrets, monitoring, and incident ownership.
- Run the manual CSV path with synthetic data and signed reconciliation evidence.

**Exit gate:** approved design and controls; no production data or external writes required.

### Days 31–60 — integrate and reconcile

- Build read-only ATS incremental sync and nightly full reconciliation.
- Add aggregate calendar, approved-demand, and benchmark ingestion.
- Implement canonical normalization, immutable snapshots, lineage, thresholds, and freshness indicators.
- Test duplicates, late-arriving data, schema drift, source outages, and last-known-good recovery.

**Exit gate:** source-owner reconciliation and control evidence in a restricted pilot environment.

### Days 61–90 — pilot and operationalize

- Run two to four weekly reviews with a limited TA pilot using read-only recommendations.
- Calibrate thresholds and forecasts; document accepted false positives and misses.
- Enable human-approved task handoff only after audit and rollback tests pass.
- Train roles, rehearse the failed-reconciliation incident, certify access, and complete production-readiness review.

**Exit gate:** named business and technical owners approve go-live scope, operating runbook, control evidence, and rollback readiness.

## 10. Assumptions, dependencies, and open decisions

### Assumptions

- Source systems expose approved aggregate data with stable identifiers and timestamps.
- The ATS remains authoritative for requisition and stage state.
- Candidate-level personal data is not needed for the proposed operating decisions.
- Human review remains the final control for priorities, ownership, and action handoffs.

### Dependencies

- Source API or governed export access; enterprise identity and secrets management.
- Named source owners and a common stage taxonomy.
- Approved task-management and optional notification integrations.
- Security, Privacy, Legal, records-management, and accessibility review.
- Monitoring, incident management, and support capacity.

### Open decisions

- Exact source products, API limits, and regional data-residency constraints.
- Enterprise reporting timezone and business-day cutoff.
- Final freshness SLAs, retention periods, and reconciliation tolerances.
- Threshold owners, forecast method, and change-approval process.
- Pilot population, success measures, support hours, and go-live authority.
- Which events, if any, justify real-time processing.
