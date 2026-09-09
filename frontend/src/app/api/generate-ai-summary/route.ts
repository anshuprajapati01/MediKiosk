import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

interface PatientSummaryRequest {
  patient?: {
    name?: string | null;
    age?: number | null;
    gender?: string | null;
  };
  answers?: { question: string; answer: string }[];
  extractedData?: {
    extracted_text?: string;
    structured_data?: {
      tests?: { name: string; date: string; result: string; reference_range: string }[];
      medications?: { name: string; dosage: string }[];
      diagnoses?: string[];
    };
  };
  redFlags?: { severity: string; reason: string; flagType: string }[];
}

interface SummaryResult {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  medicalHistory: string;
  medications: string;
  allergies: string;
  redFlagsSummary: string;
  missingInfo: string;
  aiSummary: string;
  evidenceMapping: {
    chiefComplaintSource: string;
    historySource: string;
    medicalHistorySource: string;
    medicationsSource: string;
    allergiesSource: string;
    redFlagsSource: string;
    missingInfoSource: string;
    aiSummarySource: string;
  };
}

const MISSING = "Not provided";

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function buildPrompt(body: PatientSummaryRequest): string {
  const patient = body.patient ?? {};
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const extracted = body.extractedData ?? {};
  const redFlags = Array.isArray(body.redFlags) ? body.redFlags : [];

  const answersText = answers
    .map((a) => `Q: ${safeString(a.question)}\nA: ${safeString(a.answer)}`)
    .join("\n---\n");

  const tests = extracted.structured_data?.tests ?? [];
  const meds = extracted.structured_data?.medications ?? [];
  const diagnoses = extracted.structured_data?.diagnoses ?? [];

  const testsText = tests
    .map((t) => `${t.name ?? "Unknown"}: ${t.result ?? ""} (ref: ${t.reference_range ?? ""})`)
    .join("; ");
  const medsText = meds.map((m) => `${m.name ?? "Unknown"} — ${m.dosage ?? "Not provided"}`).join("; ");
  const diagnosesText = diagnoses.join("; ");
  const rawText = safeString(extracted.extracted_text);
  const redFlagsText = redFlags
    .map((f) => `[${f.severity}] ${f.reason}`)
    .join("; ");

  return `You are a clinical documentation assistant. Your role is to organize and summarize the patient's case information for a reviewing physician. You must NOT diagnose, interpret, or recommend treatment. You may only synthesize, rephrase, and organize the data provided.

EVIDENCE TRACEABILITY REQUIREMENT:
For every key clinical section below, you MUST include a "source" field that cites exactly where the information came from. Use one of these source labels:
- "patient_answers" — information drawn from the PATIENT INTERVIEW ANSWERS section
- "extracted_document" — information drawn from the UPLOADED DOCUMENT EXTRACTED DATA section
- "red_flags" — information drawn from the DETECTED RED FLAGS section
- "demographics" — information drawn from the PATIENT DEMOGRAPHICS section
- "not_provided" — if the information is absent

STRICT INSTRUCTIONS:
- Output ONLY a raw JSON object. Do not include markdown fences, backticks, or any explanatory text.
- If a piece of information is absent, output the exact string "Not provided" for the text field and "not_provided" for the source field.
- Never diagnose, prescribe, or suggest treatment.

Return JSON with exactly these keys:
{
  "chiefComplaint": string,
  "chiefComplaintSource": string,
  "historyOfPresentIllness": string,
  "historySource": string,
  "medicalHistory": string,
  "medicalHistorySource": string,
  "medications": string,
  "medicationsSource": string,
  "allergies": string,
  "allergiesSource": string,
  "redFlagsSummary": string,
  "redFlagsSource": string,
  "missingInfo": string,
  "missingInfoSource": string,
  "aiSummary": string,
  "aiSummarySource": string
}

PATIENT DEMOGRAPHICS:
- Name: ${safeString(patient.name) || MISSING}
- Age: ${patient.age != null ? patient.age : MISSING}
- Gender: ${safeString(patient.gender) || MISSING}

PATIENT INTERVIEW ANSWERS:
${answersText || MISSING}

UPLOADED DOCUMENT EXTRACTED DATA:
- Lab Tests: ${testsText || MISSING}
- Medications: ${medsText || MISSING}
- Diagnoses: ${diagnosesText || MISSING}
- Raw OCR Text: ${rawText || MISSING}

DETECTED RED FLAGS:
${redFlagsText || MISSING}
`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as PatientSummaryRequest | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body. A JSON object is required." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `You are a clinical documentation assistant. Your role is to organize and summarize the patient's case information for a reviewing physician. You must NOT diagnose, interpret, or recommend treatment. You may only synthesize, rephrase, and organize the data provided.

EVIDENCE TRACEABILITY REQUIREMENT:
For every key clinical section, include a "source" field citing exactly where the information came from. Use one of these source labels:
- "patient_answers" — from the PATIENT INTERVIEW ANSWERS section
- "extracted_document" — from the UPLOADED DOCUMENT EXTRACTED DATA section
- "red_flags" — from the DETECTED RED FLAGS section
- "demographics" — from the PATIENT DEMOGRAPHICS section
- "not_provided" — if the information is absent

STRICT INSTRUCTIONS:
- Output ONLY a raw JSON object. Do not include markdown fences, backticks, or any explanatory text.
- If a piece of information is absent, output the exact string "Not provided" for the text field and "not_provided" for the source field.
- Never diagnose, prescribe, or suggest treatment.`;

    const userPrompt = buildPrompt(body);

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          parts: [
            { text: systemPrompt },
            { text: userPrompt },
          ],
        },
      ],
    });

    const rawText = response.text ?? "";
    const cleanedText = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleanedText) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "AI returned non-JSON output.", raw: rawText },
        { status: 502 }
      );
    }

    const result: SummaryResult = {
      chiefComplaint: safeString(parsed.chiefComplaint) || MISSING,
      historyOfPresentIllness: safeString(parsed.historyOfPresentIllness) || MISSING,
      medicalHistory: safeString(parsed.medicalHistory) || MISSING,
      medications: safeString(parsed.medications) || MISSING,
      allergies: safeString(parsed.allergies) || MISSING,
      redFlagsSummary: safeString(parsed.redFlagsSummary) || MISSING,
      missingInfo: safeString(parsed.missingInfo) || MISSING,
      aiSummary: safeString(parsed.aiSummary) || MISSING,
      evidenceMapping: {
        chiefComplaintSource: safeString(parsed.chiefComplaintSource) || "not_provided",
        historySource: safeString(parsed.historySource) || "not_provided",
        medicalHistorySource: safeString(parsed.medicalHistorySource) || "not_provided",
        medicationsSource: safeString(parsed.medicationsSource) || "not_provided",
        allergiesSource: safeString(parsed.allergiesSource) || "not_provided",
        redFlagsSource: safeString(parsed.redFlagsSource) || "not_provided",
        missingInfoSource: safeString(parsed.missingInfoSource) || "not_provided",
        aiSummarySource: safeString(parsed.aiSummarySource) || "not_provided",
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GEMINI_SUMMARY_ERROR]", error);
    let errorMessage = "An unexpected error occurred during AI summary generation.";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "object" && error !== null && "status" in error) {
      const apiError = error as { message?: string };
      errorMessage = apiError.message || JSON.stringify(error);
    }
    return NextResponse.json({ error: "AI Summary Failed", details: errorMessage }, { status: 500 });
  }
}