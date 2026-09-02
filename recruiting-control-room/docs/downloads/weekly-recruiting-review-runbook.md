# Recruiting Control Room — proposed weekly recruiting review runbook

> **Status: proposed future state.** This runbook describes how a production implementation could operate after approval and integration. It does not represent a currently deployed process, live data feed, or production task integration.

**Interview summary:** The operating rhythm is Monday readiness and prioritization, human-approved task assignment, Thursday exception management, and Friday evidence-based closure—with a last-known-good snapshot and explicit escalation path when data is not trustworthy.

## Runbook control

- **Owner:** TA leader (process owner); Recruiting Operations (run operator)
- **Frequency:** Weekly, with Monday review, Thursday exception check, and Friday closure
- **Purpose:** Convert a trusted aggregate recruiting snapshot into explicit priorities, named human-owned actions, and traceable weekly commitments.
- **Scope:** Requisition delivery, aggregate funnel health, interview operating signals, approved demand, and follow-up tasks. Candidate evaluation and candidate communication are out of scope.

## Roles

| Role | Accountability |
|---|---|
| TA leader | Process owner and final prioritization; approves action handoffs and material exceptions. |
| Recruiting Operations | Data steward and meeting operator; verifies readiness, records decisions, and maintains run history. |
| Recruiter | Action owner and requisition expert; validates context and executes approved work. |
| Hiring manager | Provides role context, makes commitments, and owns hiring-team decisions. |
| ATS/HRIS administrator | Owns source-system configuration, data access, and integration support. |
| IT/Security | Owns identity, permissions, credentials, monitoring, and incident support. |

## Prerequisites

- The nightly ATS reconciliation completed or a documented exception identifies the last-known-good snapshot.
- Calendar aggregates, requisition/workforce plan, and prior-period benchmark meet their freshness SLAs.
- The workspace displays source version, reporting period, snapshot `as of` time, validation state, and comparison availability.
- Role, stage, owner, priority, and target-date mappings are approved.
- Calculation and threshold versions are known and unchanged, or an approved change record is attached.
- Participants have least-privilege access; task and notification handoffs are disabled unless explicitly approved.
- Previous-week actions and unresolved incidents are available.

## Weekly operating sequence

### Step 1 — Monday data-readiness check

**Owner:** Recruiting Operations; ATS/HRIS administrator supports source issues.

**Procedure**

1. Confirm the reporting period, enterprise timezone, snapshot `as of` time, and source versions.
2. Verify nightly ATS reconciliation, source freshness, row counts, rejected records, duplicates, schema drift, and material variance.
3. Confirm all approved requisitions have corresponding plan records and calendar aggregates where applicable.
4. Compare the accepted snapshot with the last-known-good snapshot and the source totals.
5. Mark the workspace **Ready**, **Ready with limitation**, or **Not ready**; record the reason and approver.

**Expected result:** One complete, reconciled snapshot is approved for Monday review, with any limitation visible and bounded.

**Failure handling:** Do not promote partial data. Keep the last-known-good snapshot active, label its true age, open an integration incident, and notify the TA leader. A review may proceed only if the TA leader accepts the documented limitation; no task handoff may rely on an unavailable source.

### Step 2 — Monday TA decision review

**Owner:** TA leader; Recruiting Operations facilitates.

**Procedure**

1. Review changes in approved demand, funnel stages, conversion, period deltas, interview SLA, aging, and forecast context.
2. Inspect each exception’s source lineage, calculation, threshold, and proposed recommendation.
3. Ask the recruiter and hiring manager for business context not present in aggregate data.
4. Choose one disposition for each item: **Prioritize**, **Monitor**, **Return for data correction**, or **Close with rationale**.
5. Confirm action, owner, due date, success evidence, and escalation point for every prioritized item.

**Expected result:** A short, ranked decision list with explicit human rationale and no unowned priority.

**Failure handling:** If evidence conflicts or the decision owner is absent, mark the item **Decision pending**, assign a fact-finding owner and deadline, and do not create an execution task. Candidate decisions and communications remain outside the workspace.

### Step 3 — task-assignment procedure

**Owner:** Recruiting Operations creates the handoff; TA leader approves; recruiter or hiring manager accepts ownership.

**Procedure**

1. Convert only an approved decision into a task payload.
2. Include decision ID, requisition ID, action summary, named owner, due date, priority, source snapshot ID, approval actor and timestamp, and completion evidence.
3. Search the external task system for the idempotency key before creation.
4. Create or update one task; capture the external task ID and returned status.
5. Ask the owner to confirm acceptance; keep decision state and task state linked but distinct.

**Expected result:** One traceable task per approved action, with no duplicate and a confirmed owner.

**Failure handling:** If the external task system is unavailable, record the approved action in the controlled fallback register, assign it verbally in the meeting, and retry later with the same idempotency key. Do not send an unapproved notification or create a second task.

### Step 4 — Thursday exception check

**Owner:** Recruiting Operations; recruiters update their actions; TA leader resolves material exceptions.

**Procedure**

1. Review source freshness and any incident opened since Monday.
2. Check overdue, unaccepted, blocked, or materially changed actions.
3. Re-examine high-risk requisitions and approved-demand changes using the latest reconciled snapshot.
4. Escalate only items meeting the agreed threshold; record changed context and decision.
5. Confirm that no automated recommendation changed an owner, task, ATS record, or candidate state without human approval.

**Expected result:** Blocked actions are corrected or escalated before week-end, and unchanged items stay out of the meeting flow.

**Failure handling:** If data is stale or materially inconsistent, freeze new handoffs for the affected source, retain existing task ownership, and invoke the incident or rollback procedure.

### Step 5 — Friday closure and rollover

**Owner:** Recruiting Operations; action owners supply evidence; TA leader approves rollover priorities.

**Procedure**

1. Reconcile decision records with external task status and owner-provided evidence.
2. Mark each action **Completed**, **Rollover**, **Canceled**, or **Blocked**; preserve rationale and actor.
3. Close resolved incidents and document any residual limitation.
4. Carry forward only unresolved decisions that still matter; do not duplicate their tasks.
5. Publish the internal weekly summary and update run history.

**Expected result:** The week closes with an auditable outcome for every priority and a clean starting queue for Monday.

**Failure handling:** Missing evidence prevents closure. Keep the item open, assign an evidence owner and deadline, and record the unresolved dependency. If task-state reconciliation fails, use the last confirmed external status and mark it stale.

## Verification checklist

- [ ] Reporting period, timezone, source versions, and `as of` time are visible.
- [ ] Nightly ATS reconciliation is complete or an accepted limitation is recorded.
- [ ] Calendar, approved-demand, and benchmark freshness meet the agreed SLA.
- [ ] Requisition, stage, owner, and target-date mappings passed validation.
- [ ] Every displayed recommendation has source and calculation lineage.
- [ ] Every prioritized item has human rationale, owner, due date, and success evidence.
- [ ] Every external task has an approval record and idempotency key.
- [ ] No duplicate task, unauthorized notification, source-system write, or candidate action occurred.
- [ ] Thursday exceptions and Friday outcomes are recorded.
- [ ] Run history includes status, limitations, incidents, and final approver.

## Troubleshooting

| Symptom | Likely cause | Operator response | Recovery proof |
|---|---|---|---|
| ATS snapshot is stale | Incremental sync or nightly reconciliation failed | Keep last-known-good snapshot, open incident, retry with same batch key, reconcile totals | Successful full reconciliation and approved snapshot promotion |
| Stage totals exceed the preceding stage | Mapping mismatch, duplicate row, or source definition change | Block promotion; validate stage taxonomy and deduplication | Corrected source totals and zero blocking validation errors |
| Approved requisition is missing | Plan/ATS join failure or late approved-demand event | Confirm source IDs and effective dates with source owners | Requisition present in both authoritative source and accepted snapshot |
| Calendar SLA is unavailable | Aggregate job failed or requisition key mismatch | Mark SLA unavailable; do not infer zero; repair mapping | Fresh aggregate with expected requisition coverage |
| Duplicate task appears | Retry used a new key or lookup failed | Stop further retries; preserve one canonical task; close duplicate with audit note | One active external task linked to the decision ID |
| Recommendation looks wrong | Stale snapshot, threshold issue, or missing business context | Inspect lineage; return for correction or override with rationale | Human disposition and, if needed, approved threshold change |
| User has unexpected access | Role-group drift or stale entitlement | Remove access, notify IT/Security, preserve access logs | Access recertified and incident closed |

## Rollback procedure

1. **Declare:** Recruiting Operations marks the affected source or snapshot unavailable and opens an incident.
2. **Freeze:** Disable new snapshot promotion and new task/notification handoffs for the affected scope.
3. **Repoint:** Restore the workspace to the last accepted immutable snapshot and display its actual `as of` time.
4. **Reconcile:** Compare source totals, mappings, schema, calculation version, and task handoffs against the failed release.
5. **Correct:** Repair in a non-production environment; rerun validation and idempotent reconciliation.
6. **Approve:** ATS/HRIS administrator confirms source integrity, Recruiting Operations confirms decision data, and TA leader approves return to service.
7. **Close:** Record impact, affected decisions/tasks, root cause, corrective action, and monitoring improvement.

Rollback never rewrites the ATS or erases the audit trail. Any task created from a bad snapshot is paused or corrected by a named human; it is not silently deleted.

## Escalation matrix

| Condition | First owner | Escalate to | Target response | Decision authority |
|---|---|---|---|---|
| Source freshness misses SLA, no decision impact | Recruiting Operations | ATS/HRIS administrator | Same business day | Recruiting Operations may use last-known-good data with visible warning |
| Failed nightly ATS reconciliation or material variance | ATS/HRIS administrator | IT/Security and TA leader | Before Monday review or within 2 business hours during review window | TA leader decides whether a limited review may proceed |
| Suspected unauthorized access or credential exposure | IT/Security | Security incident lead and system owner | Immediate, per incident policy | IT/Security controls containment; business owners assess impact |
| Task handoff failure or duplicate | Recruiting Operations | Task-system administrator and TA leader | Same business day | TA leader confirms manual fallback or pause |
| Threshold or forecast dispute | Recruiting Operations | TA leader and relevant recruiter/hiring manager | Before next prioritization | TA leader approves operational use; monthly governance approves rule change |
| Candidate-level data detected | Recruiting Operations | Privacy/Security and source owner | Immediate containment | Privacy/Security determines handling and restart conditions |

## Run history

No production runs are claimed or recorded. Use this table only after implementation.

| Run date | Snapshot ID / as-of | Readiness | Decisions / tasks | Limitations or incidents | Final approver |
|---|---|---|---|---|---|
| _YYYY-MM-DD_ | _ID / timestamp_ | _Ready / limited / not ready_ | _count / count_ | _reference or none_ | _name / timestamp_ |
