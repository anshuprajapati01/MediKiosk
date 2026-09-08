# Clinical Questionnaires

Clinical interview questions in MediKiosk are **configuration-driven**, not hardcoded into Python or React.

Questionnaires are defined in structured configuration files (e.g., JSON / YAML) and loaded at runtime. This allows:
- Adding, editing, or retiring questions without code changes
- Branching logic and conditional paths based on prior answers
- Versioning and A/B testing of questionnaire flows
- Localization of question text and answer choices

Frontend renders questionnaire fields from configuration; backend validates and persists answers by referencing `questions` and `answers` structures.
