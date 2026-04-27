# Phase 7: Admin Configuration UI

Ref: [spec.md](spec.md) sections C5, C6, C7, H3

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Batch 1 (parallel)

#### Item 7.1: C5 - Admin GPU type config UI [parallel with 7.2, 7.3, 7.4]

spec.md section: C5

Build the admin GPU type management page at
frontend/app/admin/gpu-types/page.tsx and the
gpu-type-manager component. Displays a table of GPU types
(Name, GRAM, System Memory, Total Count, Actions) with
add and edit functionality via Server Actions using
useActionState. See spec.md for Server Action signatures
and 4 acceptance tests.

- [x] implemented
- [x] reviewed

#### Item 7.2: C6 - Admin workflow type config UI [parallel with 7.1, 7.3, 7.4]

spec.md section: C6

Build the admin workflow type management page at
frontend/app/admin/workflow-types/page.tsx and the
workflow-type-manager component. Table with Name and
Actions columns; supports add, edit, and delete. Delete is
blocked if the workflow type is in use by a booking. See
spec.md for 4 acceptance tests.

- [x] implemented
- [x] reviewed

#### Item 7.3: C7 - Admin GRAM and memory options config UI [parallel with 7.1, 7.2, 7.4]

spec.md section: C7

Build the admin memory options page at
frontend/app/admin/memory-options/page.tsx and the
memory-option-manager component. Page has two sections:
GRAM Options and System Memory Options, each with a table
(Label, Value GB, Sort Order, Actions) supporting add,
edit, and delete. See spec.md for 3 acceptance tests.

- [x] implemented
- [x] reviewed

#### Item 7.4: H3 - Admin dashboard [parallel with 7.1, 7.2, 7.3]

spec.md section: H3

Build the admin dashboard at frontend/app/admin/page.tsx.
Shows a heading, cards linking to all admin pages (Manage
Bookings, GPU Types, Workflow Types, Memory Options), and
summary stats (pending bookings, confirmed bookings this
month, GPU types configured). Non-admin users see an
"Access Denied" message. See spec.md for 3 acceptance
tests.

- [x] implemented
- [x] reviewed

For parallel batch items, use separate subagents per item.
Launch review subagents using the `code-reviewer` skill (review
all items in the batch together in a single review pass).
