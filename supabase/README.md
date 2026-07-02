# Supabase Local Verification

This project uses Supabase Auth + Postgres + Row Level Security for the MVP
backend, but the frontend is not wired to Supabase yet.

## Prerequisites

- Docker Desktop or a compatible local Docker runtime.
- Supabase CLI.

Useful official docs:

- Local development overview: https://supabase.com/docs/guides/local-development/overview
- CLI getting started: https://supabase.com/docs/guides/local-development/cli/getting-started
- CLI reference for `db reset` and `test db`: https://supabase.com/docs/reference/cli/introduction

The Supabase CLI can be run with `npx supabase ...` if it is not installed as a
standalone binary. The official docs currently recommend Node.js 20+ for the
`npx` route.

## Local Commands

```bash
# Start the local Supabase stack.
npx supabase start

# Recreate local Postgres and apply migrations from supabase/migrations.
npx supabase db reset

# Run pgTAP verification files from supabase/tests.
npx supabase test db
```

## What The Current Tests Verify

`supabase/tests/quick_contact_rls.sql` verifies the quick-contact MVP schema:

- active courts are publicly readable.
- `public_profile_discovery` exists and includes `line_id`.
- private profiles are excluded from `public_profile_discovery`.
- authenticated users can read and update only their own profile.
- authenticated users can create partner requests only for their own profile.
- authenticated users can create/read only their own reports.
- the old invite table is not part of the quick-contact MVP schema.

## Product Boundary

Quick contact is a UI gate, not a database secrecy boundary. Public player data
can include `line_id`; the app hides it on the first card layer and reveals it
only after the user taps `快速約球`.

Do not connect a hosted Supabase project until the local migration and tests pass.
