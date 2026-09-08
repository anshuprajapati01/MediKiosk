# MediKiosk Architecture

## Purpose
MediKiosk is a digital clinical intake and triage platform designed for deployment on kiosk-style hardware in healthcare facilities. It guides patients through structured interviews, collects clinical history and vitals, and prepares AI-assisted summaries for physician review—while maintaining strict human-in-the-loop safety and auditability.

## Technology Stack
- **Frontend**: Next.js, TypeScript, Tailwind CSS, App Router, `src/` directory convention
- **Backend**: FastAPI, Python
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **AI Layer**: LLM / vision APIs for structured output synthesis (no diagnostic decisions)
- **OCR Layer**: Vision / OCR APIs for document text extraction
- **Speech / STT Layer**: Speech-to-text APIs for voice-based intake (optional)

## Data Model Highlights
- **Configuration-driven interviews**: clinical and AYUSH questionnaires are defined in `questionnaires` and `questions`, with optional `questionnaire_sections` for grouping.
- **Multi-hospital scoping**: `user_hospitals` links platform users to hospitals with membership roles; platform-level users may exist without hospital restriction.
- **Structured vitals**: `vital_signs` captures clinician-recorded measurements separately from patient-reported `answers`.
- **Consent lifecycle**: `consents` tracks accepted, rejected, pending, and expired states per patient encounter.
- **AI pipeline**: `ai_outputs` generate draft findings; `ai_evidence` cites sources; `doctor_reviews` approve, edit, or reject outputs or whole cases.
- **Document pipeline**: `documents` track uploads and OCR state; `document_extractions` hold extracted text; `lab_results` capture structured results.
- **Triage and audit**: `triage_flags` support rule-based risk escalation with resolver tracking; `audit_logs` provide immutable compliance records.

## Clinical Workflow
1. **Patient** checks in at kiosk or web endpoint
2. **Interview** is initiated with a structured questionnaire (clinical or AYUSH)
3. **Vitals** are recorded by staff when applicable
4. **Documents** may be uploaded and OCR-extracted
5. **AI** synthesizes inputs into draft summaries, flags, and structured outputs
6. **Doctor Review** validates, edits, and closes the case
7. **Triage Staff** manages queue and escalates urgent flags
8. **Admin** manages hospitals, departments, users, and questionnaire configurations

## Roles
- **Patient**: undergoes intake and interview
- **Doctor**: reviews AI output, edits findings, finalizes clinical summary
- **Triage Staff**: oversees queue, manages flags, escalates urgent cases
- **Admin**: manages facilities, users, configurations, and system settings

## Safety Principle
All AI outputs are drafts only. No AI-generated text may be presented as a diagnosis or treatment plan without explicit doctor confirmation. Human-in-the-loop review is mandatory before any clinical finding is finalized.

## Multi-Hospital and Standards Readiness
- **Multi-hospital**: `hospitals`, `departments`, and `user_hospitals` support deployments across multiple facilities.
- **FHIR-ready**: internal entities are designed to map to FHIR R4 resources through a future adapter layer.
- **ABDM-ready**: architecture leaves room for ABDM integration without polluting the core domain model.

## High-Level Folder Architecture
```
MediKiosk/
  frontend/        # Next.js application (unchanged)
  backend/         # FastAPI service (unchanged)
  docs/            # Planning and design documents
  questionnaires/  # Configuration-driven interview definitions
    clinical/
    ayush/
```
