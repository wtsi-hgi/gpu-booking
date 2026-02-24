# Phase 5: Admin review and edit workflows

Ref: [spec.md](spec.md) sections E1, E2, E3

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Item 5.1: E1 - Admin decisioning and internal reasoning

spec.md section: E1

Implement admin status transitions with default `UNCONFIRMED`, internal-only
reason storage, and non-admin redaction, covering all 4 acceptance tests from
spec.md section E1.

- [ ] implemented
- [ ] reviewed

### Batch 1 (parallel, after item 5.1 is reviewed)

#### Item 5.2: E2 - Admin booking edits and audit stamps [parallel with 5.3]

spec.md section: E2

Implement admin edit mutations with `last_modified_at` and
`last_modified_by` tracking and policy revalidation, covering all 4 acceptance
tests from spec.md section E2.

- [ ] implemented
- [ ] reviewed

#### Item 5.3: E3 - First-come queue and priority overrides [parallel with 5.2]

spec.md section: E3

Implement first-come admin review queue, required-reason strategic overrides,
and non-admin redaction of internal queue metadata, covering all 4 acceptance
tests from spec.md section E3.

- [ ] implemented
- [ ] reviewed

For parallel batch items, use separate subagents per item.
Launch review subagents using the `code-reviewer` skill (review
all items in the batch together in a single review pass).
