-- ============================================================================
-- MediKiosk: Fix patients RLS Recursion (003)
-- ----------------------------------------------------------------------------
-- Circular dependency: patients -> interviews -> patients
--   patients_select_admin / _doctor / _triage query interviews inline,
--   and interviews_select_own queries patients, causing 42P17.
--
-- Fix: Replace the three patients SELECT policies' inline EXISTS subqueries
--       with SECURITY DEFINER helper functions that scan interviews WITHOUT
--       invoking RLS on interviews (function owner context).
--
-- Safety:
--   - RLS stays enabled on patients and interviews.
--   - patients_select_own / _insert / _update: UNCHANGED.
--   - interviews_select_own / _insert / _update: UNCHANGED.
--   - Only patients_select_admin / _doctor / _triage are replaced.
--   - All three replacement policies keep "TO authenticated".
--   - New helpers return boolean only; no patient data exposed.
--   - New helpers: REVOKE EXECUTE FROM PUBLIC, anon; GRANT TO authenticated.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. SECURITY DEFINER helpers
--    Each runs as the function owner, bypassing RLS on interviews and
--    user_hospitals, so interviews_select_own is never triggered recursively.
--    Returns boolean only — no row or column data is exposed.
-- ----------------------------------------------------------------------------

CREATE FUNCTION can_admin_access_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM interviews i
        WHERE i.patient_id = p_patient_id
          AND (is_hospital_admin(i.hospital_id) OR is_super_admin())
    );
$$;

CREATE FUNCTION can_doctor_access_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM interviews i
        WHERE i.patient_id = p_patient_id
          AND is_hospital_member(i.hospital_id, 'doctor')
    );
$$;

CREATE FUNCTION can_triage_access_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM interviews i
        WHERE i.patient_id = p_patient_id
          AND is_hospital_member(i.hospital_id, 'triage')
    );
$$;

-- ----------------------------------------------------------------------------
-- 2. Lock down EXECUTE on the new helpers
--    PUBLIC and anon must NOT be able to call them.
--    Only authenticated may execute.
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION can_admin_access_patient(uuid)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION can_doctor_access_patient(uuid)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION can_triage_access_patient(uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION can_admin_access_patient(uuid)   FROM anon;
REVOKE EXECUTE ON FUNCTION can_doctor_access_patient(uuid)  FROM anon;
REVOKE EXECUTE ON FUNCTION can_triage_access_patient(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION can_admin_access_patient(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION can_doctor_access_patient(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION can_triage_access_patient(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Replace the three patients SELECT policies
--    Each keeps "TO authenticated" (same role restriction as before).
-- ----------------------------------------------------------------------------

DROP POLICY patients_select_admin ON patients;
CREATE POLICY patients_select_admin
ON patients
FOR SELECT
TO authenticated
USING (can_admin_access_patient(id));

DROP POLICY patients_select_doctor ON patients;
CREATE POLICY patients_select_doctor
ON patients
FOR SELECT
TO authenticated
USING (can_doctor_access_patient(id));

DROP POLICY patients_select_triage ON patients;
CREATE POLICY patients_select_triage
ON patients
FOR SELECT
TO authenticated
USING (can_triage_access_patient(id));

-- ----------------------------------------------------------------------------
-- 4. Reload PostgREST schema cache so the new functions/policies are visible
--    to the API layer.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgrst') THEN
    PERFORM NOTIFY pgrst, 'reload schema';
  END IF;
END;
$$;

COMMIT;

-- ============================================================================
-- ROLLBACK (run separately if needed; NOT part of the migration transaction)
-- ============================================================================
-- DROP POLICY patients_select_admin ON patients;
-- DROP POLICY patients_select_doctor ON patients;
-- DROP POLICY patients_select_triage ON patients;
--
-- CREATE POLICY patients_select_admin
-- ON patients FOR SELECT TO authenticated
-- USING (
--     EXISTS (
--         SELECT 1 FROM interviews i
--         WHERE i.patient_id = patients.id
--           AND (is_hospital_admin(i.hospital_id) OR is_super_admin())
--     )
-- );
--
-- CREATE POLICY patients_select_doctor
-- ON patients FOR SELECT TO authenticated
-- USING (
--     EXISTS (
--         SELECT 1 FROM interviews i
--         WHERE i.patient_id = patients.id
--           AND is_hospital_member(i.hospital_id, 'doctor')
--     )
-- );
--
-- CREATE POLICY patients_select_triage
-- ON patients FOR SELECT TO authenticated
-- USING (
--     EXISTS (
--         SELECT 1 FROM interviews i
--         WHERE i.patient_id = patients.id
--           AND is_hospital_member(i.hospital_id, 'triage')
--     )
-- );
--
-- DROP FUNCTION IF EXISTS can_admin_access_patient(uuid);
-- DROP FUNCTION IF EXISTS can_doctor_access_patient(uuid);
-- DROP FUNCTION IF EXISTS can_triage_access_patient(uuid);
-- ============================================================================