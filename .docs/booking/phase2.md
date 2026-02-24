# Phase 2: Auth and authorization modes

Ref: [spec.md](spec.md) sections A1, A2

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Item 2.1: A1 - Okta OIDC login with DB-backed admin role

spec.md section: A1

Implement OIDC login/session handling and admin-role enforcement via
allowlisted email checks, covering all 4 acceptance tests from spec.md
section A1.

- [ ] implemented
- [ ] reviewed

### Item 2.2: A2 - Insecure testing mode with user switch

spec.md section: A2

Implement `AUTH_MODE=insecure` auth bypass with persona switching and admin
state toggling; depends on A1 auth plumbing, covering all 4 acceptance tests
from spec.md section A2.

- [ ] implemented
- [ ] reviewed
