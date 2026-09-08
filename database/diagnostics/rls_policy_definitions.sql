-- ============================================================================
-- MediKiosk: RLS Policy Definitions for patients, interviews, users (READ-ONLY)
-- ============================================================================
-- Returns the exact live policy definitions from pg_policies for the three
-- tables involved in the patients <-> interviews circular dependency.
-- Nothing here modifies any database object.
-- ============================================================================

SELECT
    tablename,
    policyname,
    cmd,
    roles,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('patients', 'interviews', 'users')
ORDER BY tablename, policyname;