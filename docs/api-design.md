# API Design (Proposed)

The following API groups are planned for MediKiosk. No routes have been implemented yet.

## authentication
- Register / login / logout
- Token refresh
- Role-based access control
- Kiosk-specific authentication flows

## users
- CRUD user profiles
- Assign users to hospitals via `user_hospitals`
- Manage global and membership roles
- Activate / deactivate users

## hospitals
- CRUD hospitals
- List departments by hospital
- Hospital-level configuration

## departments
- CRUD departments within a hospital
- List doctors and staff by department

## patients
- CRUD patient profiles
- Merge anonymous/walk-in profiles to registered accounts
- Patient search and lookup
- Manage consents per patient

## questionnaires
- CRUD questionnaire definitions (clinical / AYUSH)
- Version management and activation
- Section and question ordering

## interviews
- Create, update, submit, and cancel interviews
- Retrieve interview state and progress
- Assign and reassign doctors
- Record and retrieve vital signs
- Generate printable summaries

## answers
- Submit and retrieve questionnaire answers
- Support patient-reported information

## vital_signs
- Record and retrieve clinically measured vitals
- Link vitals to interviews and recording staff

## documents
- Upload clinical documents
- OCR / extraction status polling
- List documents by interview or patient
- Track uploader identity

## clinical history
- Create and query structured history records
- Medications, allergies, past history entries
- History timeline per patient

## triage
- Create and manage triage flags
- Acknowledge, escalate, and resolve flags
- Triage queue and prioritization
- Track resolver identity and timestamps

## AI
- Submit interview data for AI synthesis
- Retrieve draft outputs and evidence
- Accept, reject, or regenerate AI outputs

## doctor review
- Review AI outputs or entire cases
- Edit and finalize clinical summaries
- Approve or return for revision
- Support case-level reviews when no single AI output is targeted

## admin
- Manage hospitals, departments, and users
- Questionnaire configuration
- System settings and role management

## health
- Liveness and readiness probes
- Database connectivity check
