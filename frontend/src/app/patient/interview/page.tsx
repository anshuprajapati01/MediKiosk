"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedQuestionIdRef = useRef<string | null>(null);

  useEffect(() => {
    async function loadQuestionnaire() {
      try {
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

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Auth session error:", sessionError);
      }

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
        setIsLoading(false);
        return;
      }

      const { data: existingInterview, error: existingError } = await supabase
        .from("interviews")
        .select("id")
        .eq("patient_id", patient.id)
        .eq("hospital_id", "11111111-1111-1111-1111-111111111111")
        .eq("questionnaire_id", questionnaire.id)
        .in("status", ["draft", "in_progress"])
        .limit(1)
        .maybeSingle();

      if (existingError) {
        console.error("Existing interview fetch error:", existingError);
        setError("Unable to check existing interview.");
        setIsLoading(false);
        return;
      }

      if (existingInterview) {
        setInterviewId(existingInterview.id);

        const { data: existingAnswers, error: answersError } = await supabase
          .from("answers")
          .select("question_id, value")
          .eq("interview_id", existingInterview.id);

        if (answersError) {
          setError("Unable to load existing answers.");
          setIsLoading(false);
          return;
        }

        const preFilled: AnswerState = {};
        existingAnswers?.forEach((a) => {
          if (a.value) preFilled[a.question_id] = a.value;
        });
        setAnswers(preFilled);
      } else {
        const { data: newInterview, error: createError } = await supabase
          .from("interviews")
          .insert({
            patient_id: patient.id,
            hospital_id: "11111111-1111-1111-1111-111111111111",
            questionnaire_id: questionnaire.id,
            intake_type: "web",
            status: "in_progress",
          })
          .select("id")
          .single();

        if (createError || !newInterview) {
          setError("Unable to start interview. Please try again later.");
          setIsLoading(false);
          return;
        }

        setInterviewId(newInterview.id);
      }

      setIsLoading(false);
    } catch (err) {
      console.error("Interview load error:", err);
      setError("An unexpected error occurred. Please try again later.");
      setIsLoading(false);
    }
  }

  loadQuestionnaire();
}, [router]);

  function handleAnswerChange(questionId: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  }

  const saveCurrentAnswer = useCallback(async (questionId?: string, value?: string): Promise<boolean> => {
    if (!interviewId || questions.length === 0) {
      return true;
    }

    const resolvedQuestionId = questionId ?? questions[currentQuestionIndex].id;
    const resolvedValue = value ?? answers[resolvedQuestionId];

    if (!resolvedValue || resolvedValue.trim().length === 0) {
      return true;
    }

    setSaveStatus('saving');

    const supabase = createSupabaseClient();
    const { error } = await supabase
      .from("answers")
      .upsert(
        [
          {
            interview_id: interviewId,
            question_id: resolvedQuestionId,
            value: resolvedValue.trim(),
          },
        ],
        { onConflict: "interview_id,question_id" },
      );

    if (error) {
      setError("Unable to save answer. Please try again.");
      setSaveStatus('error');
      return false;
    }

    setSaveStatus('saved');
    return true;
  }, [interviewId, questions, currentQuestionIndex, answers]);

  async function handleNext() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    debouncedQuestionIdRef.current = null;

    const saved = await saveCurrentAnswer();
    if (!saved) {
      return;
    }

    setCurrentQuestionIndex((prev) => prev + 1);
  }

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    try {
      const saved = await saveCurrentAnswer();
      if (!saved) {
        setIsSubmitting(false);
        return;
      }

      if (!interviewId) {
        setError("Interview not found. Please refresh and try again.");
        setIsSubmitting(false);
        return;
      }

      const supabase = createSupabaseClient();
      const { error: updateError } = await supabase
        .from("interviews")
        .update({ status: "awaiting_review" })
        .eq("id", interviewId);

      if (updateError) {
        setError("Unable to submit interview. Please try again later.");
        setIsSubmitting(false);
        return;
      }

       router.push("/patient");
       router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!questions.length || !interviewId || currentQuestionIndex >= questions.length) {
      return;
    }

    const currentQuestion = questions[currentQuestionIndex];
    const currentAnswer = answers[currentQuestion.id];

    if (!currentAnswer || currentAnswer.trim().length === 0) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debouncedQuestionIdRef.current = currentQuestion.id;

    debounceTimerRef.current = setTimeout(async () => {
      const questionIdToSave = debouncedQuestionIdRef.current;
      debounceTimerRef.current = null;
      debouncedQuestionIdRef.current = null;

      if (!questionIdToSave) return;

      const answerValue = answers[questionIdToSave];
      if (!answerValue || answerValue.trim().length === 0) return;

      await saveCurrentAnswer(questionIdToSave, answerValue);
    }, 700);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [answers, currentQuestionIndex, questions, interviewId, saveCurrentAnswer]);

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
            {questions.length > 0 && (() => {
              const progressPercentage = Math.round(
                ((currentQuestionIndex + 1) / questions.length) * 100,
              );

              return (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-base font-medium text-zinc-700 dark:text-zinc-300">
                    <span>
                      Question {currentQuestionIndex + 1} of {questions.length}
                    </span>
                    <span>{progressPercentage}%</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out dark:bg-blue-400"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {questions.length > 0 && (() => {
              const question = questions[currentQuestionIndex];
              return (
                <div key={question.id} className="flex flex-col gap-3">
                  <label
                    htmlFor={question.id}
                    className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
                  >
                    <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                      {currentQuestionIndex + 1}
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
              );
            })()}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              {currentQuestionIndex > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (debounceTimerRef.current) {
                      clearTimeout(debounceTimerRef.current);
                      debounceTimerRef.current = null;
                    }
                    debouncedQuestionIdRef.current = null;
                    setCurrentQuestionIndex((prev) => prev - 1);
                  }}
                  className="flex h-14 w-full items-center justify-center rounded-xl border-2 border-zinc-300 text-lg font-semibold text-zinc-900 transition-colors hover:border-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:border-zinc-100 dark:hover:bg-zinc-800 sm:w-auto sm:px-8"
                >
                  Back
                </button>
              )}

              {currentQuestionIndex < questions.length - 1 ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex h-14 w-full items-center justify-center rounded-xl bg-zinc-900 text-lg font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto sm:px-8"
                  >
                    Next
                  </button>
                  {saveStatus === 'saving' && (
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Saving...</span>
                  )}
                  {saveStatus === 'saved' && (
                    <span className="text-sm text-green-600 dark:text-green-400">Saved ✓</span>
                  )}
                  {saveStatus === 'error' && (
                    <span className="text-sm text-red-600 dark:text-red-400">Error saving</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!hasAnswers || isSubmitting}
                    className="flex h-14 w-full items-center justify-center rounded-xl bg-zinc-900 text-lg font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto sm:px-8"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Answers"}
                  </button>
                  {saveStatus === 'saving' && (
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Saving...</span>
                  )}
                  {saveStatus === 'saved' && (
                    <span className="text-sm text-green-600 dark:text-green-400">Saved ✓</span>
                  )}
                  {saveStatus === 'error' && (
                    <span className="text-sm text-red-600 dark:text-red-400">Error saving</span>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
