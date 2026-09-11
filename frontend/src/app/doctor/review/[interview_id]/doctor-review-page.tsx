"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createSupabaseClient } from "@/lib/supabase/client";
import MedicalTimeline, { TimelineEvent } from "@/components/MedicalTimeline";
import { evaluateRedFlags } from "@/lib/triageEngine";

type PatientInfo = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  gender?: string | null;
  dob?: string | null;
  name?: string | null;
  full_name?: string | null;
};

type Interview = {
  id: string;
  patient_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type Question = {
  id: string;
  text: string;
  type: string;
  section_id?: string | null;
  category?: string | null;
  questionnaire_sections?: { title: string; description?: string } | null;
};

type Answer = {
  id: string;
  interview_id: string;
  question_id: string;
  value: string;
  questions: Question | null;
};

type Document = {
  id: string;
  interview_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  size: number;
  status: string;
};

type AnswerGroup = {
  sectionTitle: string;
  items: { question: Question; answer: string }[];
};

function calculateAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function getSectionTitle(question: Question | null | undefined): string {
  if (!question) return "General Questions";
  const title = question.questionnaire_sections?.title;
  if (title && title.trim().length > 0) return title.trim();
  if (question.section_id === "60f7a39e-754e-440f-99b6-eebfe01ebecd") return "AYUSH Lifestyle Assessment";
  if (question.category && question.category.trim().length > 0) return question.category.trim();
  return "General Questions";
}

function getPatientName(patient: PatientInfo | null | undefined): string {
  if (!patient) return "Unknown Patient";
  if (patient.first_name || patient.last_name) {
    return `${patient.first_name || ""} ${patient.last_name || ""}`.trim();
  }
  if (patient.name) return patient.name;
  if (patient.full_name) return patient.full_name;
  return "Unknown Patient";
}

function SummaryField({
  label,
  value,
  source,
  className,
  isDarkMode,
}: {
  label: string;
  value: string;
  source?: string;
  className?: string;
  isDarkMode: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        isDarkMode ? "border-white/5 bg-white/5" : "border-slate-200 bg-slate-50"
      } ${className ?? ""}`.trim()}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={`text-xs font-semibold uppercase tracking-wider ${
            isDarkMode ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {label}
        </p>
        {source && (
          <span
            className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
              isDarkMode
                ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                : "border-teal-200 bg-teal-50 text-teal-700"
            }`}
          >
            {source.replace(/_/g, " ")}
          </span>
        )}
      </div>
      <p
        className={`mt-1 text-sm ${
          isDarkMode ? "text-slate-200" : "text-slate-700"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function DoctorReviewPage({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [aiResult, setAiResult] = useState<{
    extracted_text: string;
    structured_data: {
      tests: { name: string; date: string; result: string; reference_range: string }[];
      medications: { name: string; dosage: string }[];
      diagnoses: string[];
    };
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummaryData, setAiSummaryData] = useState<{
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
  } | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [doctorNotes, setDoctorNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createSupabaseClient();

        const { data: interviewData, error: interviewError } = await supabase
          .from("interviews")
          .select("*")
          .eq("id", interviewId)
          .maybeSingle<Interview>();

        if (interviewError) {
          setError("Unable to load interview. Please try again later.");
          setIsLoading(false);
          return;
        }

        if (!interviewData) {
          setError("Interview not found.");
          setIsLoading(false);
          return;
        }

        setInterview(interviewData);

        const { data: patientData, error: patientError } = await supabase
          .from("patients")
          .select("*")
          .eq("id", interviewData.patient_id)
          .maybeSingle<PatientInfo>();

        if (patientError) {
          setError("Unable to load patient details. Please try again later.");
          setIsLoading(false);
          return;
        }

        setPatient(patientData);

        if (!patientData) {
          setError("Patient record not found.");
          setIsLoading(false);
          return;
        }

        const { data: pastInterviews, error: pastInterviewsError } = await supabase
          .from("interviews")
          .select("id, updated_at, status")
          .eq("patient_id", patientData.id);

        if (pastInterviewsError) {
          setError("Unable to load patient interview history. Please try again later.");
          setIsLoading(false);
          return;
        }

        const interviewEvents: TimelineEvent[] = (pastInterviews ?? []).map((intv) => ({
          id: intv.id,
          date: intv.updated_at,
          type: "interview",
          title: "Patient Consultation",
          sourceRef: intv.id,
        }));

        const { data: answersData, error: answersError } = await supabase
          .from("answers")
          .select("*, questions(*, questionnaire_sections(title, description))")
          .eq("interview_id", interviewId)
          .order("id", { ascending: true });

        if (answersError) {
          setError("Unable to load answers. Please try again later.");
          setIsLoading(false);
          return;
        }

        setAnswers((answersData ?? []) as Answer[]);

        const { data: documentsData, error: documentsError } = await supabase
          .from("documents")
          .select("*")
          .eq("interview_id", interviewId)
          .order("created_at", { ascending: false });

        if (documentsError) {
          setError("Unable to load documents. Please try again later.");
          setIsLoading(false);
          return;
        }

        setDocuments((documentsData ?? []) as Document[]);

        const documentEvents: TimelineEvent[] = (documentsData ?? []).map((doc) => ({
          id: doc.id,
          date: doc.created_at,
          type: "document",
          title: `Document Uploaded: ${doc.file_name}`,
          sourceRef: doc.id,
        }));

        setTimelineEvents([...interviewEvents, ...documentEvents]);
        setIsLoading(false);
      } catch {
        setError("An unexpected error occurred. Please try again later.");
        setIsLoading(false);
      }
    }

    loadData();
  }, [interviewId]);

  useEffect(() => {
    if (!isLoading && answers.length > 0) {
      handleGenerateAISummary();
    }
    // We intentionally only trigger once after initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, interviewId]);

  const redFlags = useMemo(
    () => evaluateRedFlags(answers, aiResult),
    [answers, aiResult],
  );

  const groupedAnswers = answers.reduce<Record<string, AnswerGroup>>((acc, answer) => {
    const question = answer.questions;
    const sectionTitle = getSectionTitle(question);
    if (!acc[sectionTitle]) {
      acc[sectionTitle] = {
        sectionTitle,
        items: [],
      };
    }
    acc[sectionTitle].items.push({
      question: question ?? ({} as Question),
      answer: answer.value,
    });
    return acc;
  }, {});

  const answerGroups = Object.values(groupedAnswers);

  async function handleGenerateAISummary() {
    setIsGeneratingSummary(true);
    setSummaryError(null);
    try {
      const patientForSummary = patient
        ? {
            name: getPatientName(patient),
            age: calculateAge(patient.dob ?? null),
            gender: patient.gender ?? null,
          }
        : undefined;

      const answersForSummary = answers.map((a) => ({
        question: a.questions?.text ?? "",
        answer: a.value ?? "",
      }));

      const response = await fetch("/api/generate-ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient: patientForSummary,
          answers: answersForSummary,
          extractedData: aiResult,
          redFlags,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || "Failed to generate AI summary.");
      }

      setAiSummaryData(data);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsGeneratingSummary(false);
    }
  }

  async function getDocumentViewUrl(docPath: string): Promise<string | null> {
    try {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase.storage
        .from("medical-documents")
        .createSignedUrl(docPath, 3600);

      if (error || !data?.signedUrl) {
        console.error("Failed to create signed URL:", error);
        return null;
      }

      return data.signedUrl;
    } catch {
      console.error("Error creating signed URL");
      return null;
    }
  }

  async function handleViewDocument(docPath: string) {
    const url = await getDocumentViewUrl(docPath);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function handleRunExtraction(doc: Document) {
    setIsExtracting(true);
    setAiError(null);
    setAiResult(null);

    try {
      const supabase = createSupabaseClient();
      const { data: signedData, error: signedError } = await supabase.storage
        .from("medical-documents")
        .createSignedUrl(doc.file_path, 60);

      if (signedError || !signedData?.signedUrl) {
        throw new Error("Could not generate a secure URL for the document.");
      }

      const fileUrl = signedData.signedUrl;

      const response = await fetch("/api/extract-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl, mimeType: doc.mime_type }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || "OCR extraction failed");
      }

      setAiResult(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "An unexpected error occurred");
  } finally {
    setIsExtracting(false);
  }
}

  async function handleDoctorAction(actionStatus: "approved" | "rejected") {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitSuccess(null);
    setSubmitError(null);

    try {
      const supabase = createSupabaseClient();

      const resolvedStatus = actionStatus === "approved" ? "completed" : "awaiting_review";
      const { error: statusError } = await supabase
        .from("interviews")
        .update({ status: resolvedStatus })
        .eq("id", interviewId);

      if (statusError) {
        throw new Error(statusError.message);
      }

      const verb = actionStatus === "approved" ? "approved" : "rejected";
      setSubmitSuccess(`Case ${verb} successfully. Redirecting to dashboard...`);

      setTimeout(() => {
        router.push("/doctor/dashboard");
      }, 1800);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while finalizing the case.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div
        className={`flex flex-1 items-center justify-center ${
          isDarkMode ? "bg-black" : "bg-slate-50"
        }`}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className={`h-12 w-12 animate-spin rounded-full border-4 ${
              isDarkMode
                ? "border-zinc-700 border-t-zinc-100"
                : "border-slate-300 border-t-teal-600"
            }`}
          />
          <p
            className={`text-lg ${
              isDarkMode ? "text-zinc-400" : "text-slate-600"
            }`}
          >
            Loading review...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex flex-1 items-center justify-center ${
          isDarkMode ? "bg-black" : "bg-slate-50"
        }`}
      >
        <div className="w-full max-w-md px-6">
          <div
            className={`rounded-2xl border-2 p-8 text-center ${
              isDarkMode
                ? "border-red-500/30 bg-red-500/10"
                : "border-red-200 bg-red-50"
            }`}
          >
            <h2
              className={`mb-2 text-xl font-semibold ${
                isDarkMode ? "text-red-200" : "text-red-900"
              }`}
            >
              Something went wrong
            </h2>
            <p
              className={`text-base ${
                isDarkMode ? "text-red-300" : "text-red-800"
              }`}
            >
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const age = calculateAge(patient?.dob ?? null);
  const patientName = getPatientName(patient);
  const statusLabel =
    interview?.status === "awaiting_review" ? "Awaiting Review" : interview?.status === "completed" ? "Completed" : interview?.status || "Unknown";

  return (
    <div
      className={`flex flex-1 items-start justify-center py-10 ${
        isDarkMode ? "bg-black" : "bg-slate-50"
      }`}
    >
      <div className="w-full max-w-5xl px-6">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.push("/doctor/dashboard")}
              className={`inline-flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-colors focus:ring-2 focus:outline-none ${
                isDarkMode
                  ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-100 hover:bg-zinc-800 focus:ring-zinc-500"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-900 hover:bg-slate-50 focus:ring-slate-300"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </button>

            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${
                interview?.status === "awaiting_review"
                  ? isDarkMode
                    ? "border-amber-500/30 bg-amber-500/20 text-amber-300"
                    : "bg-amber-100 text-amber-700 font-medium border-amber-200"
                  : isDarkMode
                    ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                    : "bg-emerald-100 text-emerald-700 font-medium border-emerald-200"
              }`}
            >
              {statusLabel}
            </span>
          </div>

          <div
            className={`p-6 rounded-2xl shadow-2xl ${
              isDarkMode
                ? "bg-slate-900/60 backdrop-blur-xl border border-slate-700/50"
                : "bg-white border border-slate-200 shadow-md"
            }`}
          >
            <div className="mb-4">
              <h1
                className={`text-center text-3xl font-bold ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                Doctor Review
              </h1>
              <p
                className={`mt-2 text-center text-base ${
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                }`}
              >
                Review patient interview responses and uploaded documents.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6">
              <div className="flex flex-col">
                <p
                  className={`text-xs tracking-widest uppercase ${
                    isDarkMode ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  Patient
                </p>
                <p
                  className={`text-lg font-semibold ${
                    isDarkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  {patientName}
                </p>
              </div>
              <div
                className={`h-8 w-px ${
                  isDarkMode ? "bg-slate-700" : "bg-slate-200"
                }`}
              />
              <div className="flex flex-col">
                <p
                  className={`text-xs tracking-widest uppercase ${
                    isDarkMode ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  Age
                </p>
                <p
                  className={`text-lg font-semibold ${
                    isDarkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  {age !== null ? `${age} years` : "N/A"}
                </p>
              </div>
              <div
                className={`h-8 w-px ${
                  isDarkMode ? "bg-slate-700" : "bg-slate-200"
                }`}
              />
              <div className="flex flex-col">
                <p
                  className={`text-xs tracking-widest uppercase ${
                    isDarkMode ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  Gender
                </p>
                <p
                  className={`text-lg font-semibold ${
                    isDarkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  {patient?.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : "N/A"}
                </p>
              </div>
              <div
                className={`h-8 w-px ${
                  isDarkMode ? "bg-slate-700" : "bg-slate-200"
                }`}
              />
              <div className="flex flex-col">
                <p
                  className={`text-xs tracking-widest uppercase ${
                    isDarkMode ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  Interview ID
                </p>
                <p
                  className={`text-lg font-semibold truncate ${
                    isDarkMode ? "text-white" : "text-slate-900"
                  }`}
                >
                  {interview?.id}
                </p>
              </div>
            </div>
          </div>

          {redFlags.length > 0 && (
            <div
              className={`relative overflow-hidden rounded-2xl border p-6 shadow-md backdrop-blur-md ${
                isDarkMode
                  ? "border-rose-500/30 bg-rose-500/10 shadow-[0_0_30px_rgba(244,63,94,0.15)]"
                  : "border-red-200 bg-red-50 shadow-sm"
              }`}
            >
              {isDarkMode && (
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent pointer-events-none" />
              )}
              <div className="relative flex items-start gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <h3
                    className={`text-lg font-bold ${
                      isDarkMode ? "text-rose-300" : "text-red-700"
                    }`}
                  >
                    ⚠️ Potential red flag detected — requires prompt clinical attention.
                  </h3>
                  <ul className="mt-3 flex flex-col gap-2">
                    {redFlags.map((flag) => (
                      <li key={flag.id} className="flex items-start gap-2 text-sm">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                        <span
                          className={
                            isDarkMode ? "text-rose-200/90" : "text-red-800"
                          }
                        >
                          <span
                            className={`font-semibold uppercase tracking-wide ${
                              isDarkMode ? "text-rose-300" : "text-red-700"
                            }`}
                          >
                            {flag.severity}
                          </span>
                          {" — "}
                          {flag.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div
            className={`relative overflow-hidden rounded-2xl border p-6 shadow-xl backdrop-blur-md ${
              isDarkMode
                ? "border-indigo-500/30 bg-slate-800/40"
                : "border-slate-200 bg-white shadow-sm"
            }`}
          >
            {isDarkMode && (
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
            )}
            <div className="relative flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707-.707M12 21v-1m0-12V3m-6.364-1.636l.707-.707m-2.728 14.728l.707-.707" />
                  </svg>
                  <h2
                    className={`text-xl font-bold ${
                      isDarkMode ? "text-white" : "text-slate-900"
                    }`}
                  >
                    AI Clinical Summary
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAISummary}
                  disabled={isGeneratingSummary}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                    isDarkMode
                      ? "border-indigo-500/40 bg-slate-900/60 text-indigo-300 hover:border-indigo-400 hover:text-indigo-200 focus:ring-indigo-500"
                      : "border-teal-200 bg-white text-teal-700 hover:border-teal-400 hover:text-teal-800 focus:ring-teal-300"
                  }`}
                >
                  {isGeneratingSummary ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh Summary
                    </>
                  )}
                </button>
              </div>

              <span
                className={`self-start inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                  isDarkMode
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-amber-200 bg-amber-100 text-amber-700"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                ⚠️ AI-assisted summary — requires clinician review.
              </span>

              {summaryError && (
                <div
                  className={`rounded-lg border p-3 ${
                    isDarkMode
                      ? "border-red-500/30 bg-red-500/10"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <p
                    className={`text-sm ${
                      isDarkMode ? "text-red-400" : "text-red-700"
                    }`}
                  >
                    {summaryError}
                  </p>
                </div>
              )}

              {aiSummaryData ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <SummaryField
                    isDarkMode={isDarkMode}
                    label="Chief Complaint"
                    value={aiSummaryData.chiefComplaint}
                    source={aiSummaryData.evidenceMapping.chiefComplaintSource}
                  />
                  <SummaryField
                    isDarkMode={isDarkMode}
                    label="History of Present Illness"
                    value={aiSummaryData.historyOfPresentIllness}
                    source={aiSummaryData.evidenceMapping.historySource}
                  />
                  <SummaryField
                    isDarkMode={isDarkMode}
                    label="Medical History"
                    value={aiSummaryData.medicalHistory}
                    source={aiSummaryData.evidenceMapping.medicalHistorySource}
                  />
                  <SummaryField
                    isDarkMode={isDarkMode}
                    label="Medications"
                    value={aiSummaryData.medications}
                    source={aiSummaryData.evidenceMapping.medicationsSource}
                  />
                  <SummaryField
                    isDarkMode={isDarkMode}
                    label="Allergies"
                    value={aiSummaryData.allergies}
                    source={aiSummaryData.evidenceMapping.allergiesSource}
                  />
                  <SummaryField
                    isDarkMode={isDarkMode}
                    label="Red Flags Summary"
                    value={aiSummaryData.redFlagsSummary}
                    source={aiSummaryData.evidenceMapping.redFlagsSource}
                  />
                  <SummaryField
                    isDarkMode={isDarkMode}
                    label="Missing Info"
                    value={aiSummaryData.missingInfo}
                    source={aiSummaryData.evidenceMapping.missingInfoSource}
                    className="md:col-span-2"
                  />
                  <div
                    className={`rounded-lg border p-4 md:col-span-2 ${
                      isDarkMode
                        ? "border-white/5 bg-white/5"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`text-xs font-semibold uppercase tracking-wider ${
                          isDarkMode ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        AI Clinical Summary
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                          isDarkMode
                            ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                            : "border-teal-200 bg-teal-50 text-teal-700"
                        }`}
                      >
                        {aiSummaryData.evidenceMapping.aiSummarySource.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-sm ${
                        isDarkMode ? "text-slate-200" : "text-slate-700"
                      }`}
                    >
                      {aiSummaryData.aiSummary}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className={`rounded-xl border p-8 text-center ${
                    isDarkMode
                      ? "border-white/5 bg-white/5"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p
                    className={
                      isDarkMode ? "text-slate-400" : "text-slate-600"
                    }
                  >
                    {isGeneratingSummary ? "Generating clinical summary..." : "No AI summary generated yet."}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div
            className={`relative overflow-hidden rounded-2xl border p-8 shadow-2xl backdrop-blur-md ${
              isDarkMode
                ? "border-white/10 bg-white/5"
                : "border-slate-200 bg-white shadow-md"
            }`}
          >
            <div className="mb-6 flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2
                className={`text-2xl font-bold ${
                  isDarkMode ? "text-zinc-50" : "text-slate-900"
                }`}
              >
                Patient Medical Timeline
              </h2>
            </div>
            <MedicalTimeline events={timelineEvents} />
          </div>

          <div
            className={`relative overflow-hidden rounded-2xl border p-8 shadow-2xl backdrop-blur-md ${
              isDarkMode
                ? "border-white/10 bg-white/5"
                : "border-slate-200 bg-white shadow-md"
            }`}
          >
            <h2
              className={`mb-6 text-2xl font-bold ${
                isDarkMode ? "text-zinc-50" : "text-slate-900"
              }`}
            >
              Clinical Assessment
            </h2>

            {answerGroups.length === 0 ? (
              <div
                className={`rounded-xl border p-12 text-center shadow-sm backdrop-blur-md ${
                  isDarkMode
                    ? "border-white/10 bg-white/5"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <p
                  className={`text-lg ${
                    isDarkMode ? "text-zinc-400" : "text-slate-600"
                  }`}
                >
                  No answers recorded for this interview.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {answerGroups.map((group) => (
                  <div key={group.sectionTitle} className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                       <span
                         className={`inline-flex items-center rounded-full border px-3 py-1 text-xs uppercase tracking-wider font-semibold ${
                           isDarkMode
                             ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                             : "border-teal-200 bg-teal-50 text-teal-700"
                         }`}
                       >
                        {group.sectionTitle}
                      </span>
                      <span
                        className={`text-sm ${
                          isDarkMode ? "text-zinc-400" : "text-slate-500"
                        }`}
                      >
                        {group.items.length} {group.items.length === 1 ? "question" : "questions"}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3">
                      {group.items.map((item, idx) => (
                         <div
                           key={item.question.id}
                           className={`flex flex-col gap-2 rounded-xl p-5 border-l-4 transition-colors ${
                             isDarkMode
                               ? "bg-slate-800/40 border-l-emerald-500/70 hover:bg-slate-800/60"
                               : "bg-slate-50 border-l-teal-500 hover:bg-teal-50/50"
                           }`}
                         >
                           <div className="flex items-start gap-3">
                             <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                               isDarkMode ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700"
                             }`}>
                               {idx + 1}
                             </span>
                             <p
                               className={
                                 isDarkMode ? "text-slate-300" : "text-slate-700"
                               }
                             >
                               {item.question.text}
                             </p>
                           </div>
                           <p
                             className={`pl-9 text-lg font-medium mt-2 ${
                               item.answer.trim().length === 0
                                 ? isDarkMode
                                   ? "italic text-zinc-500"
                                   : "italic text-slate-400"
                                 : isDarkMode
                                   ? "text-white"
                                   : "text-slate-900"
                             }`}
                           >
                             {item.answer.trim().length === 0 ? "No answer provided" : item.answer}
                           </p>
                         </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className={`relative overflow-hidden rounded-2xl border p-8 shadow-2xl backdrop-blur-md ${
              isDarkMode
                ? "border-white/10 bg-white/5"
                : "border-slate-200 bg-white shadow-md"
            }`}
          >
            <h2
              className={`mb-2 text-2xl font-bold ${
                isDarkMode ? "text-zinc-50" : "text-slate-900"
              }`}
            >
              Uploaded Documents
            </h2>
            <p
              className={`mb-6 text-base ${
                isDarkMode ? "text-zinc-400" : "text-slate-600"
              }`}
            >
              The following documents are attached to this case.
            </p>

            {documents.length === 0 ? (
              <div
                className={`rounded-xl border p-12 text-center shadow-sm backdrop-blur-md ${
                  isDarkMode
                    ? "border-white/10 bg-white/5"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <p
                  className={`text-lg ${
                    isDarkMode ? "text-zinc-400" : "text-slate-600"
                  }`}
                >
                  No documents uploaded for this interview.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {documents.map((doc) => (
                   <li
                     key={doc.id}
                     className={`flex items-center justify-between gap-3 rounded-xl border-2 p-4 transition-all duration-200 ${
                       isDarkMode
                         ? "border-zinc-700 bg-zinc-800 hover:border-indigo-500/40 hover:bg-slate-800/40"
                         : "border-slate-200 bg-zinc-50 hover:border-indigo-500/40 hover:bg-teal-50/30"
                     }`}
                   >
                    <div className="flex flex-col">
                      <span
                        className={`truncate text-base font-medium ${
                          isDarkMode ? "text-zinc-50" : "text-slate-900"
                        }`}
                      >
                        {doc.file_name}
                      </span>
                      <span
                        className={`text-sm ${
                          isDarkMode ? "text-zinc-400" : "text-slate-500"
                        }`}
                      >
                        {(doc.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                       <button
                         type="button"
                         onClick={() => handleViewDocument(doc.file_path)}
                         className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all duration-200 focus:ring-2 focus:outline-none ${
                           isDarkMode
                             ? "border-indigo-500/40 bg-slate-900/60 text-indigo-300 hover:border-indigo-400 hover:text-indigo-200 hover:shadow-[0_0_10px_rgba(99,102,241,0.3)] focus:ring-indigo-500"
                             : "border-teal-200 bg-white text-teal-700 hover:border-teal-400 hover:text-teal-800 focus:ring-teal-300"
                         }`}
                       >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View Original
                      </button>
                      <span
                        className={`text-sm font-semibold ${
                          isDarkMode ? "text-emerald-400" : "text-emerald-700"
                        }`}
                      >
                        {doc.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

<div
  className={`relative overflow-hidden rounded-2xl p-8 shadow-inner ${
    isDarkMode
      ? "bg-gradient-to-b from-slate-800/50 to-slate-900/80 border border-indigo-500/30"
      : "border border-slate-200 bg-white shadow-sm"
  }`}
>
  {isDarkMode && (
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
  )}
  <div className="relative">
  {aiResult ? (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3
          className={`text-xl font-bold ${
            isDarkMode ? "text-zinc-50" : "text-slate-900"
          }`}
        >
          AI Extraction Results
        </h3>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
            isDarkMode
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-emerald-200 bg-emerald-100 text-emerald-700"
          }`}
        >
          Completed
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-4">
          <h4
            className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wider ${
              isDarkMode ? "text-slate-400" : "text-slate-500"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Structured Data
          </h4>

          {aiResult.structured_data.tests.length > 0 && (
            <div className="space-y-3">
              <h5
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isDarkMode ? "text-indigo-400" : "text-teal-700"
                }`}
              >
                Lab Tests
              </h5>
              <div
                className={`rounded-xl border overflow-x-auto ${
                  isDarkMode
                    ? "border-white/10 bg-white/5 shadow-sm backdrop-blur-md"
                    : "border-slate-200 bg-slate-50 shadow-sm"
                }`}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className={`border-b ${
                        isDarkMode ? "border-white/10" : "border-slate-200"
                      }`}
                    >
                      <th
                        className={`text-left py-2 px-3 font-semibold ${
                          isDarkMode ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        Test Name
                      </th>
                      <th
                        className={`text-left py-2 px-3 font-semibold ${
                          isDarkMode ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        Date
                      </th>
                      <th
                        className={`text-left py-2 px-3 font-semibold ${
                          isDarkMode ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        Result
                      </th>
                      <th
                        className={`text-left py-2 px-3 font-semibold ${
                          isDarkMode ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        Reference Range
                      </th>
                    </tr>
                  </thead>
                  <tbody
                    className={`divide-y ${
                      isDarkMode ? "divide-white/5" : "divide-slate-100"
                    }`}
                  >
                    {aiResult.structured_data.tests.map((test, idx) => (
                      <tr
                        key={idx}
                        className={`transition-colors ${
                          isDarkMode ? "hover:bg-white/5" : "hover:bg-slate-100"
                        }`}
                      >
                        <td
                          className={`py-2 px-3 ${
                            isDarkMode ? "text-white" : "text-slate-900"
                          }`}
                        >
                          {test.name}
                        </td>
                        <td
                          className={`py-2 px-3 ${
                            isDarkMode ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          {test.date || "—"}
                        </td>
                        <td
                          className={`py-2 px-3 ${
                            isDarkMode ? "text-white" : "text-slate-900"
                          }`}
                        >
                          {test.result || "—"}
                        </td>
                        <td
                          className={`py-2 px-3 ${
                            isDarkMode ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          {test.reference_range || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aiResult.structured_data.medications.length > 0 && (
            <div className="space-y-3">
              <h5
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isDarkMode ? "text-indigo-400" : "text-teal-700"
                }`}
              >
                Medications
              </h5>
              <div
                className={`rounded-xl border p-4 shadow-sm backdrop-blur-md ${
                  isDarkMode
                    ? "border-white/10 bg-white/5"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {aiResult.structured_data.medications.map((med, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg border p-3 ${
                        isDarkMode
                          ? "border-white/10 bg-white/5"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <p
                        className={`font-medium ${
                          isDarkMode ? "text-white" : "text-slate-900"
                        }`}
                      >
                        {med.name}
                      </p>
                      <p
                        className={`text-xs ${
                          isDarkMode ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        {med.dosage || "Dosage not specified"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {aiResult.structured_data.diagnoses.length > 0 && (
            <div className="space-y-3">
              <h5
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isDarkMode ? "text-amber-400" : "text-amber-700"
                }`}
              >
                Diagnoses
              </h5>
              <div
                className={`rounded-xl border p-4 shadow-sm backdrop-blur-md ${
                  isDarkMode
                    ? "border-white/10 bg-white/5"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <ul className="space-y-2">
                  {aiResult.structured_data.diagnoses.map((diag, idx) => (
                    <li
                      key={idx}
                      className={`flex items-center gap-2 text-sm ${
                        isDarkMode ? "text-white" : "text-slate-800"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      {diag}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {(aiResult.structured_data.tests.length === 0 &&
            aiResult.structured_data.medications.length === 0 &&
            aiResult.structured_data.diagnoses.length === 0) && (
            <div
              className={`rounded-xl border p-8 text-center shadow-sm backdrop-blur-md ${
                isDarkMode
                  ? "border-white/10 bg-white/5"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <p
                className={
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                }
              >
                No structured clinical data detected in this document.
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4 md:col-span-2">
          <h4
            className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wider ${
              isDarkMode ? "text-slate-400" : "text-slate-500"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Raw OCR Text
          </h4>
          <div
            className={`rounded-xl border p-4 font-mono text-xs whitespace-pre-wrap max-h-96 overflow-y-auto ${
              isDarkMode
                ? "border-white/10 bg-zinc-900/50 text-slate-300"
                : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {aiResult.extracted_text || "No text extracted"}
          </div>
        </section>
      </div>

      <div
        className={`rounded-xl border-2 p-4 ${
          isDarkMode
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <p
          className={`flex items-start gap-2 text-sm font-medium ${
            isDarkMode ? "text-amber-400" : "text-amber-700"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>⚠️ OCR/AI extraction is not medically verified truth. Always verify with the source document.</span>
        </p>
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center gap-4 text-center">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold shadow-lg ${
          isDarkMode
            ? "bg-zinc-100 text-zinc-900"
            : "bg-slate-800 text-white"
        }`}
      >
        AI
      </div>
      <div>
        <h3
          className={`text-xl font-bold ${
            isDarkMode ? "text-zinc-50" : "text-slate-900"
          }`}
        >
          Document AI Analysis
        </h3>
        <p
          className={`mt-1 text-sm ${
            isDarkMode ? "text-zinc-400" : "text-slate-600"
          }`}
        >
          Extract structured clinical data from uploaded documents using AI.
        </p>
      </div>
      {aiError && (
        <div
          className={`w-full max-w-md rounded-lg border p-4 text-left ${
            isDarkMode
              ? "border-red-500/30 bg-red-500/10"
              : "border-red-200 bg-red-50"
          }`}
        >
          <p
            className={`text-sm ${
              isDarkMode ? "text-red-400" : "text-red-700"
            }`}
          >
            {aiError}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {documents.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => handleRunExtraction(doc)}
            disabled={isExtracting}
            className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 font-bold text-white transition-transform focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
              isDarkMode
                ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:scale-105 focus:ring-indigo-400"
                : "bg-teal-600 hover:bg-teal-700 shadow-sm hover:scale-105 focus:ring-teal-300"
            }`}
          >
            {isExtracting ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Analyzing Document...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Run OCR Extraction
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  )}
  </div>
</div>

          <div
            className={`relative overflow-hidden rounded-2xl border p-6 shadow-2xl backdrop-blur-md ${
              isDarkMode
                ? "border-white/10 bg-white/5"
                : "border-slate-200 bg-white shadow-md"
            }`}
          >
            {isDarkMode && (
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
            )}
            <div className="relative flex flex-col gap-5">
              <div>
                <h2
                  className={`text-xl font-bold ${
                    isDarkMode ? "text-zinc-50" : "text-slate-900"
                  }`}
                >
                  Clinical Sign-off &amp; Decision
                </h2>
                <p
                  className={`mt-1 text-sm ${
                    isDarkMode ? "text-zinc-400" : "text-slate-600"
                  }`}
                >
                  Review complete. Provide clinical notes and finalize case disposition.
                </p>
              </div>

              {submitSuccess ? (
                <div
                  className={`flex items-center gap-3 rounded-xl border p-4 ${
                    isDarkMode
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15l2.55-2.55L15 14.25l-3.75 3.75L7.5 15z" />
                    <circle cx={12} cy={12} r={9} />
                  </svg>
                  <span className="text-sm font-medium">{submitSuccess}</span>
                </div>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="doctor-notes"
                      className={`block text-xs font-semibold uppercase tracking-wider ${
                        isDarkMode ? "text-slate-400" : "text-slate-500"
                      }`}
                    >
                      Doctor Clinical Notes / Prescription
                    </label>
                    <textarea
                      id="doctor-notes"
                      value={doctorNotes}
                      onChange={(e) => setDoctorNotes(e.target.value)}
                      disabled={isSubmitting}
                      rows={5}
                      placeholder="Enter clinical notes, prescriptions, key findings, or revision requests."
                      className={`mt-2 w-full resize-y rounded-xl border p-4 text-sm placeholder-slate-400 focus:outline-none disabled:cursor-not-allowed ${
                        isDarkMode
                          ? "border-white/10 bg-zinc-900/50 text-zinc-100 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500"
                          : "border-slate-200 bg-white text-slate-900 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500"
                      }`}
                    />
                  </div>

                  {submitError && (
                    <div
                      className={`rounded-lg border p-3 ${
                        isDarkMode
                          ? "border-red-500/30 bg-red-500/10"
                          : "border-red-200 bg-red-50"
                      }`}
                    >
                      <p
                        className={`text-sm ${
                          isDarkMode ? "text-red-400" : "text-red-700"
                        }`}
                      >
                        {submitError}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => handleDoctorAction("approved")}
                      disabled={isSubmitting}
                      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-3 font-bold text-white transition-all shadow-sm focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                        isDarkMode
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:from-emerald-400 hover:to-emerald-500 hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] focus:ring-emerald-400"
                          : "bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Approving...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15l2.55-2.55L15 14.25l-3.75 3.75L7.5 15z" />
                            <circle cx={12} cy={12} r={9} />
                          </svg>
                          Approve Case
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDoctorAction("rejected")}
                      disabled={isSubmitting}
                      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-3 font-bold text-white transition-all shadow-sm focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                        isDarkMode
                          ? "bg-gradient-to-r from-rose-500 to-rose-600 shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:from-rose-400 hover:to-rose-500 hover:shadow-[0_0_25px_rgba(244,63,94,0.5)] focus:ring-rose-400"
                          : "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Rejecting...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172L12 19.043l2.828-2.871A9.953 9.953 0 0015 9.5a7 7 0 10-6 6.727v.001z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Reject / Request Revision
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
