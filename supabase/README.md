# Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Create a Storage bucket named `project-models` (or set `SUPABASE_MODELS_BUCKET`).
4. Keep the bucket private if you want signed URLs only.
5. Set env vars from `.env.example`.

Required env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_MODELS_BUCKET` (optional, default: `project-models`)
- `SUPABASE_SIGNED_URL_TTL` (optional, seconds; default: `3600`)
- `NEXT_PUBLIC_SIGNED_URL_TTL` (optional, seconds; default: `3600`)
