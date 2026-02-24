# Phase 2: Authentication

Ref: [spec.md](spec.md) sections B1, I1, B2, B3, B4

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Item 2.1: B1 - Auth configuration

spec.md section: B1

Add auth_mode, Okta settings (okta_issuer, okta_client_id,
okta_client_secret, okta_audience), database_url, and
initial_admin_emails fields to the existing Settings class in
config.py. See spec.md for full details and 3 acceptance tests.

- [ ] implemented
- [ ] reviewed

### Batch 2 (parallel)

#### Item 2.2: I1 - Structured JSON logging [parallel with 2.3]

spec.md section: I1

Configure Python logging to output structured JSON with
timestamp, level, message, and logger name. Add request-scoped
context (request_id, user_email, path, method, status_code)
via middleware. Log level configurable via LOG_LEVEL env var.
See spec.md for full details and 5 acceptance tests.

- [ ] implemented
- [ ] reviewed

#### Item 2.3: B2 - Auth middleware [parallel with 2.2]

spec.md section: B2

Implement `get_current_user` dependency (insecure mode reads
X-Dev-User header; OIDC mode validates Bearer token) and
`require_admin` dependency (raises 403 for non-admins). Check
admin status against the admins table. See spec.md for full
details and 6 acceptance tests.

- [ ] implemented
- [ ] reviewed

### Item 2.4: B3 - Auth endpoint and Zod contract

spec.md section: B3

Implement GET /api/v1/auth/me returning UserInfo (email,
is_admin, auth_mode). Create the userInfoSchema Zod schema in
auth-contracts.ts and the getCurrentUser Server Action. See
spec.md for full details and 5 acceptance tests.

- [ ] implemented
- [ ] reviewed

### Item 2.5: B4 - Frontend auth provider and user switch

spec.md section: B4

Build the AuthProvider React context component and UserSwitch
dropdown (visible only in insecure mode). AuthProvider calls
getCurrentUser on mount. UserSwitch lets dev users type an
email to impersonate. See spec.md for full details and 4
acceptance tests.

- [ ] implemented
- [ ] reviewed

For parallel batch items, use separate subagents per item.
Launch review subagents using the `code-reviewer` skill (review
all items in the batch together in a single review pass).
