"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

type PatientProfile = {
  id: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  phone: string | null;
  mrn: string;
  created_at: string;
  updated_at: string;
};

type Interview = {
  id: string;
  patient_id: string;
  questionnaire_id: string;
  hospital_id: string;
  intake_type: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type Question = {
  id: string;
  questionnaire_id: string;
  section_id: string | null;
  text: string;
  type: string;
  category: string | null;
  validation_rules: Record<string, unknown> | null;
  locale: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  depends_on_question_id: string | null;
  depends_on_answer: string | null;
  questionnaire_sections?: { title: string; description?: string } | null;
};

type Answer = {
  id: string;
  interview_id: string;
  question_id: string;
  value: string;
  created_at: string;
  updated_at: string;
  questions: Question | null;
};

type Document = {
  id: string;
  patient_id: string;
  interview_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  size: number;
  status: string;
  created_at: string;
  updated_at: string;
};

type DocumentExtraction = {
  id: string;
  document_id: string;
  extracted_text: string;
  structured_data: {
    tests: { name: string; date: string; result: string; reference_range: string }[];
    medications: { name: string; dosage: string }[];
    diagnoses: string[];
  } | null;
  created_at: string;
  updated_at: string;
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

function getPatientName(patient: PatientProfile | null | undefined): string {
  if (!patient) return "Unknown Patient";
  if (patient.full_name) return patient.full_name;
  return "Unknown Patient";
}

export default function PatientVerifyPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [extractions, setExtractions] = useState<DocumentExtraction[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createSupabaseClient();

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user?.id) {
          router.push("/patient/login");
          return;
        }

        const { data: patientData, error: patientError } = await supabase
          .from("patients")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle<PatientProfile>();

        if (patientError) {
          setError("Unable to load patient details. Please try again later.");
          setIsLoading(false);
          return;
        }

        if (!patientData) {
          router.push("/patient/onboarding");
          return;
        }

        setPatient(patientData);

        const { data: interviewData, error: interviewError } = await supabase
          .from("interviews")
          .select("*")
          .eq("patient_id", patientData.id)
          .in("status", ["draft", "in_progress", "awaiting_review"])
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<Interview>();

        if (interviewError) {
          setError("Unable to load interview. Please try again later.");
          setIsLoading(false);
          return;
        }

        if (!interviewData) {
          setError("No active interview found. Please start a new interview.");
          setIsLoading(false);
          return;
        }

        setInterview(interviewData);

        const { data: answersData, error: answersError } = await supabase
          .from("answers")
          .select("*, questions(*, questionnaire_sections(title, description))")
          .eq("interview_id", interviewData.id)
          .order("id", { ascending: true });

        if (answersError) {
          setError("Unable to load interview answers. Please try again later.");
          setIsLoading(false);
          return;
        }

        setAnswers((answersData ?? []) as Answer[]);

        const { data: documentsData, error: documentsError } = await supabase
          .from("documents")
          .select("*")
          .eq("interview_id", interviewData.id)
          .order("created_at", { ascending: false });

        if (documentsError) {
          setError("Unable to load documents. Please try again later.");
          setIsLoading(false);
          return;
        }

        setDocuments((documentsData ?? []) as Document[]);

        if (documentsData && documentsData.length > 0) {
          const docIds = documentsData.map((d) => d.id);
          const { data: extractionsData, error: extractionsError } = await supabase
            .from("document_extractions")
            .select("*")
            .in("document_id", docIds)
            .order("created_at", { ascending: false });

          if (extractionsError) {
            console.error("Failed to load document extractions:", extractionsError);
          } else {
            setExtractions((extractionsData ?? []) as DocumentExtraction[]);
          }
        }

        setIsLoading(false);
      } catch {
        setError("An unexpected error occurred. Please try again later.");
        setIsLoading(false);
      }
    }

    loadData();
  }, [router]);

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

  async function handleBack() {
    if (interview?.id) {
      router.push(`/patient/interview`);
    } else {
      router.push("/patient");
    }
  }

  async function handleConfirmAndSubmit() {
    if (!interview?.id) {
      setSubmitError("Interview not found. Please refresh and try again.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const supabase = createSupabaseClient();

      const { error: updateError } = await supabase
        .from("interviews")
        .update({ status: "awaiting_review" })
        .eq("id", interview.id);

      if (updateError) {
        setSubmitError("Unable to submit interview. Please try again later.");
        setIsSubmitting(false);
        return;
      }

      setSubmitSuccess(true);
      setTimeout(() => {
        router.push("/patient");
        router.refresh();
      }, 2000);
    } catch {
      setSubmitError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading your information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="w-full max-w-md px-6">
          <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-8 text-center dark:bg-red-950">
            <h2 className="mb-2 text-xl font-semibold text-red-900 dark:text-red-200">Something went wrong</h2>
            <p className="text-base text-red-800 dark:text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => router.push("/patient")}
              className="mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="w-full max-w-md px-6">
          <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-8 text-center dark:bg-emerald-950">
            <div className="mb-4 text-5xl">✅</div>
            <h2 className="mb-2 text-xl font-semibold text-emerald-900 dark:text-emerald-200">Case Submitted Successfully</h2>
            <p className="text-base text-emerald-800 dark:text-emerald-300">
              Your information has been sent to the doctor queue. You will be notified when a doctor reviews your case.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const age = calculateAge(patient?.dob ?? null);

  return (
    <div className="flex flex-1 items-start justify-center bg-zinc-50 py-10 dark:bg-black">
      <div className="w-full max-w-5xl px-6">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-900 hover:bg-zinc-50 focus:ring-2 focus:ring-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-100 dark:hover:bg-zinc-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Interview
            </button>

            <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium tracking-wide text-amber-300">
              Pending Review
            </span>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md dark:border-white/5 dark:bg-white/5">
            <div className="mb-2">
              <h1 className="text-center text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                Review Your Information Before Submission
              </h1>
              <p className="mt-2 text-center text-base text-zinc-600 dark:text-zinc-400">
                Please verify your details and AI-extracted document data. This ensures clinical accuracy.
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md dark:border-white/5 dark:bg-white/5">
            <div className="mb-6 flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Personal Details</h2>
            </div>

            {patient && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Full Name</p>
                  <p className="mt-1 text-sm text-slate-200">{getPatientName(patient)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Date of Birth</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {patient.dob ? new Date(patient.dob).toLocaleDateString() : "N/A"}
                    {age !== null && ` (${age} years)`}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gender</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : "N/A"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">MRN</p>
                  <p className="mt-1 text-sm text-slate-200">{patient.mrn}</p>
                </div>
              </div>
            )}
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md dark:border-white/5 dark:bg-white/5">
            <div className="mb-6 flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Interview Responses</h2>
            </div>

            {answerGroups.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-white/5">
                <p className="text-lg text-zinc-600 dark:text-zinc-400">No interview responses recorded yet.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {answerGroups.map((group) => (
                  <div key={group.sectionTitle} className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-wider font-semibold text-emerald-400">
                        {group.sectionTitle}
                      </span>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        {group.items.length} {group.items.length === 1 ? "question" : "questions"}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3">
                      {group.items.map((item, idx) => (
                        <div
                          key={item.question.id}
                          className="flex flex-col gap-2 bg-slate-800/40 rounded-xl p-5 border-l-4 border-emerald-500/70 hover:bg-slate-800/60 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                              {idx + 1}
                            </span>
                            <p className="text-slate-300">{item.question.text}</p>
                          </div>
                          <p className={`pl-9 text-lg font-medium mt-2 ${item.answer.trim().length === 0 ? "italic text-zinc-500" : "text-white"}`}>
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

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md dark:border-white/5 dark:bg-white/5">
            <div className="mb-6 flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Attached Documents</h2>
            </div>

            {documents.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-white/5">
                <p className="text-lg text-zinc-600 dark:text-zinc-400">No documents uploaded for this interview.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-xl border-2 border-zinc-200 bg-zinc-50 p-4 transition-all duration-200 hover:border-indigo-500/40 hover:bg-slate-800/40 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-indigo-500/40 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex flex-col">
                      <span className="truncate text-base font-medium text-zinc-900 dark:text-zinc-50">{doc.file_name}</span>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        {(doc.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
                        Unverified by patient
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {documents.length > 0 && extractions.length > 0 && (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-800/50 to-slate-900/80 border border-indigo-500/30 p-8 shadow-inner">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Extracted Lab Results</h3>
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
                  Unverified by patient
                </span>
              </div>

              {extractions.map((extraction) => {
                const document = documents.find((d) => d.id === extraction.document_id);
                if (!document) return null;

                return (
                  <div key={extraction.id} className="mb-6">
                    <h4 className="mb-4 text-sm font-semibold text-slate-400">
                      From: {document.file_name}
                    </h4>

                    {extraction.structured_data && (
                      <div className="grid gap-6 md:grid-cols-2">
                        {extraction.structured_data.tests.length > 0 && (
                          <div className="md:col-span-2 space-y-3">
                            <h5 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Lab Tests</h5>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-white/5 overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-white/10">
                                    <th className="text-left py-2 px-3 font-semibold text-slate-400">Test Name</th>
                                    <th className="text-left py-2 px-3 font-semibold text-slate-400">Date</th>
                                    <th className="text-left py-2 px-3 font-semibold text-slate-400">Result</th>
                                    <th className="text-left py-2 px-3 font-semibold text-slate-400">Reference Range</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {extraction.structured_data.tests.map((test, idx) => (
                                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                                      <td className="py-2 px-3 text-white">{test.name}</td>
                                      <td className="py-2 px-3 text-slate-400">{test.date || "—"}</td>
                                      <td className="py-2 px-3 text-white">{test.result || "—"}</td>
                                      <td className="py-2 px-3 text-slate-400">{test.reference_range || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {extraction.structured_data.medications.length > 0 && (
                          <div className="space-y-3">
                            <h5 className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Medications</h5>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-white/5">
                              <div className="grid gap-3 sm:grid-cols-2">
                                {extraction.structured_data.medications.map((med, idx) => (
                                  <div key={idx} className="rounded-lg border border-white/10 bg-white/5 p-3">
                                    <p className="font-medium text-white">{med.name}</p>
                                    <p className="text-xs text-slate-400">{med.dosage || "Dosage not specified"}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {extraction.structured_data.diagnoses.length > 0 && (
                          <div className="space-y-3">
                            <h5 className="text-xs font-semibold uppercase tracking-wider text-amber-400">Diagnoses</h5>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-white/5">
                              <ul className="space-y-2">
                                {extraction.structured_data.diagnoses.map((diag, idx) => (
                                  <li key={idx} className="flex items-center gap-2 text-sm text-white">
                                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                                    {diag}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/50 p-4 font-mono text-xs text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap">
                      {extraction.extracted_text || "No text extracted"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 shadow-[0_0_30px_rgba(245,158,11,0.15)] backdrop-blur-md">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent pointer-events-none" />
            <div className="relative flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-amber-300">Important: Verify AI-Extracted Data</h3>
                <p className="mt-2 text-sm text-amber-200/90">
                  The document extractions above are AI-generated and may contain errors. Please carefully review all lab results, medications, and diagnoses. By confirming and submitting, you attest that this information is accurate to the best of your knowledge.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="flex min-h-[50px] w-full items-center justify-center rounded-xl border-2 border-zinc-300 px-4 py-3 text-lg font-semibold text-zinc-900 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none hover:border-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:border-zinc-100 dark:hover:bg-zinc-800 sm:w-auto sm:px-8"
            >
              Back to Interview
            </button>

            <button
              type="button"
              onClick={handleConfirmAndSubmit}
              disabled={isSubmitting}
              className="flex min-h-[50px] w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-lg font-semibold text-white transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto sm:px-8"
            >
              {isSubmitting ? "Submitting..." : "Confirm & Submit Case"}
            </button>
          </div>

          {submitError && (
            <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4 text-center text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
              {submitError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
