-- ============================================================================
-- MediKiosk Initial Database Schema
-- ============================================================================
-- Designed for Supabase PostgreSQL (PostgreSQL 15+ on Supabase).
-- This migration creates the core relational schema for the MediKiosk platform.
--
-- FHIR / ABDM Readiness:
--   The relational schema below is intentionally kept as native tables and is
--   NOT rewritten into FHIR resources. A future adapter layer will map these
--   tables to FHIR R4 resources:
--     patients          -> Patient
--     interviews        -> Encounter
--     clinical_histories -> Condition, Observation
--     vital_signs       -> Observation (vital-signs profile)
--     medications       -> MedicationStatement / MedicationRequest
--     allergies         -> AllergyIntolerance
--     documents / document_extractions -> DocumentReference, Binary
--     lab_results       -> DiagnosticReport, Observation
--     doctors           -> Practitioner, PractitionerRole
--     hospitals         -> Organization
--     departments       -> Organization (department sub-unit)
--     consents          -> Consent
--     users / user_hospitals -> PractitionerRole, RelatedPerson
--     ai_outputs / doctor_reviews -> Communication, DetectedIssue (custom profiles)
--     audit_logs        -> Provenance
--   ABDM integration (ABHA ID, consent manager, health lockers) will be
--   implemented behind an adapter interface so ABDM-specific flows do not
--   pollute the core domain model.
--
-- Soft Deletion:
--   User-facing entities (users, hospitals, departments, patients, doctors,
--   user_hospitals) use is_active + deleted_at for soft deletion so that
--   historical relationships and audit trails remain intact. Clinical
--   detail tables (interviews, answers, vital_signs, medications, allergies,
--   documents, lab_results, clinical_histories, etc.) do NOT support soft
--   delete; they are append-only or lifecycle-managed via status columns.
--   These clinical records are never hard-deleted to preserve medical history
--   and audit integrity.
--
-- AI Human-in-the-Loop:
--   ai_outputs, ai_evidence, triage_flags, and doctor_reviews model the
--   human-in-the-loop review cycle: AI generates drafts/evidence/flags,
--   staff acknowledge and resolve them, and doctors formally review/approve.
--   deleted_at is intentionally omitted from these tables so that every
--   step of the AI review process is auditable.
--
-- Auth Integration:
--   The users table references auth.users(id) via a foreign key. When a
--   Supabase auth user is deleted, the public.users profile row is cascade
--   deleted. Downstream clinical references to users.id use SET NULL or
--   RESTRICT so that clinical records are preserved even if a user account
--   is removed.
--
-- Row Level Security:
--   RLS policies are NOT included in this migration. They will be designed
--   and reviewed separately after the schema is verified.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- users
--   Core auth/profile record for every login identity.
--   id references auth.users(id) — the Supabase auth provider table.
--   When an auth user is hard-deleted, the profile is also removed (CASCADE).
--   email is UNIQUE to prevent duplicate accounts.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    role          VARCHAR(50)  NOT NULL,
    full_name     VARCHAR(255),
    phone         VARCHAR(50),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT users_role_check CHECK (role IN ('patient', 'doctor', 'triage', 'admin'))
);

COMMENT ON TABLE users IS 'Auth profile extending auth.users(id). CASCADE delete from auth.users; clinical FKs to users use SET NULL / RESTRICT.';
COMMENT ON COLUMN users.deleted_at IS 'Soft-delete timestamp. NULL means active.';


-- ----------------------------------------------------------------------------
-- hospitals
--   Healthcare facility records. Soft-deletable via is_active + deleted_at.
-- ----------------------------------------------------------------------------
CREATE TABLE hospitals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    address     TEXT,
    timezone    VARCHAR(100) NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE hospitals IS 'Healthcare facilities. Soft-deletable; hospital_id on downstream tables is RESTRICT-deleted.';


-- ----------------------------------------------------------------------------
-- departments
--   Clinical departments within a hospital. Soft-deletable.
--   hospital_id is NOT NULL — a department always belongs to a hospital.
-- ----------------------------------------------------------------------------
CREATE TABLE departments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
    name        VARCHAR(255) NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE departments IS 'Clinical departments scoped to a hospital. Soft-deletable; RESTRICT prevents deleting a hospital with departments.';
COMMENT ON COLUMN departments.deleted_at IS 'Soft-delete timestamp.';


-- ----------------------------------------------------------------------------
-- user_hospitals
--   Many-to-many membership linking users to hospitals.
--   Surrogate UUID PK; UNIQUE(user_id, hospital_id) enforces single membership.
--   CASCADE on user deletion (membership cleanup, not clinical data).
-- ----------------------------------------------------------------------------
CREATE TABLE user_hospitals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hospital_id     UUID NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
    membership_role VARCHAR(50) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT user_hospitals_membership_role_check CHECK (membership_role IN ('doctor', 'triage', 'admin')),
    CONSTRAINT user_hospitals_unique_membership UNIQUE (user_id, hospital_id)
);

COMMENT ON TABLE user_hospitals IS 'Scoped hospital membership for users. UNIQUE(user_id, hospital_id) prevents duplicate memberships.';


-- ----------------------------------------------------------------------------
-- patients
--   Clinical patient profile. user_id is nullable for anonymous/walk-in
--   patients. Unique constraint on user_id ensures 1:1 with users.
--   Soft-deletable.
-- ----------------------------------------------------------------------------
CREATE TABLE patients (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    mrn         VARCHAR(100) NOT NULL,
    full_name   VARCHAR(255) NOT NULL,
    dob         DATE,
    gender      VARCHAR(20),
    phone       VARCHAR(50),
    email       VARCHAR(255),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT patients_user_unique UNIQUE (user_id),
    CONSTRAINT patients_mrn_unique UNIQUE (mrn)
);

COMMENT ON TABLE patients IS 'Patient demographics. user_id nullable for walk-in patients; SET NULL on user deletion preserves clinical history. Soft-deletable.';


-- ----------------------------------------------------------------------------
-- doctors
--   Provider profile extending a user account. UNIQUE(user_id) enforces
--   1:1 relationship — one user can have at most one doctor profile.
--   Soft-deletable.
-- ----------------------------------------------------------------------------
CREATE TABLE doctors (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id          UUID REFERENCES departments(id) ON DELETE SET NULL,
    license_number         VARCHAR(100),
    consultation_settings  JSONB,
    is_active              BOOLEAN      NOT NULL DEFAULT TRUE,
    deleted_at             TIMESTAMPTZ,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT doctors_user_unique UNIQUE (user_id)
);

COMMENT ON TABLE doctors IS 'Provider profile. UNIQUE(user_id) enforces 1:1 with users. CASCADE from users; department SET NULL on deletion.';


-- ----------------------------------------------------------------------------
-- questionnaires
--   Questionnaire definitions. No soft delete — versioning + is_active only.
--   UNIQUE(name, version) prevents duplicate versions of the same questionnaire.
-- ----------------------------------------------------------------------------
CREATE TABLE questionnaires (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    version     VARCHAR(50)  NOT NULL,
    category    VARCHAR(50)  NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT questionnaires_category_check CHECK (category IN ('clinical', 'ayush')),
    CONSTRAINT questionnaires_name_version_unique UNIQUE (name, version)
);

COMMENT ON TABLE questionnaires IS 'Questionnaire definitions with versioning. UNIQUE(name, version) prevents duplicate versions. No soft delete.';


-- ----------------------------------------------------------------------------
-- questionnaire_sections
--   Optional grouping of questions within a questionnaire.
--   CASCADE from questionnaires (sections are part of the questionnaire definition).
-- ----------------------------------------------------------------------------
CREATE TABLE questionnaire_sections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id UUID NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE questionnaire_sections IS 'Ordered sections within a questionnaire. CASCADE from questionnaires.';


-- ----------------------------------------------------------------------------
-- questions
--   Reusable question definitions. section_id is nullable — questions may
--   belong directly to a questionnaire without a section.
--   CASCADE from questionnaires; SET NULL from sections.
-- ----------------------------------------------------------------------------
CREATE TABLE questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id UUID NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
    section_id      UUID REFERENCES questionnaire_sections(id) ON DELETE SET NULL,
    text            TEXT NOT NULL,
    type            VARCHAR(50) NOT NULL,
    category        VARCHAR(100),
    validation_rules JSONB,
    locale          VARCHAR(20)  DEFAULT 'en',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT questions_type_check CHECK (type IN ('text', 'number', 'choice', 'multi_select', 'date'))
);

COMMENT ON TABLE questions IS 'Question definitions. section_id nullable for top-level questions. CASCADE from questionnaires, SET NULL from sections.';


-- ----------------------------------------------------------------------------
-- interviews
--   Top-level clinical session record for a patient encounter.
--   Status column manages the full lifecycle (no soft delete).
--   questionnaire_id records which versioned questionnaire was used.
--   assigned_doctor_id is nullable (may not be assigned at intake time).
-- ----------------------------------------------------------------------------
CREATE TABLE interviews (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    hospital_id       UUID NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
    questionnaire_id  UUID NOT NULL REFERENCES questionnaires(id) ON DELETE RESTRICT,
    department_id     UUID REFERENCES departments(id) ON DELETE SET NULL,
    assigned_doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
    intake_type       VARCHAR(20),
    started_at        TIMESTAMPTZ,
    ended_at          TIMESTAMPTZ,
    status            VARCHAR(50) NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT interviews_intake_type_check CHECK (intake_type IN ('kiosk', 'web', 'walk_in')),
    CONSTRAINT interviews_status_check CHECK (status IN ('draft', 'in_progress', 'awaiting_review', 'under_review', 'completed', 'cancelled'))
);

COMMENT ON TABLE interviews IS 'Clinical encounter session. Lifecycle managed by status (no soft delete). FKs RESTRICT/SET NULL to preserve clinical history.';


-- ----------------------------------------------------------------------------
-- consents
--   Informed consent records. Append-only (no soft delete, no updated_at) — immutable once accepted.
-- ----------------------------------------------------------------------------
CREATE TABLE consents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    consent_type  VARCHAR(100) NOT NULL,
    version       VARCHAR(50)  NOT NULL,
    status        VARCHAR(50)  NOT NULL,
    consented_at  TIMESTAMPTZ,
    ip_address    INET,
    kiosk_id      VARCHAR(100),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT consents_status_check CHECK (status IN ('pending', 'accepted', 'rejected', 'expired'))
);

COMMENT ON TABLE consents IS 'Informed consent records. Append-only; immutable once accepted. RESTRICT on patient deletion.';


-- ----------------------------------------------------------------------------
-- answers
--   Responses to questions within an interview. No soft delete.
--   RESTRICT on interview/question deletion prevents data loss.
-- ----------------------------------------------------------------------------
CREATE TABLE answers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    value       TEXT,
    units       VARCHAR(100),
    notes       TEXT,
    confidence  NUMERIC(5,4),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT answers_interview_question_unique UNIQUE (interview_id, question_id)
);

COMMENT ON TABLE answers IS 'Interview responses. RESTRICT on interview/question deletion. value stored as TEXT, interpreted by question type.';


-- ----------------------------------------------------------------------------
-- vital_signs
--   Structured vital-sign measurements. No soft delete.
--   recorded_by is SET NULL if the user is deleted (preserves the measurement).
-- ----------------------------------------------------------------------------
CREATE TABLE vital_signs (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id              UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    recorded_by               UUID REFERENCES users(id) ON DELETE SET NULL,
    blood_pressure_systolic   INTEGER,
    blood_pressure_diastolic  INTEGER,
    pulse                     INTEGER,
    respiratory_rate          INTEGER,
    temperature               NUMERIC(5,2),
    spo2                      NUMERIC(5,2),
    height                    NUMERIC(6,2),
    weight                    NUMERIC(6,2),
    recorded_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vital_signs IS 'Structured vital signs per interview. recorded_by SET NULL on user deletion. Never hard-deleted.';


-- ----------------------------------------------------------------------------
-- clinical_histories
--   Structured medical history summaries per interview or per patient.
--   summary stored as JSONB for flexible structured content.
--   No soft delete.
-- ----------------------------------------------------------------------------
CREATE TABLE clinical_histories (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    history_type VARCHAR(100) NOT NULL,
    summary      JSONB,
    source       VARCHAR(100),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clinical_histories IS 'Medical history summaries. FHIR mapping: Condition / Observation. RESTRICT on patient/interview deletion.';


-- ----------------------------------------------------------------------------
-- medications
--   Current and past medications. No soft delete.
-- ----------------------------------------------------------------------------
CREATE TABLE medications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    name         VARCHAR(255) NOT NULL,
    dosage       VARCHAR(255),
    frequency    VARCHAR(100),
    route        VARCHAR(100),
    start_date   DATE,
    end_date     DATE,
    source       VARCHAR(100),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE medications IS 'Medication records. FHIR mapping: MedicationStatement / MedicationRequest.';


-- ----------------------------------------------------------------------------
-- allergies
--   Allergy / adverse reaction records. No soft delete.
-- ----------------------------------------------------------------------------
CREATE TABLE allergies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    allergen    VARCHAR(255) NOT NULL,
    reaction    TEXT,
    severity    VARCHAR(50),
    source      VARCHAR(100),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE allergies IS 'Allergy records. FHIR mapping: AllergyIntolerance.';


-- ----------------------------------------------------------------------------
-- documents
--   Uploaded clinical documents (ID, prescriptions, reports).
--   file_path references a Supabase Storage object.
--   No soft delete.
-- ----------------------------------------------------------------------------
CREATE TABLE documents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    file_path    VARCHAR(1024) NOT NULL,
    mime_type    VARCHAR(100),
    size         BIGINT,
    source       VARCHAR(100),
    status       VARCHAR(50)  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT documents_status_check CHECK (status IN ('uploaded', 'processing', 'processed', 'failed'))
);

COMMENT ON TABLE documents IS 'Clinical document uploads referencing Supabase Storage. FHIR mapping: DocumentReference, Binary. uploaded_by SET NULL on user deletion.';


-- ----------------------------------------------------------------------------
-- document_extractions
--   OCR / AI-extracted text and structured data from documents.
--   No soft delete. RESTRICT on document deletion to preserve extraction history.
-- ----------------------------------------------------------------------------
CREATE TABLE document_extractions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    interview_id    UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    raw_text        TEXT,
    structured_json JSONB,
    confidence      NUMERIC(5,4),
    model_version   VARCHAR(255),
    status          VARCHAR(50) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT document_extractions_status_check CHECK (status IN ('pending', 'completed', 'reviewed'))
);

COMMENT ON TABLE document_extractions IS 'OCR/AI extractions from documents. RESTRICT on document and interview deletion to preserve extraction history.';


-- ----------------------------------------------------------------------------
-- lab_results
--   Structured lab result entries. document_id is nullable (may come from
--   interview data, not just a document).
--   No soft delete.
-- ----------------------------------------------------------------------------
CREATE TABLE lab_results (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    interview_id  UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
    test_name     VARCHAR(255) NOT NULL,
    value         TEXT,
    unit          VARCHAR(50),
    reference_range TEXT,
    flag          VARCHAR(20),
    source        VARCHAR(100),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE lab_results IS 'Structured lab results. FHIR mapping: DiagnosticReport, Observation. document_id SET NULL on document deletion.';


-- ----------------------------------------------------------------------------
-- timeline_events
--   Chronological event log for a patient interview or case.
--   Append-only (no update, no soft delete).
-- ----------------------------------------------------------------------------
CREATE TABLE timeline_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id  UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    event_type    VARCHAR(100) NOT NULL,
    actor_role    VARCHAR(100),
    description   TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE timeline_events IS 'Append-only chronological event log. No updated_at, no soft delete.';


-- ----------------------------------------------------------------------------
-- triage_flags
--   AI- or staff-generated risk flags with human-in-the-loop resolver fields.
--   created_by is nullable (SET NULL on user deletion preserves flag history).
--   acknowledged_by / resolved_by are nullable.
--   No soft delete.
-- ----------------------------------------------------------------------------
CREATE TABLE triage_flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id    UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    flag_type       VARCHAR(100) NOT NULL,
    severity        VARCHAR(20)  NOT NULL,
    rationale       TEXT,
    status          VARCHAR(50)  NOT NULL,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT triage_flags_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT triage_flags_status_check CHECK (status IN ('open', 'acknowledged', 'resolved', 'escalated'))
);

COMMENT ON TABLE triage_flags IS 'AI/staff risk flags with human-in-the-loop resolver tracking. SET NULL on user deletion preserves flag history.';


-- ----------------------------------------------------------------------------
-- ai_outputs
--   AI-generated draft findings per interview. Status tracks the full
--   AI human-in-the-loop lifecycle (no soft delete).
-- ----------------------------------------------------------------------------
CREATE TABLE ai_outputs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id    UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    model_version   VARCHAR(255) NOT NULL,
    output_type     VARCHAR(50)  NOT NULL,
    structured_json JSONB,
    confidence      NUMERIC(5,4),
    prompt_hash     VARCHAR(255),
    status          VARCHAR(50)  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT ai_outputs_output_type_check CHECK (output_type IN ('summary', 'flags', 'history', 'plan')),
    CONSTRAINT ai_outputs_status_check CHECK (status IN ('draft', 'under_review', 'accepted', 'rejected', 'superseded'))
);

COMMENT ON TABLE ai_outputs IS 'AI-generated findings with human-in-the-loop status lifecycle (draft -> under_review -> accepted/rejected). No soft delete.';


-- ----------------------------------------------------------------------------
-- ai_evidence
--   Supporting evidence or citations for AI outputs.
--   No soft delete.
-- ----------------------------------------------------------------------------
CREATE TABLE ai_evidence (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_output_id   UUID NOT NULL REFERENCES ai_outputs(id) ON DELETE RESTRICT,
    source_type    VARCHAR(100) NOT NULL,
    source_reference TEXT,
    excerpt        TEXT,
    confidence     NUMERIC(5,4),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_evidence IS 'Evidence supporting AI outputs. CASCADE not used to preserve evidence chain.';


-- ----------------------------------------------------------------------------
-- doctor_reviews
--   Doctor review / approval record for AI output or case closure.
--   ai_output_id is nullable — when NULL, the review applies to the whole case.
--   No soft delete.
-- ----------------------------------------------------------------------------
CREATE TABLE doctor_reviews (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id  UUID NOT NULL REFERENCES interviews(id) ON DELETE RESTRICT,
    doctor_id     UUID REFERENCES doctors(id) ON DELETE SET NULL,
    ai_output_id  UUID REFERENCES ai_outputs(id) ON DELETE SET NULL,
    review_status VARCHAR(50)  NOT NULL,
    edited_text   TEXT,
    notes         TEXT,
    reviewed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT doctor_reviews_review_status_check CHECK (review_status IN ('pending', 'approved', 'rejected', 'returned'))
);

COMMENT ON TABLE doctor_reviews IS 'Doctor review of AI output or case. ai_output_id nullable for case-level reviews. SET NULL on doctor/ai_output deletion to preserve audit trail.';


-- ----------------------------------------------------------------------------
-- audit_logs
--   Immutable audit trail for compliance and safety review.
--   Append-only (no update, no soft delete).
--   actor_id and interview_id are nullable (SET NULL) to preserve audit
--   records even if the referenced user or interview is later removed.
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    interview_id UUID REFERENCES interviews(id) ON DELETE SET NULL,
    action       VARCHAR(100)  NOT NULL,
    entity_type  VARCHAR(100)  NOT NULL,
    entity_id    VARCHAR(100),
    before_json  JSONB,
    after_json   JSONB,
    ip_address   INET,
    kiosk_id     VARCHAR(100),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'Append-only immutable audit log. actor_id/interview_id SET NULL on deletion to preserve compliance history. FHIR mapping: Provenance.';


-- ============================================================================
-- Indexes
-- ============================================================================

-- users
CREATE INDEX idx_users_role    ON users(role);
-- email already has a UNIQUE constraint (idx_users_email_unique) created above.

-- hospitals
CREATE INDEX idx_hospitals_is_active ON hospitals(is_active);

-- departments
CREATE INDEX idx_departments_hospital_id ON departments(hospital_id);
CREATE INDEX idx_departments_is_active   ON departments(is_active);

-- user_hospitals
CREATE INDEX idx_user_hospitals_user_id     ON user_hospitals(user_id);
CREATE INDEX idx_user_hospitals_hospital_id ON user_hospitals(hospital_id);
CREATE INDEX idx_user_hospitals_is_active   ON user_hospitals(is_active);

-- patients
CREATE INDEX idx_patients_mrn     ON patients(mrn);
CREATE INDEX idx_patients_user_id ON patients(user_id);
CREATE INDEX idx_patients_is_active ON patients(is_active);

-- doctors
CREATE INDEX idx_doctors_user_id      ON doctors(user_id);
CREATE INDEX idx_doctors_department_id ON doctors(department_id);
CREATE INDEX idx_doctors_is_active    ON doctors(is_active);

-- questionnaires
CREATE INDEX idx_questionnaires_category  ON questionnaires(category);
CREATE INDEX idx_questionnaires_is_active ON questionnaires(is_active);

-- questionnaire_sections
CREATE INDEX idx_questionnaire_sections_questionnaire_id ON questionnaire_sections(questionnaire_id);

-- questions
CREATE INDEX idx_questions_questionnaire_id ON questions(questionnaire_id);
CREATE INDEX idx_questions_category          ON questions(category);

-- interviews
CREATE INDEX idx_interviews_patient_id  ON interviews(patient_id);
CREATE INDEX idx_interviews_assigned_doctor_id ON interviews(assigned_doctor_id);
CREATE INDEX idx_interviews_hospital_id ON interviews(hospital_id);
CREATE INDEX idx_interviews_status      ON interviews(status);
CREATE INDEX idx_interviews_created_at  ON interviews(created_at);
CREATE INDEX idx_interviews_patient_status_created
    ON interviews(patient_id, status, created_at);
CREATE INDEX idx_interviews_questionnaire_id
    ON interviews(questionnaire_id);

-- consents
CREATE INDEX idx_consents_patient_id ON consents(patient_id);
CREATE INDEX idx_consents_status     ON consents(status);

-- answers
CREATE INDEX idx_answers_interview_id  ON answers(interview_id);
CREATE INDEX idx_answers_question_id   ON answers(question_id);
CREATE INDEX idx_answers_interview_question
    ON answers(interview_id, question_id);

-- vital_signs
CREATE INDEX idx_vital_signs_interview_id  ON vital_signs(interview_id);
CREATE INDEX idx_vital_signs_recorded_at   ON vital_signs(recorded_at);

-- clinical_histories
CREATE INDEX idx_clinical_histories_patient_id  ON clinical_histories(patient_id);
CREATE INDEX idx_clinical_histories_interview_id ON clinical_histories(interview_id);

-- medications
CREATE INDEX idx_medications_patient_id  ON medications(patient_id);
CREATE INDEX idx_medications_interview_id ON medications(interview_id);

-- allergies
CREATE INDEX idx_allergies_patient_id  ON allergies(patient_id);
CREATE INDEX idx_allergies_interview_id ON allergies(interview_id);

-- documents
CREATE INDEX idx_documents_patient_id  ON documents(patient_id);
CREATE INDEX idx_documents_interview_id ON documents(interview_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_status      ON documents(status);
CREATE INDEX idx_documents_patient_interview_status
    ON documents(patient_id, interview_id, status);

-- document_extractions
CREATE INDEX idx_document_extractions_document_id  ON document_extractions(document_id);
CREATE INDEX idx_document_extractions_interview_id ON document_extractions(interview_id);

-- lab_results
CREATE INDEX idx_lab_results_patient_id   ON lab_results(patient_id);
CREATE INDEX idx_lab_results_interview_id  ON lab_results(interview_id);
CREATE INDEX idx_lab_results_test_name    ON lab_results(test_name);
CREATE INDEX idx_lab_results_patient_test_name
    ON lab_results(patient_id, test_name);

-- timeline_events
CREATE INDEX idx_timeline_events_interview_id ON timeline_events(interview_id);
CREATE INDEX idx_timeline_events_created_at    ON timeline_events(created_at);

-- triage_flags
CREATE INDEX idx_triage_flags_interview_id ON triage_flags(interview_id);
CREATE INDEX idx_triage_flags_severity      ON triage_flags(severity);
CREATE INDEX idx_triage_flags_status        ON triage_flags(status);
CREATE INDEX idx_triage_flags_interview_severity_status
    ON triage_flags(interview_id, severity, status);
CREATE INDEX idx_triage_flags_created_by    ON triage_flags(created_by);

-- ai_outputs
CREATE INDEX idx_ai_outputs_interview_id  ON ai_outputs(interview_id);
CREATE INDEX idx_ai_outputs_status         ON ai_outputs(status);
CREATE INDEX idx_ai_outputs_created_at     ON ai_outputs(created_at);
CREATE INDEX idx_ai_outputs_interview_status_created
    ON ai_outputs(interview_id, status, created_at);

-- ai_evidence
CREATE INDEX idx_ai_evidence_ai_output_id ON ai_evidence(ai_output_id);

-- doctor_reviews
CREATE INDEX idx_doctor_reviews_interview_id  ON doctor_reviews(interview_id);
CREATE INDEX idx_doctor_reviews_doctor_id      ON doctor_reviews(doctor_id);
CREATE INDEX idx_doctor_reviews_status          ON doctor_reviews(review_status);
CREATE INDEX idx_doctor_reviews_interview_doctor_status
    ON doctor_reviews(interview_id, doctor_id, review_status);
CREATE INDEX idx_doctor_reviews_ai_output_id    ON doctor_reviews(ai_output_id);

-- audit_logs
CREATE INDEX idx_audit_logs_actor_id     ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_interview_id ON audit_logs(interview_id);
CREATE INDEX idx_audit_logs_action       ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at    ON audit_logs(created_at);

-- JSONB GIN indexes (targeted for JSON search on flexible fields)
CREATE INDEX idx_clinical_histories_summary_gin ON clinical_histories USING GIN (summary);
CREATE INDEX idx_ai_outputs_structured_json_gin ON ai_outputs USING GIN (structured_json);
CREATE INDEX idx_document_extractions_structured_json_gin ON document_extractions USING GIN (structured_json);


-- ============================================================================
-- Triggers: updated_at auto-update
-- ============================================================================
-- Helper function to auto-update updated_at on row modification.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tables with updated_at column (excludes append-only tables: timeline_events, audit_logs, consents)
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hospitals_updated_at
    BEFORE UPDATE ON hospitals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_departments_updated_at
    BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_patients_updated_at
    BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_doctors_updated_at
    BEFORE UPDATE ON doctors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_questionnaires_updated_at
    BEFORE UPDATE ON questionnaires FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_questionnaire_sections_updated_at
    BEFORE UPDATE ON questionnaire_sections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_questions_updated_at
    BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_interviews_updated_at
    BEFORE UPDATE ON interviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_answers_updated_at
    BEFORE UPDATE ON answers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clinical_histories_updated_at
    BEFORE UPDATE ON clinical_histories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_medications_updated_at
    BEFORE UPDATE ON medications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_allergies_updated_at
    BEFORE UPDATE ON allergies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_document_extractions_updated_at
    BEFORE UPDATE ON document_extractions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_lab_results_updated_at
    BEFORE UPDATE ON lab_results FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_triage_flags_updated_at
    BEFORE UPDATE ON triage_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ai_outputs_updated_at
    BEFORE UPDATE ON ai_outputs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ai_evidence_updated_at
    BEFORE UPDATE ON ai_evidence FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_doctor_reviews_updated_at
    BEFORE UPDATE ON doctor_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
