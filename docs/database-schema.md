# Database Schema Design (Proposed)

This document describes a proposed Supabase PostgreSQL schema for MediKiosk. No tables have been created yet; this is a design reference for implementation.

## Tables

### users
Core auth/profile record for every login identity.
- **PK**: `id` (UUID, references `auth.users`)
- Purpose: authenticate Patient, Doctor, Triage Staff, and Admin accounts
- Key columns: `email`, `role`, `full_name`, `phone`, `is_active`, `deleted_at`
- Indexes: `role`, `email`
- Soft delete: `is_active` + `deleted_at`

### hospitals
Healthcare facility records.
- **PK**: `id` (UUID)
- Purpose: name, address, timezone, branding, active status
- Key columns: `name`, `address`, `timezone`, `is_active`, `deleted_at`
- Indexes: `is_active`
- Soft delete: `is_active` + `deleted_at`

### departments
Clinical departments within a hospital.
- **PK**: `id` (UUID)
- **FK**: `hospital_id` → `hospitals.id`
- Purpose: department metadata
- Key columns: `name`, `hospital_id`, `is_active`, `deleted_at`
- Indexes: `hospital_id`
- Soft delete: `is_active` + `deleted_at`

### user_hospitals
Many-to-many membership linking platform users to hospitals.
- **PK**: composite (`user_id`, `hospital_id`) or surrogate `id` (UUID)
- **FK**: `user_id` → `users.id`, `hospital_id` → `hospitals.id`
- Purpose: scoped access for doctors, triage staff, and admins across multiple hospitals
- Key columns: `user_id`, `hospital_id`, `membership_role`, `is_active`, `created_at`
- `membership_role`: functional role at this hospital (e.g., `doctor`, `triage`, `admin`); complements the global `users.role`
- Indexes: `user_id`, `hospital_id`
- Note: platform-level users (e.g., super-admins) may exist without entries here

### patients
Clinical patient profile linked to a user (or created on-the-fly for walk-ins).
- **PK**: `id` (UUID)
- **FK**: `user_id` → `users.id` (nullable for anonymous/walk-in patients)
- Purpose: store patient demographics, MRN, contact info
- Key columns: `mrn`, `user_id`, `full_name`, `dob`, `gender`, `phone`, `email`, `is_active`, `deleted_at`
- Indexes: `mrn`, `user_id`
- Soft delete: `is_active` + `deleted_at`

### doctors
Provider profile extending a user account.
- **PK**: `id` (UUID)
- **FK**: `user_id` → `users.id`
- Purpose: provider details, department, license, consultation settings
- Key columns: `user_id`, `department_id`, `license_number`, `consultation_settings`, `is_active`, `deleted_at`
- Indexes: `user_id`, `department_id`
- Soft delete: `is_active` + `deleted_at`

### questionnaires
Questionnaire definitions for clinical and AYUSH interviews.
- **PK**: `id` (UUID)
- Purpose: name, version, category, description, active status
- Key columns: `name`, `version`, `category`, `description`, `is_active`, `created_at`, `updated_at`
- Indexes: `category`, `is_active`
- No soft delete; use versioning and `is_active`

### questionnaire_sections
Optional grouping of questions within a questionnaire.
- **PK**: `id` (UUID)
- **FK**: `questionnaire_id` → `questionnaires.id`
- Purpose: ordered sections (e.g., Dashavidha Pariksha groups in AYUSH)
- Key columns: `questionnaire_id`, `title`, `description`, `sort_order`, `created_at`, `updated_at`
- Indexes: `questionnaire_id`
- Optional: include only if questionnaire UI or configuration requires explicit section boundaries

### questions
Reusable question definitions (configuration-driven).
- **PK**: `id` (UUID)
- **FK**: `questionnaire_id` → `questionnaires.id`, `section_id` → `questionnaire_sections.id` (nullable)
- Purpose: text, type (text, number, choice, multi-select, date), category, validation rules, locale
- Key columns: `questionnaire_id`, `section_id`, `text`, `type`, `category`, `validation_rules`, `locale`, `sort_order`, `is_active`
- Indexes: `questionnaire_id`, `category`

### interviews
Top-level clinical session record for a patient encounter.
- **PK**: `id` (UUID)
- **FK**: `patient_id` → `patients.id`, `hospital_id` → `hospitals.id`, `department_id` → `departments.id`, `assigned_doctor_id` → `doctors.id` (nullable)
- Purpose: intake type, start/end timestamps, status, assigned doctor
- Key columns: `patient_id`, `hospital_id`, `department_id`, `assigned_doctor_id`, `intake_type`, `started_at`, `ended_at`, `status`, `created_at`, `updated_at`
- Statuses: `draft`, `in_progress`, `awaiting_review`, `under_review`, `completed`, `cancelled`
- Indexes: `patient_id`, `status`, `created_at`
- No soft delete; lifecycle managed by `status`

### consents
Informed consent records before interview or data processing.
- **PK**: `id` (UUID)
- **FK**: `patient_id` → `patients.id`
- Purpose: consent type, version, timestamp, IP / kiosk ID
- Key columns: `patient_id`, `consent_type`, `version`, `status`, `consented_at`, `ip_address`, `kiosk_id`
- Statuses: `pending`, `accepted`, `rejected`, `expired`
- Indexes: `patient_id`, `status`
- No soft delete; immutable once accepted

### answers
Responses to questions within an interview.
- **PK**: `id` (UUID)
- **FK**: `interview_id` → `interviews.id`, `question_id` → `questions.id`
- Purpose: response value, units, notes, confidence
- Key columns: `interview_id`, `question_id`, `value`, `units`, `notes`, `confidence`
- Indexes: `interview_id`, `question_id`
- No soft delete

### vital_signs
Clinically structured vital-sign measurements recorded by staff.
- **PK**: `id` (UUID)
- **FK**: `interview_id` → `interviews.id`, `recorded_by` → `users.id`
- Purpose: blood pressure, pulse, respiratory rate, temperature, SpO2, height, weight
- Key columns: `interview_id`, `recorded_by`, `blood_pressure_systolic`, `blood_pressure_diastolic`, `pulse`, `respiratory_rate`, `temperature`, `spo2`, `height`, `weight`, `recorded_at`
- Indexes: `interview_id`, `recorded_at`
- No soft delete

### clinical_histories
Structured medical history summaries per interview or per patient.
- **PK**: `id` (UUID)
- **FK**: `patient_id` → `patients.id`, `interview_id` → `interviews.id`
- Purpose: history type, structured JSON / text summary, source
- Key columns: `patient_id`, `interview_id`, `history_type`, `summary`, `source`
- Indexes: `patient_id`, `interview_id`
- No soft delete

### medications
Current and past medications.
- **PK**: `id` (UUID)
- **FK**: `patient_id` → `patients.id`, `interview_id` → `interviews.id`
- Purpose: name, dosage, frequency, route, start/end dates, source
- Key columns: `patient_id`, `interview_id`, `name`, `dosage`, `frequency`, `route`, `start_date`, `end_date`, `source`
- Indexes: `patient_id`, `interview_id`
- No soft delete

### allergies
Allergy / adverse reaction records.
- **PK**: `id` (UUID)
- **FK**: `patient_id` → `patients.id`, `interview_id` → `interviews.id`
- Purpose: allergen, reaction, severity, source
- Key columns: `patient_id`, `interview_id`, `allergen`, `reaction`, `severity`, `source`
- Indexes: `patient_id`
- No soft delete

### documents
Uploaded clinical documents (ID, prescriptions, reports).
- **PK**: `id` (UUID)
- **FK**: `patient_id` → `patients.id`, `interview_id` → `interviews.id`, `uploaded_by` → `users.id`
- **Storage**: Supabase Storage bucket reference
- Purpose: file path, mime type, size, source, uploader tracking
- Key columns: `patient_id`, `interview_id`, `uploaded_by`, `file_path`, `mime_type`, `size`, `source`, `status`
- Statuses: `uploaded`, `processing`, `processed`, `failed`
- Indexes: `patient_id`, `interview_id`, `status`
- No soft delete

### document_extractions
OCR / AI-extracted text from documents.
- **PK**: `id` (UUID)
- **FK**: `document_id` → `documents.id`, `interview_id` → `interviews.id`
- Purpose: raw text, structured JSON, confidence, model version
- Key columns: `document_id`, `interview_id`, `raw_text`, `structured_json`, `confidence`, `model_version`, `status`
- Statuses: `pending`, `completed`, `reviewed`
- Indexes: `document_id`, `interview_id`
- No soft delete

### lab_results
Structured lab result entries.
- **PK**: `id` (UUID)
- **FK**: `patient_id` → `patients.id`, `interview_id` → `interviews.id`, `document_id` → `documents.id` (nullable)
- Purpose: test name, value, unit, reference range, flag, source
- Key columns: `patient_id`, `interview_id`, `document_id`, `test_name`, `value`, `unit`, `reference_range`, `flag`, `source`
- Indexes: `patient_id`, `interview_id`, `test_name`
- No soft delete

### timeline_events
Chronological event log for a patient interview or case.
- **PK**: `id` (UUID)
- **FK**: `interview_id` → `interviews.id`
- Purpose: event type, actor role, description, timestamp
- Key columns: `interview_id`, `event_type`, `actor_role`, `description`, `created_at`
- Indexes: `interview_id`, `created_at`
- No soft delete; append-only

### triage_flags
AI- or staff-generated risk flags.
- **PK**: `id` (UUID)
- **FK**: `interview_id` → `interviews.id`, `created_by` → `users.id`, `acknowledged_by` → `users.id` (nullable), `resolved_by` → `users.id` (nullable)
- Purpose: flag type, severity, rationale, status, resolver tracking
- Key columns: `interview_id`, `flag_type`, `severity`, `rationale`, `status`, `created_by`, `acknowledged_by`, `acknowledged_at`, `resolved_by`, `resolved_at`
- Statuses: `open`, `acknowledged`, `resolved`, `escalated`
- Indexes: `interview_id`, `severity`, `status`
- No soft delete

### ai_outputs
AI-generated draft findings per interview.
- **PK**: `id` (UUID)
- **FK**: `interview_id` → `interviews.id`
- Purpose: model version, output type, structured JSON, confidence, prompt hash
- Key columns: `interview_id`, `model_version`, `output_type`, `structured_json`, `confidence`, `prompt_hash`, `status`, `created_at`
- Statuses: `draft`, `under_review`, `accepted`, `rejected`, `superseded`
- Indexes: `interview_id`, `status`, `created_at`
- No soft delete; status tracks lifecycle

### ai_evidence
Supporting evidence or citations for AI outputs.
- **PK**: `id` (UUID)
- **FK**: `ai_output_id` → `ai_outputs.id`
- Purpose: source type, source reference, excerpt, confidence
- Key columns: `ai_output_id`, `source_type`, `source_reference`, `excerpt`, `confidence`
- Indexes: `ai_output_id`
- No soft delete

### doctor_reviews
Doctor review / approval record for AI output or case closure.
- **PK**: `id` (UUID)
- **FK**: `interview_id` → `interviews.id`, `doctor_id` → `doctors.id`, `ai_output_id` → `ai_outputs.id` (nullable)
- Purpose: review status, edited text, notes, finalization timestamp
- Key columns: `interview_id`, `doctor_id`, `ai_output_id` (nullable), `review_status`, `edited_text`, `notes`, `reviewed_at`
- Statuses: `pending`, `approved`, `rejected`, `returned`
- When `ai_output_id` is null, the review applies to the whole case rather than a single AI output
- Indexes: `interview_id`, `doctor_id`, `status`
- No soft delete

### audit_logs
Immutable audit trail for compliance and safety review.
- **PK**: `id` (UUID)
- **FK**: `actor_id` → `users.id`, `interview_id` → `interviews.id` (nullable)
- Purpose: action, entity type, entity id, before/after JSON, IP, kiosk ID
- Key columns: `actor_id`, `interview_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `ip_address`, `kiosk_id`, `created_at`
- Indexes: `actor_id`, `interview_id`, `created_at`, `action`
- No soft delete; append-only

## Constrained Values (Conceptual)

The following fields should use PostgreSQL CHECK constraints or ENUMs during SQL implementation. No ENUMs are defined here; values are documented as the allowed set.

- `users.role`: `patient`, `doctor`, `triage`, `admin`
- `users.is_active`: boolean
- `hospitals.is_active`: boolean
- `departments.is_active`: boolean
- `user_hospitals.membership_role`: `doctor`, `triage`, `admin`
- `user_hospitals.is_active`: boolean
- `patients.is_active`: boolean
- `doctors.is_active`: boolean
- `questionnaires.category`: `clinical`, `ayush`
- `questionnaires.is_active`: boolean
- `questions.type`: `text`, `number`, `choice`, `multi_select`, `date`
- `interviews.intake_type`: `kiosk`, `web`, `walk_in`
- `interviews.status`: `draft`, `in_progress`, `awaiting_review`, `under_review`, `completed`, `cancelled`
- `consents.status`: `pending`, `accepted`, `rejected`, `expired`
- `documents.status`: `uploaded`, `processing`, `processed`, `failed`
- `document_extractions.status`: `pending`, `completed`, `reviewed`
- `triage_flags.severity`: `low`, `medium`, `high`, `critical`
- `triage_flags.status`: `open`, `acknowledged`, `resolved`, `escalated`
- `ai_outputs.output_type`: `summary`, `flags`, `history`, `plan`
- `ai_outputs.status`: `draft`, `under_review`, `accepted`, `rejected`, `superseded`
- `doctor_reviews.review_status`: `pending`, `approved`, `rejected`, `returned`
- `timeline_events.event_type`: free text or constrained set defined by application events

## Normalization Notes

- `patients.user_id` is nullable to support anonymous/walk-in patients; do not force a user account creation at intake time.
- `doctors.department_id` is stored directly on `doctors` for performance; if a doctor can belong to multiple departments, introduce a `doctor_departments` join table.
- `interviews.hospital_id` and `interviews.department_id` are denormalized copies from `user_hospitals` context at interview creation time; this avoids repeated joins for reporting.
- `questions.sort_order` is per-section if `section_id` is set, or per-questionnaire if `section_id` is null.
- `ai_outputs.structured_json` and `clinical_histories.summary` store flexible JSON; consider Postgres `jsonb` with targeted GIN indexes in the SQL phase.
- `documents.file_path` references Supabase Storage; the bucket name itself should be configurable per-hospital via application config rather than a database column.

## FHIR / ABDM Readiness

MediKiosk is designed to map cleanly to FHIR R4 resources through an adapter layer. The current relational schema should remain as-is; do not rewrite tables as FHIR resources yet.

Future mapping targets:
- `patients` → `Patient`
- `interviews` → `Encounter`
- `clinical_histories` → `Condition`, `Observation`
- `vital_signs` → `Observation` (vital-signs profile)
- `medications` → `MedicationStatement` / `MedicationRequest`
- `allergies` → `AllergyIntolerance`
- `documents` / `document_extractions` → `DocumentReference`, `Binary`
- `lab_results` → `DiagnosticReport`, `Observation`
- `doctors` → `Practitioner`, `PractitionerRole`
- `hospitals` → `Organization`
- `departments` → `Organization` (department sub-unit)
- `consents` → `Consent`
- `users` / `user_hospitals` → `PractitionerRole`, `RelatedPerson`
- `ai_outputs` / `doctor_reviews` → `Communication`, `DetectedIssue` (custom profiles)
- `audit_logs` → `Provenance`

ABDM integration should be implemented behind an adapter interface so that ABDM-specific flows (ABHA ID, consent manager, health lockers) do not pollute the core domain model.

## Key Relationships
- `patients` → `users` (1:1 optional for registered patients)
- `interviews` → `patients`, `hospitals`, `departments`, `doctors` (assigned)
- `user_hospitals` → `users`, `hospitals`
- `answers` → `interviews`, `questions`
- `vital_signs` → `interviews`, `users` (recorded_by)
- `documents` → `patients`, `interviews`, `users` (uploaded_by)
- `document_extractions` → `documents`, `interviews`
- `lab_results` → `patients`, `interviews`, `documents` (optional)
- `medications` / `allergies` / `clinical_histories` → `patients` and often `interviews`
- `ai_outputs` / `triage_flags` / `doctor_reviews` / `timeline_events` → `interviews`
- `ai_evidence` → `ai_outputs`
- `audit_logs` → `users`, `interviews` (optional)

## Important Indexes (High Level)
- `answers(interview_id, question_id)` — composite for questionnaire response lookups
- `interviews(patient_id, status, created_at)` — composite for patient case lists
- `lab_results(patient_id, test_name)` — composite for patient lab history
- `documents(patient_id, interview_id, status)` — composite for document status polling
- `triage_flags(interview_id, severity, status)` — triage queue filtering
- `ai_outputs(interview_id, status, created_at)` — AI output chronology
- `doctor_reviews(interview_id, doctor_id, status)` — doctor workload and review status
- `audit_logs(actor_id, interview_id, created_at, action)` — compliance queries
- Standard B-tree indexes on UUID foreign keys
- Consider JSONB GIN indexes on `clinical_histories.summary`, `ai_outputs.structured_json`, `ai_evidence.excerpt`
