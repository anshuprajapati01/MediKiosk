import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.fileUrl !== "string" || typeof body.mimeType !== "string") {
      return NextResponse.json({ error: "Invalid request body. { fileUrl: string, mimeType: string } is required." }, { status: 400 });
    }

    const { fileUrl, mimeType } = body;

    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch the document from the provided URL." }, { status: 400 });
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const base64String = Buffer.from(arrayBuffer).toString("base64");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured on the server." }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `You are a clinical data extraction engine. Analyze the uploaded medical document image and extract structured clinical data.

Extract the following fields when present:
- test_name: string[]
- test_date: string[]
- result: string[]
- reference_range: string[]
- medication_name: string[]
- dosage: string[]
- diagnosis: string[]

Also provide:
- extracted_text: the full raw OCR text from the document as a single string.

Return ONLY a raw JSON object in this exact structure:
{
  "extracted_text": "raw text",
  "structured_data": {
    "tests": [{ "name": string, "date": string, "result": string, "reference_range": string }],
    "medications": [{ "name": string, "dosage": string }],
    "diagnoses": [string]
  }
}

Do not wrap the JSON in markdown, code fences, or extra text. Return only the raw JSON object.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          parts: [
            { text: systemPrompt },
            {
              inlineData: {
                data: base64String,
                mimeType,
              },
            },
          ],
        },
      ],
    });

    const rawText = response.text ?? "";

    const cleanedText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleanedText);
    } catch {
      return NextResponse.json(
        { error: "AI returned non-JSON output.", raw: rawText },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[GEMINI_API_ERROR]", error);
    let errorMessage = "An unexpected error occurred during OCR extraction.";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "object" && error !== null && "status" in error) {
      const apiError = error as { message?: string };
      errorMessage = apiError.message || JSON.stringify(error);
    }
    return NextResponse.json({ error: "OCR Failed", details: errorMessage }, { status: 500 });
  }
}
