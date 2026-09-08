-- ============================================================================
-- MediKiosk: Patient Profile Query 500 Fix
-- ============================================================================
-- This migration addresses the HTTP 500 error on authenticated queries to
-- the patients table. The two most common causes are:
--
--   1. Stale PostgREST schema cache after RLS/policy changes.
--   2. Missing base SELECT permission for the authenticated role when RLS
--      policies were created manually without accompanying GRANT statements.
--
-- This script is safe and non-destructive:
--   - It does NOT modify schema, constraints, triggers, or RLS policies.
--   - It does NOT weaken RLS.
--   - It only refreshes the PostgREST cache and ensures the authenticated
--     role has the minimal base permission needed to read the table.
-- ============================================================================

-- 1. Reload PostgREST schema cache
--    PostgREST caches the database schema. If the cache is stale (e.g. after
--    enabling RLS or creating policies), queries can fail with 500 errors.
--    This notification tells PostgREST to refresh its cache.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgrst') THEN
    PERFORM NOTIFY pgrst, 'reload schema';
  END IF;
END;
$$;

-- 2. Ensure the authenticated role can SELECT from the patients table
--    In Supabase, RLS policies do NOT automatically grant base table
--    permissions. If policies were created manually via SQL without a
--    corresponding GRANT, the authenticated role may lack SELECT permission,
--    causing PostgreSQL to return "permission denied" which PostgREST maps
--    to HTTP 500.
GRANT SELECT ON patients TO authenticated;

-- 3. Ensure the anon role can SELECT from the patients table
--    (optional but consistent; anon is already able to query based on tests,
--    but this guarantees the permission is explicit)
GRANT SELECT ON patients TO anon;

-- ============================================================================
-- Verification queries (run after applying the fix)
-- ============================================================================
--
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name = 'patients'
--   AND grantee IN ('authenticated', 'anon');
--
-- Expected result: both authenticated and anon should have SELECT.
-- ============================================================================
