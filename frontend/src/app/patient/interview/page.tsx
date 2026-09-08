"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

type Questionnaire = {
  id: string;
  name: string;
  version: string;
  category: string;
  description: string | null;
  is_active: boolean;
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
};

type AnswerState = Record<string, string>;

export default function PatientInterviewPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [questionnaireId, setQuestionnaireId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadQuestionnaire() {
      const supabase = createSupabaseClient();

      const { data: questionnaire, error: questionnaireError } = await supabase
        .from("questionnaires")
        .select("*")
        .eq("category", "clinical")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle<Questionnaire>();

      if (questionnaireError) {
        setError("Unable to load questionnaire. Please try again later.");
        setIsLoading(false);
        return;
      }

      if (!questionnaire) {
        setError("No active clinical questionnaire found.");
        setIsLoading(false);
        return;
      }

      setQuestionnaireId(questionnaire.id);

      const { data: fetchedQuestions, error: questionsError } = await supabase
        .from("questions")
        .select("*")
        .eq("questionnaire_id", questionnaire.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (questionsError) {
        setError("Unable to load questions. Please try again later.");
        setIsLoading(false);
        return;
      }

      setQuestions(fetchedQuestions || []);
      setIsLoading(false);
    }

    loadQuestionnaire();
  }, []);

  function handleAnswerChange(questionId: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  }

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    try {
      const supabase = createSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        router.push("/patient/login");
        return;
      }

      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (patientError || !patient) {
        setError("Patient profile not found. Please complete onboarding first.");
        setIsSubmitting(false);
        return;
      }

      if (!questionnaireId) {
        setError("Questionnaire not loaded. Please refresh and try again.");
        setIsSubmitting(false);
        return;
      }

      const { data: interview, error: interviewError } = await supabase
        .from("interviews")
        .insert({
          patient_id: patient.id,
          hospital_id: "11111111-1111-1111-1111-111111111111",
          questionnaire_id: questionnaireId,
          intake_type: "web",
          status: "awaiting_review",
        })
        .select("id")
        .single();

      if (interviewError || !interview) {
        setError("Unable to create interview. Please try again later.");
        setIsSubmitting(false);
        return;
      }

      const answerRecords = Object.entries(answers)
        .filter(([, value]) => value.trim().length > 0)
        .map(([question_id, value]) => ({
          interview_id: interview.id,
          question_id,
          value: value.trim(),
        }));

      if (answerRecords.length > 0) {
        const { error: answersError } = await supabase.from("answers").insert(answerRecords);

        if (answersError) {
          setError("Unable to save answers. Please try again later.");
          setIsSubmitting(false);
          return;
        }
      }

      router.push("/patient");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading clinical interview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white dark:bg-black">
        <div className="w-full max-w-md px-6">
          <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-8 text-center dark:bg-red-950">
            <h2 className="mb-2 text-xl font-semibold text-red-900 dark:text-red-200">Something went wrong</h2>
            <p className="text-base text-red-800 dark:text-red-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const hasAnswers = Object.values(answers).some((value) => value.trim().length > 0);

  return (
    <div className="flex flex-1 items-start justify-center bg-zinc-50 py-10 dark:bg-black">
      <div className="w-full max-w-3xl px-6">
        <div className="rounded-2xl border-2 border-zinc-900 bg-white p-8 shadow-lg dark:border-zinc-100 dark:bg-zinc-900">
          <h1 className="mb-2 text-center text-4xl font-bold text-zinc-900 dark:text-zinc-50">
            Clinical Interview
          </h1>
          <p className="mb-8 text-center text-base text-zinc-600 dark:text-zinc-400">
            Please answer the following questions to the best of your ability.
          </p>

          <form onSubmit={(e) => e.preventDefault()} noValidate className="flex flex-col gap-8">
            {questions.map((question, index) => (
              <div key={question.id} className="flex flex-col gap-3">
                <label
                  htmlFor={question.id}
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                    {index + 1}
                  </span>
                  {question.text}
                </label>

                {question.type === "text" && (
                  <textarea
                    id={question.id}
                    value={answers[question.id] || ""}
                    onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border-2 border-zinc-300 bg-zinc-50 p-4 text-lg text-zinc-900 transition-colors focus:border-zinc-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-100"
                  />
                )}

                {question.type === "number" && (
                  <input
                    id={question.id}
                    type="number"
                    value={answers[question.id] || ""}
                    onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    className="w-full rounded-xl border-2 border-zinc-300 bg-zinc-50 p-4 text-lg text-zinc-900 transition-colors focus:border-zinc-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-100"
                  />
                )}

                {question.type !== "text" && question.type !== "number" && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Unsupported question type: {question.type}
                  </p>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!hasAnswers || isSubmitting}
              className="mt-4 flex h-16 w-full items-center justify-center rounded-xl bg-zinc-900 text-xl font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isSubmitting ? "Submitting..." : "Submit Answers"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
