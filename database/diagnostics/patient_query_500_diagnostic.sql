-- ============================================================================
-- MediKiosk: Patient Profile Query 500 Diagnostic
-- ============================================================================
-- Run these queries in the Supabase SQL Editor to diagnose the 500 error
-- on authenticated queries to the patients table.
-- ============================================================================

-- 1. Check if PostgREST schema cache may be stale
--    After schema changes, PostgREST caches the schema. A stale cache can
--    cause 500 errors. Reloading the cache fixes this.
SELECT NOT EXISTS (
  SELECT 1 FROM pg_extension WHERE extname = 'pgrst'
) AS pgrst_extension_exists;

-- 2. Inspect RLS policies on the patients table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check_expression
FROM pg_policies
WHERE tablename = 'patients'
  AND schemaname = 'public'
ORDER BY cmd, policyname;

-- 3. Inspect RLS policies on the users table (patients.user_id references users)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check_expression
FROM pg_policies
WHERE tablename = 'users'
  AND schemaname = 'public'
ORDER BY cmd, policyname;

-- 4. Check table permissions for the authenticated and anon roles
SELECT
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND grantee IN ('authenticated', 'anon')
ORDER BY grantee, privilege_type;

-- 5. Check if the authenticated role can access the patients table at all
--    (run this as a superuser or with appropriate permissions)
SELECT has_table_privilege('authenticated', 'public.patients', 'SELECT') AS authenticated_can_select;
SELECT has_table_privilege('anon', 'public.patients', 'SELECT') AS anon_can_select;

-- 6. List all functions in the public schema that might be used by RLS policies
SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY function_name;

-- 7. Check for any rules on the patients table that could rewrite queries
SELECT
  schemaname,
  tablename,
  rulename,
  definition
FROM pg_rules
WHERE tablename = 'patients'
  AND schemaname = 'public';

-- 8. Reproduce the exact failing query as the authenticated role
--    This requires setting the role to authenticated, which may not work
--    in the SQL Editor. If it fails, the error message will reveal the root cause.
SET ROLE authenticated;
SELECT full_name, mrn FROM patients WHERE user_id = 'd85fa803-f413-4ebd-aa9e-f04be0fc5cf8' LIMIT 1;
RESET ROLE;
