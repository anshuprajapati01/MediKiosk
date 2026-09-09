"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

interface SpeechRecognitionEvent {
  results: {
    length: number;
    [index: number]: {
      length: number;
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((event: SpeechRecognitionEvent) => void) | null;
      onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
      onend: (() => void) | null;
      start(): void;
      stop(): void;
    };
    webkitSpeechRecognition?: new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((event: SpeechRecognitionEvent) => void) | null;
      onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
      onend: (() => void) | null;
      start(): void;
      stop(): void;
    };
  }
}

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
  depends_on_question_id: string | null;
  depends_on_answer: string | null;
  questionnaire_sections?: { title: string; description?: string } | null;
};

type AnswerState = Record<string, string>;

const getSectionTitle = (q: Question | Record<string, unknown>) => {
  const sections = (q as Record<string, unknown>).questionnaire_sections;
  if (!sections) return null;
  if (Array.isArray(sections)) return (sections as { title?: string }[])[0]?.title || null;
  return (sections as { title?: string }).title || null;
};

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
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showUploadStep, setShowUploadStep] = useState(false);
  const [documents, setDocuments] = useState<{ name: string; path: string; size: number; mime_type: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedQuestionIdRef = useRef<string | null>(null);
  const resumeTimerRef = useRef<NodeJS.Timeout | null>(null);

  function isQuestionVisible(question: Question, currentAnswers: Record<string, string>): boolean {
    if (!question.depends_on_question_id) return true;
    const parentAnswer = currentAnswers[question.depends_on_question_id];
    if (!parentAnswer || parentAnswer.trim().length === 0) return false;
    if (!question.depends_on_answer) return true;
    return parentAnswer.toLowerCase() === question.depends_on_answer.toLowerCase();
  }

  function speakText(text: string, locale?: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === 'hi' ? 'hi-IN' : 'en-IN';

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }

  function toggleListening() {
    if (typeof window === 'undefined') {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;

    const currentQuestion = visibleQuestions[currentQuestionIndex];
    recognition.lang = currentQuestion.locale === 'hi' ? 'hi-IN' : 'en-IN';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      const transcript = last[0].transcript;
      if (currentQuestion) {
        if (currentQuestion.type === 'number') {
          const match = transcript.match(/\d+/);
          if (match) {
            handleAnswerChange(currentQuestion.id, match[0]);
          }
        } else {
          handleAnswerChange(currentQuestion.id, transcript);
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        alert('Microphone access was denied. Please allow microphone access to use voice input.');
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    setIsListening(true);
    recognition.start();
  }

  const visibleQuestions = useMemo(() => {
    return questions.filter((q) => isQuestionVisible(q, answers));
  }, [questions, answers]);

  useEffect(() => {
    if (currentQuestionIndex >= visibleQuestions.length && visibleQuestions.length > 0) {
      const timer = setTimeout(() => {
        setCurrentQuestionIndex(visibleQuestions.length - 1);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [visibleQuestions.length, currentQuestionIndex]);

  useEffect(() => {
    if (isResuming) {
      resumeTimerRef.current = setTimeout(() => {
        setIsResuming(false);
      }, 5000);

      return () => {
        if (resumeTimerRef.current) {
          clearTimeout(resumeTimerRef.current);
          resumeTimerRef.current = null;
        }
      };
    }
  }, [isResuming]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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
        .select("*, questionnaire_sections(title, description)")
        .eq("questionnaire_id", questionnaire.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (questionsError) {
        setError("Unable to load questions. Please try again later.");
        setIsLoading(false);
        return;
      }

      setQuestions(fetchedQuestions || []);
      console.log("Fetched Questions Data:", fetchedQuestions);

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

      setPatientId(patient.id);

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

        const questionsData = fetchedQuestions || [];
        if (questionsData.length > 0) {
          const visibleQuestionsData = questionsData.filter((q) => isQuestionVisible(q, preFilled));
          const resumeIndex = visibleQuestionsData.findIndex((q) => {
            const answer = existingAnswers?.find((a) => a.question_id === q.id);
            return !answer || !answer.value || answer.value.trim().length === 0;
          });
          const finalIndex = resumeIndex >= 0 ? resumeIndex : Math.max(0, visibleQuestionsData.length - 1);
          setCurrentQuestionIndex(finalIndex);

          if (finalIndex > 0) {
            setIsResuming(true);
          }
        }
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
    if (!interviewId || visibleQuestions.length === 0 || currentQuestionIndex >= visibleQuestions.length) {
      return true;
    }

    const resolvedQuestionId = questionId ?? visibleQuestions[currentQuestionIndex].id;
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
  }, [interviewId, visibleQuestions, currentQuestionIndex, answers]);

  async function handleNext() {
    if (currentQuestionIndex >= visibleQuestions.length - 1) {
      setShowUploadStep(true);
      return;
    }
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

      if (documents.length > 0) {
        const docsToInsert = documents.map((doc) => ({
          patient_id: patientId,
          interview_id: interviewId,
          file_path: doc.path,
          file_name: doc.name,
          mime_type: doc.mime_type,
          size: doc.size,
          status: 'uploaded',
        }));

        const { error: docError } = await supabase.from('documents').insert(docsToInsert);
        if (docError) {
          console.error("Error inserting into documents table:", docError);
        }
      }

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

  async function handleReview() {
    if (currentQuestionIndex >= visibleQuestions.length) {
      return;
    }
    const saved = await saveCurrentAnswer();
    if (!saved) {
      return;
    }

    setShowUploadStep(true);
  }

  async function handleUploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!interviewId) {
      setUploadError("Interview not found. Please refresh and try again.");
      return;
    }

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
    const maxSize = 10 * 1024 * 1024;
    const supabase = createSupabaseClient();
    const newDocs: { name: string; path: string; size: number; mime_type: string }[] = [];

    setIsUploading(true);
    setUploadError(null);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!allowedTypes.includes(file.type)) {
        setUploadError(`Invalid file type: ${file.name}. Allowed: PDF, PNG, JPEG.`);
        continue;
      }
      if (file.size > maxSize) {
        setUploadError(`File too large: ${file.name}. Max size is 10MB.`);
        continue;
      }

      const filePath = `${interviewId}/${Date.now()}-${i}-${file.name}`;
      const { error } = await supabase.storage.from('medical-documents').upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

      if (error) {
        setUploadError(`Upload failed for ${file.name}: ${error.message}`);
        continue;
      }

      newDocs.push({ name: file.name, path: filePath, size: file.size, mime_type: file.type });
    }

    if (newDocs.length > 0) {
      setDocuments((prev) => [...prev, ...newDocs]);
    }
    setIsUploading(false);
  }

  function handleRemoveDocument(index: number) {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  }

  async function getDocumentViewUrl(docPath: string): Promise<string | null> {
    try {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase.storage
        .from('medical-documents')
        .createSignedUrl(docPath, 3600);

      if (error || !data?.signedUrl) {
        console.error('Failed to create signed URL:', error);
        return null;
      }
      return data.signedUrl;
    } catch (err) {
      console.error('Error creating signed URL:', err);
      return null;
    }
  }

  async function handleViewDocument(docPath: string) {
    const url = await getDocumentViewUrl(docPath);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function handleContinueToReview() {
    await saveCurrentAnswer();
    setShowUploadStep(false);
    setIsReviewMode(true);
  }

  useEffect(() => {
    if (!visibleQuestions.length || !interviewId || currentQuestionIndex >= visibleQuestions.length) {
      return;
    }

    const currentQuestion = visibleQuestions[currentQuestionIndex];
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
  }, [answers, currentQuestionIndex, visibleQuestions, interviewId, saveCurrentAnswer]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          <p className="text-lg text-zinc-600 dark:text-zinc-400">Preparing your clinical assessment...</p>
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
  const displayIndex = Math.min(currentQuestionIndex, Math.max(0, visibleQuestions.length - 1));

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

          {isResuming && (
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-center text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
              You have an unfinished assessment. Resuming where you left off.
            </div>
          )}

          <form onSubmit={(e) => e.preventDefault()} noValidate className="flex flex-col gap-8">
            {showUploadStep ? (
              <div className="flex flex-col gap-6">
                <h2 className="text-center text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  Upload Medical Documents
                </h2>
                <p className="text-center text-base text-zinc-600 dark:text-zinc-400">
                  You may optionally upload supporting medical documents (PDF, PNG, JPEG) up to 10MB each.
                </p>

                <label
                  htmlFor="medical-document-upload"
                  className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                    isUploading
                      ? 'border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800'
                      : 'border-zinc-400 bg-zinc-50 hover:border-zinc-900 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-zinc-100 dark:hover:bg-zinc-700'
                  }`}
                >
                  <span className="text-4xl">📄</span>
                  <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {isUploading ? 'Uploading...' : 'Click to choose files'}
                  </span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    PDF, PNG, or JPEG (max 10MB)
                  </span>
                  <input
                    id="medical-document-upload"
                    type="file"
                    multiple
                    accept="application/pdf,image/png,image/jpeg"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      handleUploadFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>

                {uploadError && (
                  <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                    {uploadError}
                  </div>
                )}

                {documents.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                      Attached Documents ({documents.length})
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {documents.map((doc, index) => (
                        <li
                          key={doc.path}
                          className="flex items-center justify-between gap-3 rounded-xl border-2 border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800"
                        >
                          <div className="flex flex-col">
                            <span className="truncate text-base font-medium text-zinc-900 dark:text-zinc-50">
                              {doc.name}
                            </span>
                            <span className="text-sm text-zinc-500 dark:text-zinc-400">
                              {(doc.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                handleViewDocument(doc.path);
                              }}
                              className="text-blue-500 hover:text-blue-400 text-sm font-medium mr-4"
                            >
                              View
                            </a>
                            <button
                              type="button"
                              onClick={() => handleRemoveDocument(index)}
                              className="flex min-h-[44px] items-center justify-center rounded-lg border-2 border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:border-red-500 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentQuestionIndex((prev) => Math.max(0, prev - 1));
                      setShowUploadStep(false);
                    }}
                    className="flex min-h-[50px] w-full items-center justify-center rounded-xl border-2 border-zinc-300 px-4 py-3 text-lg font-semibold text-zinc-900 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none hover:border-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:border-zinc-100 dark:hover:bg-zinc-800 sm:w-auto sm:px-8"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueToReview}
                    disabled={isUploading}
                    className="flex min-h-[50px] w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-lg font-semibold text-white transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto sm:px-8"
                  >
                    Continue to Review
                  </button>
                </div>
              </div>
            ) : isReviewMode ? (
              <div className="flex flex-col gap-6">
                <h2 className="text-center text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  Review Your Answers
                </h2>
                <p className="text-center text-base text-zinc-600 dark:text-zinc-400">
                  Please review your responses before submitting.
                </p>

                <div className="flex flex-col gap-4">
                  {visibleQuestions.map((question, index) => {
                    const answer = answers[question.id];
                    const isEmpty = !answer || answer.trim().length === 0;

                    return (
                      <div
                        key={question.id}
                        className={`rounded-xl border-2 p-5 transition-colors ${
                          isEmpty
                            ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950'
                            : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800'
                        }`}
                      >
                         <div className="flex items-start justify-between gap-4">
                         <div className="flex-1">
                           {getSectionTitle(question) && (
                             <div className="mb-4">
                               <span className="text-sm font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full dark:bg-emerald-900/50 dark:text-emerald-400">
                                 {getSectionTitle(question)}
                               </span>
                             </div>
                           )}
                           {question.section_id === '60f7a39e-754e-440f-99b6-eebfe01ebecd' && (
                             <div className="mb-4">
                               <span className="text-sm font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full dark:bg-emerald-900/50 dark:text-emerald-400">
                                 AYUSH Lifestyle Assessment
                               </span>
                             </div>
                           )}
                           <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                              <span className={`mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                                isEmpty
                                  ? 'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100'
                                  : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                              }`}>
                                {index + 1}
                              </span>
                              {question.text}
                            </p>
                            <p className={`mt-2 text-base ${isEmpty ? 'text-zinc-400 italic' : 'text-zinc-700 dark:text-zinc-300'}`}>
                              {isEmpty ? 'No answer provided' : answer}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentQuestionIndex(index);
                              setIsReviewMode(false);
                            }}
                            className="flex min-h-[50px] w-auto items-center justify-center rounded-lg border-2 border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-900 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none hover:border-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:border-zinc-100 dark:hover:bg-zinc-700"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {documents.length > 0 && (
                  <div className="flex flex-col gap-4 rounded-xl border-2 border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800">
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                      Uploaded Medical Documents
                    </h3>
                    <p className="text-base text-zinc-600 dark:text-zinc-400">
                      The following documents are attached to your case.
                    </p>
                    <ul className="flex flex-col gap-2">
                      {documents.map((doc) => (
                        <li
                          key={doc.path}
                          className="flex items-center justify-between gap-3 rounded-lg border-2 border-zinc-200 bg-white p-4 dark:border-zinc-600 dark:bg-zinc-900"
                        >
                          <div className="flex flex-col">
                            <span className="truncate text-base font-medium text-zinc-900 dark:text-zinc-50">
                              {doc.name}
                            </span>
                            <span className="text-sm text-zinc-500 dark:text-zinc-400">
                              {(doc.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                handleViewDocument(doc.path);
                              }}
                              className="text-blue-500 hover:text-blue-400 text-sm font-medium mr-4"
                            >
                              View
                            </a>
                            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                              Attached
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentQuestionIndex((prev) => prev - 1);
                      setIsReviewMode(false);
                    }}
                    disabled={currentQuestionIndex === 0}
                    className="flex min-h-[50px] w-full items-center justify-center rounded-xl border-2 border-zinc-300 px-4 py-3 text-lg font-semibold text-zinc-900 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none hover:border-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:border-zinc-100 dark:hover:bg-zinc-800 sm:w-auto sm:px-8"
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!hasAnswers || isSubmitting}
                    className="flex min-h-[50px] w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-lg font-semibold text-white transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto sm:px-8"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Case"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {visibleQuestions.length > 0 && (() => {
                  const progressPercentage = Math.round(
                    ((displayIndex + 1) / visibleQuestions.length) * 100,
                  );

                  return (
                    <div className="flex flex-col gap-2" aria-live="polite" aria-label="Interview progress">
                      <div className="flex items-center justify-between text-base font-medium text-zinc-700 dark:text-zinc-300">
                        <span>
                          Question {displayIndex + 1} of {visibleQuestions.length}
                        </span>
                        <span>{progressPercentage}%</span>
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" role="progressbar" aria-valuenow={progressPercentage} aria-valuemin={0} aria-valuemax={100} aria-label="Question progress">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out dark:bg-blue-400"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                 {visibleQuestions.length > 0 && (() => {
                    const question = visibleQuestions[displayIndex];
                     return (
                        <div key={question.id} className="flex flex-col gap-3">
                          {getSectionTitle(question) && (
                            <div className="mb-4">
                              <span className="text-sm font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full dark:bg-emerald-900/50 dark:text-emerald-400">
                                {getSectionTitle(question)}
                              </span>
                            </div>
                          )}
                          {question.section_id === '60f7a39e-754e-440f-99b6-eebfe01ebecd' && (
                            <div className="mb-4">
                              <span className="text-sm font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full dark:bg-emerald-900/50 dark:text-emerald-400">
                                AYUSH Lifestyle Assessment
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                         <label
                           htmlFor={question.id}
                           className="text-xl font-semibold text-zinc-900 dark:text-zinc-50"
                         >
                           <span className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-base font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                             {displayIndex + 1}
                           </span>
                           {question.text}
                         </label>
                         <button
                           type="button"
                           onClick={() => {
                             if (isSpeaking) {
                               window.speechSynthesis.cancel();
                               setIsSpeaking(false);
                             } else {
                               speakText(question.text, question.locale);
                             }
                           }}
                           className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border-2 border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none hover:border-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:border-zinc-100 dark:hover:bg-zinc-700"
                           aria-label={isSpeaking ? 'Stop listening' : 'Listen to question'}
                         >
                           {isSpeaking ? '⏹ Stop' : '🔊 Listen'}
                         </button>
                       </div>

                       {question.type === "text" && (
                         <textarea
                           id={question.id}
                           value={answers[question.id] || ""}
                           onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                           rows={4}
                           className="min-h-[50px] w-full rounded-xl border-2 border-zinc-300 bg-zinc-50 p-4 text-lg text-zinc-900 transition-colors focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-100"
                         />
                       )}

                       {question.type === "number" && (
                         <input
                           id={question.id}
                           type="number"
                           value={answers[question.id] || ""}
                           onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                           className="min-h-[50px] w-full rounded-xl border-2 border-zinc-300 bg-zinc-50 p-4 text-lg text-zinc-900 transition-colors focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-100"
                         />
                       )}

                       {typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition) && (
                         <button
                           type="button"
                           onClick={toggleListening}
                           className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                             isListening
                               ? 'border-red-500 bg-red-50 text-red-700 animate-pulse dark:border-red-400 dark:bg-red-950 dark:text-red-200'
                               : 'border-zinc-300 text-zinc-900 hover:border-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:border-zinc-100 dark:hover:bg-zinc-700'
                           } disabled:cursor-not-allowed disabled:opacity-60`}
                           aria-label={isListening ? 'Stop listening' : 'Speak your answer'}
                         >
                           {isListening ? '🔴 Listening...' : '🎤 Speak'}
                         </button>
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
                      className="flex min-h-[50px] w-full items-center justify-center rounded-xl border-2 border-zinc-300 px-4 py-3 text-lg font-semibold text-zinc-900 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none hover:border-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:border-zinc-100 dark:hover:bg-zinc-800 sm:w-auto sm:px-8"
                    >
                      Back
                    </button>
                  )}

                  {currentQuestionIndex < visibleQuestions.length - 1 ? (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleNext}
                        className="flex min-h-[50px] w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-lg font-semibold text-white transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto sm:px-8"
                      >
                        Next
                      </button>
                      <span aria-live="polite" className="sr-only">
                        {saveStatus === 'saving' && 'Saving'}
                        {saveStatus === 'saved' && 'Saved'}
                        {saveStatus === 'error' && 'Error saving'}
                      </span>
                      {saveStatus === 'saving' && (
                        <span className="text-sm text-zinc-500 dark:text-zinc-400" aria-hidden="true">Saving...</span>
                      )}
                      {saveStatus === 'saved' && (
                        <span className="text-sm text-green-600 dark:text-green-400" aria-hidden="true">Saved ✓</span>
                      )}
                      {saveStatus === 'error' && (
                        <span className="text-sm text-red-600 dark:text-red-400" aria-hidden="true">Error saving</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleReview}
                        className="flex min-h-[50px] w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-lg font-semibold text-white transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto sm:px-8"
                      >
                        Review Answers
                      </button>
                      <span aria-live="polite" className="sr-only">
                        {saveStatus === 'saving' && 'Saving'}
                        {saveStatus === 'saved' && 'Saved'}
                        {saveStatus === 'error' && 'Error saving'}
                      </span>
                      {saveStatus === 'saving' && (
                        <span className="text-sm text-zinc-500 dark:text-zinc-400" aria-hidden="true">Saving...</span>
                      )}
                      {saveStatus === 'saved' && (
                        <span className="text-sm text-green-600 dark:text-green-400" aria-hidden="true">Saved ✓</span>
                      )}
                      {saveStatus === 'error' && (
                        <span className="text-sm text-red-600 dark:text-red-400" aria-hidden="true">Error saving</span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
