export interface RedFlag {
  id: string;
  flagType: "critical_symptom" | "abnormal_lab" | "severe_vitals";
  severity: "high" | "moderate" | "low";
  reason: string;
  sourceRef: string;
  createdAt: string;
}

interface ExtractedTest {
  name?: string;
  date?: string;
  result?: string;
  reference_range?: string;
}

interface ExtractedData {
  extracted_text?: string;
  structured_data?: {
    tests?: ExtractedTest[];
    medications?: { name?: string; dosage?: string }[];
    diagnoses?: string[];
  };
}

interface AnswerLike {
  value?: string;
  question?: { text?: string } | null;
  questions?: { text?: string } | null;
}

function toAnswerText(answer: AnswerLike): string {
  const parts: string[] = [];
  if (typeof answer.value === "string" && answer.value.trim().length > 0) {
    parts.push(answer.value);
  }
  const question = answer.question ?? answer.questions;
  if (question && typeof question.text === "string" && question.text.trim().length > 0) {
    parts.push(question.text);
  }
  return parts.join(" ").toLowerCase();
}

function parseNumeric(value: string | undefined | null): number | null {
  if (value == null) return null;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (cleaned.length === 0) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `flag-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function evaluateRedFlags(answers: any[], extractedData: any): RedFlag[] {
  const flags: RedFlag[] = [];
  const now = new Date().toISOString();

  const safeAnswers: AnswerLike[] = Array.isArray(answers) ? answers : [];
  const safeExtracted: ExtractedData =
    extractedData && typeof extractedData === "object" ? (extractedData as ExtractedData) : {};

  // Rule 1: Critical symptoms from patient answers
  const criticalKeywords = [
    "chest pain",
    "severe breathing",
    "breathless",
    "unconscious",
    "heavy bleeding",
  ];

  let symptomHit = false;
  for (const answer of safeAnswers) {
    const text = toAnswerText(answer);
    for (const keyword of criticalKeywords) {
      if (text.includes(keyword)) {
        symptomHit = true;
        break;
      }
    }
    if (symptomHit) break;
  }

  if (symptomHit) {
    flags.push({
      id: makeId(),
      flagType: "critical_symptom",
      severity: "high",
      reason: "Patient reported critical red-flag symptoms (chest pain/breathing difficulty).",
      sourceRef: "patient_answers",
      createdAt: now,
    });
  }

  // Rule 2: Abnormal lab values from extracted OCR data
  const tests = safeExtracted.structured_data?.tests;
  if (Array.isArray(tests)) {
    for (const test of tests) {
      if (!test || typeof test !== "object") continue;
      const name = typeof test.name === "string" ? test.name : "";
      const result = typeof test.result === "string" ? test.result : "";
      const norm = normalizeName(name);
      const value = parseNumeric(result);

      if (norm.includes("hemoglobin") && value !== null) {
        if (value < 7 || value > 20) {
          flags.push({
            id: makeId(),
            flagType: "abnormal_lab",
            severity: "high",
            reason: `Critically abnormal lab value detected in uploaded document (${name}: ${result}).`,
            sourceRef: "extracted_document",
            createdAt: now,
          });
        }
      }

      if (norm.includes("leukocyte") && value !== null) {
        if (value < 1.0 || value > 50.0) {
          flags.push({
            id: makeId(),
            flagType: "abnormal_lab",
            severity: "high",
            reason: `Critically abnormal lab value detected in uploaded document (${name}: ${result}).`,
            sourceRef: "extracted_document",
            createdAt: now,
          });
        }
      }
    }
  }

  return flags;
}