"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

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

export default function DoctorReviewPage({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isRunningOcr, setIsRunningOcr] = useState(false);

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
        setIsLoading(false);
      } catch {
        setError("An unexpected error occurred. Please try again later.");
        setIsLoading(false);
      }
    }

    loadData();
  }, [interviewId]);

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

  async function handleRunOcr() {
    setIsRunningOcr(true);
    setTimeout(() => {
      setIsRunningOcr(false);
      alert("OCR extraction will be hooked up to the Gemini API in the next step.");
    }, 800);
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading review...</p>
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
    <div className="flex flex-1 items-start justify-center bg-zinc-50 py-10 dark:bg-black">
      <div className="w-full max-w-5xl px-6">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.push("/doctor/dashboard")}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-900 hover:bg-zinc-50 focus:ring-2 focus:ring-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-100 dark:hover:bg-zinc-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </button>

            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${
                interview?.status === "awaiting_review"
                  ? "border-amber-500/30 bg-amber-500/20 text-amber-300"
                  : "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
              }`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl p-6">
            <div className="mb-4">
              <h1 className="text-center text-3xl font-bold text-white">
                Doctor Review
              </h1>
              <p className="mt-2 text-center text-base text-slate-400">
                Review patient interview responses and uploaded documents.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6">
              <div className="flex flex-col">
                <p className="text-slate-400 text-xs tracking-widest uppercase">Patient</p>
                <p className="text-white text-lg font-semibold">{patientName}</p>
              </div>
              <div className="h-8 w-px bg-slate-700" />
              <div className="flex flex-col">
                <p className="text-slate-400 text-xs tracking-widest uppercase">Age</p>
                <p className="text-white text-lg font-semibold">{age !== null ? `${age} years` : "N/A"}</p>
              </div>
              <div className="h-8 w-px bg-slate-700" />
              <div className="flex flex-col">
                <p className="text-slate-400 text-xs tracking-widest uppercase">Gender</p>
                <p className="text-white text-lg font-semibold">
                  {patient?.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : "N/A"}
                </p>
              </div>
              <div className="h-8 w-px bg-slate-700" />
              <div className="flex flex-col">
                <p className="text-slate-400 text-xs tracking-widest uppercase">Interview ID</p>
                <p className="text-white text-lg font-semibold truncate">{interview?.id}</p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md dark:border-white/5 dark:bg-white/5">
            <h2 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Clinical Assessment</h2>

            {answerGroups.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-white/5">
                <p className="text-lg text-zinc-600 dark:text-zinc-400">No answers recorded for this interview.</p>
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
            <h2 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Uploaded Documents</h2>
            <p className="mb-6 text-base text-zinc-600 dark:text-zinc-400">
              The following documents are attached to this case.
            </p>

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
                       <button
                         type="button"
                         onClick={() => handleViewDocument(doc.file_path)}
                         className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-slate-900/60 px-3 py-1.5 text-sm font-semibold text-indigo-300 transition-all duration-200 hover:border-indigo-400 hover:text-indigo-200 hover:shadow-[0_0_10px_rgba(99,102,241,0.3)] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                       >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View Original
                      </button>
                      <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{doc.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

           <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-800/50 to-slate-900/80 border border-indigo-500/30 p-8 shadow-inner">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-2xl font-bold text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
                AI
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Document AI Analysis</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Extract structured clinical data from uploaded documents using AI.
                </p>
              </div>
               <button
                 type="button"
                 onClick={handleRunOcr}
                 disabled={isRunningOcr}
                 className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 px-6 py-3 font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-transform hover:scale-105 focus:ring-2 focus:ring-indigo-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
               >
                {isRunningOcr ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </>
                ) : (
                  "Run OCR Extraction"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
