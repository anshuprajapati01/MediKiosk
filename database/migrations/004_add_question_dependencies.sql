-- ============================================================================
-- MediKiosk: Add Question Dependencies for Adaptive Questioning (004)
-- ============================================================================
-- Adds conditional branching columns to the questions table so that
-- follow-up questions can be shown/hidden based on prior answers.
--
-- Columns:
--   depends_on_question_id  UUID  -> questions(id)  NULLABLE
--     The question that must be answered first for this question to appear.
--
--   depends_on_answer       TEXT  NULLABLE
--     The exact answer value that triggers this question.
--     Stored as TEXT so it works across question types (text, number, choice).
--     For complex conditions (e.g. numeric ranges, multi-select), this can
--     later be expanded to JSONB without breaking the simple equality case.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Add dependency columns to questions
-- ----------------------------------------------------------------------------

ALTER TABLE questions
    ADD COLUMN depends_on_question_id UUID
        REFERENCES questions(id) ON DELETE RESTRICT,
    ADD COLUMN depends_on_answer TEXT;

-- ----------------------------------------------------------------------------
-- 2. Comments
-- ----------------------------------------------------------------------------

COMMENT ON COLUMN questions.depends_on_question_id IS
    'If set, this question is only shown when the referenced prior question has been answered.';

COMMENT ON COLUMN questions.depends_on_answer IS
    'The answer value that triggers this question. NULL means any non-empty answer to depends_on_question_id triggers it.';

-- ----------------------------------------------------------------------------
-- 3. Index for adaptive question lookups
-- ----------------------------------------------------------------------------

CREATE INDEX idx_questions_depends_on_question_id
    ON questions(depends_on_question_id)
    WHERE depends_on_question_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Reload PostgREST schema cache so the new columns are exposed via API
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
-- DROP INDEX idx_questions_depends_on_question_id;
-- ALTER TABLE questions
--     DROP COLUMN depends_on_answer,
--     DROP COLUMN depends_on_question_id;
-- ============================================================================
