-- ============================================================================
-- MediKiosk: Verify patients RLS Recursion Fix (003)
-- ----------------------------------------------------------------------------
-- Run AFTER applying 003_fix_patients_rls_recursion.sql.
-- All queries are READ-ONLY. No database modifications.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Confirm the three new helper functions exist and are SECURITY DEFINER
-- ----------------------------------------------------------------------------
SELECT
    p.proname AS function_name,
    p.prosecdef AS security_definer,
    p.prorettype::regtype AS return_type,
    p.prolang::regtype AS language,
    p.proconfig AS settings
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
      'can_admin_access_patient',
      'can_doctor_access_patient',
      'can_triage_access_patient'
  )
ORDER BY p.proname;

-- ----------------------------------------------------------------------------
-- 2. Confirm EXECUTE privileges on the new helpers
--    Expected: only 'authenticated' has EXECUTE.
--            'PUBLIC' and 'anon' must NOT have EXECUTE.
-- ----------------------------------------------------------------------------
SELECT
    e.grantee,
    e.privilege_type,
    e.is_grantable
FROM information_schema.role_table_grants r
JOIN pg_namespace n ON n.nspname = r.table_schema
JOIN pg_proc p ON p.pronamespace = n.oid AND p.proname = r.table_name
LEFT JOIN information_schema.function_privileges e
    ON e.function_schema = n.nspname
    AND e.function_name = p.proname
    AND e.grantee IN ('authenticated', 'anon', 'PUBLIC')
WHERE n.nspname = 'public'
  AND p.proname IN (
      'can_admin_access_patient',
      'can_doctor_access_patient',
      'can_triage_access_patient'
  )
ORDER BY p.proname, e.grantee;

-- ----------------------------------------------------------------------------
-- 3. Confirm the three patients SELECT policies now use the helpers
--    and still target TO authenticated.
-- ----------------------------------------------------------------------------
SELECT
    tablename,
    policyname,
    cmd,
    roles,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'patients'
  AND policyname IN (
      'patients_select_admin',
      'patients_select_doctor',
      'patients_select_triage'
  )
ORDER BY policyname;

-- ----------------------------------------------------------------------------
-- 4. Confirm the UNCHANGED policies are still present
--    (patients_select_own, patients_insert_own, patients_update_own,
--     interviews_select_own, interviews_insert_own, interviews_update_own)
-- ----------------------------------------------------------------------------
SELECT
    tablename,
    policyname,
    cmd,
    roles,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('patients', 'interviews')
  AND policyname IN (
      'patients_select_own',
      'patients_insert_own',
      'patients_update_own',
      'interviews_select_own',
      'interviews_insert_own',
      'interviews_update_own'
  )
ORDER BY tablename, policyname;

-- ----------------------------------------------------------------------------
-- 5. Confirm the existing helper functions (is_hospital_admin,
--    is_super_admin, is_hospital_member) are SECURITY DEFINER and restricted.
--    Review these BEFORE applying the migration to ensure the new helpers
--    inherit the same security posture.
-- ----------------------------------------------------------------------------
SELECT
    p.proname AS function_name,
    p.prosecdef AS security_definer,
    p.prorettype::regtype AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
      'is_hospital_admin',
      'is_super_admin',
      'is_hospital_member'
  )
ORDER BY p.proname;

-- ----------------------------------------------------------------------------
-- 6. Confirm EXECUTE privileges on the existing helpers
--    Expected: only 'authenticated' (or a specific role) has EXECUTE.
-- ----------------------------------------------------------------------------
SELECT
    e.grantee,
    e.function_schema,
    e.function_name,
    e.privilege_type,
    e.is_grantable
FROM information_schema.function_privileges e
JOIN pg_proc p ON p.proname = e.function_name
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'is_hospital_admin',
      'is_super_admin',
      'is_hospital_member'
  )
  AND e.grantee IN ('authenticated', 'anon', 'PUBLIC')
ORDER BY p.proname, e.grantee;

-- ----------------------------------------------------------------------------
-- 7. Functional test: run as 'authenticated'
--    Replace <test_user_id> and <test_patient_id> with real values.
--    Expected: NO 42P17 error. Queries succeed when access is granted.
-- ----------------------------------------------------------------------------
SET ROLE authenticated;

-- Patient can access own record
SELECT full_name, mrn
FROM patients
WHERE user_id = '<test_user_id>'
LIMIT 1;

-- Doctor/triage/admin can access a patient via interviews
SELECT id, full_name
FROM patients
WHERE id = '<test_patient_id>'
LIMIT 1;

-- Interviews still accessible
SELECT id, patient_id, hospital_id, status
FROM interviews
WHERE patient_id = '<test_patient_id>'
LIMIT 1;

RESET ROLE;