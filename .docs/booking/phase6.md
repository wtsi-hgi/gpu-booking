# Phase 6: Contract hardening and operations

Ref: [spec.md](spec.md) sections F1, F2, G2

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Batch 1 (parallel)

#### Item 6.1: F1 - REST contracts for future integration [parallel with 6.2]

spec.md section: F1

Implement and validate Pydantic-to-Zod contract parity across booking/admin API
responses and Server Actions, covering all 4 acceptance tests from spec.md
section F1.

- [ ] implemented
- [ ] reviewed

#### Item 6.2: F2 - Health/readiness and structured logging [parallel with 6.1]

spec.md section: F2

Implement readiness checks, external health route behavior, and JSON request
logging fields for machine parsing, covering all 4 acceptance tests from
spec.md section F2.

- [ ] implemented
- [ ] reviewed

### Item 6.3: G2 - Small-scale performance target

spec.md section: G2

Implement pagination/filter query behavior and test harnesses for target
responsiveness under fewer than 100 users; depends on F1/F2 API stability,
covering all 4 acceptance tests from spec.md section G2.

- [ ] implemented
- [ ] reviewed

For parallel batch items, use separate subagents per item.
Launch review subagents using the `code-reviewer` skill (review
all items in the batch together in a single review pass).
