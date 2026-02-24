# Phase 4: User booking lifecycle and views

Ref: [spec.md](spec.md) sections C3, D1, D2

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Item 4.1: C3 - User cancel permissions and admin edit boundary

spec.md section: C3

Implement ownership-aware cancellation and admin-only edit permissions,
covering all 4 acceptance tests from spec.md section C3.

- [ ] implemented
- [ ] reviewed

### Batch 1 (parallel, after item 4.1 is reviewed)

#### Item 4.2: D1 - Monthly calendar capacity view and drag creation [parallel with 4.3]

spec.md section: D1

Implement month-grid calendar with GPU filter, capacity percentages, available
GPU display, status-based visual differentiation, and drag date prefill,
covering all 5 acceptance tests from spec.md section D1.

- [ ] implemented
- [ ] reviewed

#### Item 4.3: D2 - Searchable and sortable booking table [parallel with 4.2]

spec.md section: D2

Implement paginated booking table with sorting, filters, project search, and
non-admin field redaction, covering all 4 acceptance tests from spec.md
section D2.

- [ ] implemented
- [ ] reviewed

For parallel batch items, use separate subagents per item.
Launch review subagents using the `code-reviewer` skill (review
all items in the batch together in a single review pass).
