# Phase 3: Booking creation and policy engine

Ref: [spec.md](spec.md) sections C1, C2

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Item 3.1: C2 - Policy warning engine and hard-capacity block

spec.md section: C2

Implement warning/blocking policy computation for advance notice, duration,
40% requester share, and 100% hard-capacity enforcement, covering all 5
acceptance tests from spec.md section C2.

- [ ] implemented
- [ ] reviewed

### Item 3.2: C1 - Booking form and API field preservation

spec.md section: C1

Implement booking create form/API with required and optional fields, memory
mode behavior, and UK day-boundary semantics; depends on C2 validation engine,
covering all 7 acceptance tests from spec.md section C1.

- [ ] implemented
- [ ] reviewed
