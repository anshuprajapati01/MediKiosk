"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
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
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";
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
  const [step, setStep] = useState<'registration' | 'interview'>('registration');
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [questionnaireId, setQuestionnaireId] = useState<string | null>(null);
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
      setQuestionnaireId(questionnaire.id);
      console.log("Fetched Questions Data:", fetchedQuestions);

      const { data: hospitalData } = await supabase
        .from("hospitals")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      const fallbackHospitalId = '00000000-0000-0000-0000-000000000000';
      const resolvedHospitalId = hospitalData?.id || fallbackHospitalId;
      setHospitalId(resolvedHospitalId);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Auth session error:", sessionError);
      }

      if (session?.user?.id) {
        const { data: patient, error: patientError } = await supabase
          .from("patients")
          .select("id, full_name, dob, gender")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (!patientError && patient) {
          setPatientId(patient.id);
          setFullName(patient.full_name ?? "");
          setDob(patient.dob ?? "");
          setGender(patient.gender ?? "");
          setIsLoading(false);
          return;
        }
      }

      setStep('registration');
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

  async function handleStartInterview(e?: React.FormEvent) {
    e?.preventDefault();

    if (isCreatingPatient) {
      return;
    }

    if (!fullName.trim()) {
      setRegistrationError("Full name is required");
      return;
    }

    if (!dob) {
      setRegistrationError("Date of birth is required");
      return;
    }

    if (!gender) {
      setRegistrationError("Gender is required");
      return;
    }

    if (!hospitalId || !questionnaireId) {
      setRegistrationError("System not ready. Please refresh and try again.");
      return;
    }

    setIsCreatingPatient(true);
    setRegistrationError(null);

    try {
      const supabase = createSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      let resolvedPatientId = patientId;

      if (!resolvedPatientId) {
        const mrn = `MK-${Math.floor(Math.random() * 1000000)}`;

        const { data: patientData, error: patientError } = await supabase
          .from("patients")
          .insert({
            user_id: session?.user?.id || null,
            mrn,
            full_name: fullName.trim(),
            dob,
            gender,
          })
          .select("id")
          .single();

        if (patientError || !patientData) {
          setRegistrationError("Unable to create patient profile. Please try again.");
          setIsCreatingPatient(false);
          return;
        }

        resolvedPatientId = patientData.id;
        setPatientId(resolvedPatientId);
      }

      const { data: existingInterview, error: existingError } = await supabase
        .from("interviews")
        .select("id")
        .eq("patient_id", resolvedPatientId)
        .in("status", ["in_progress", "awaiting_review"])
        .maybeSingle();

      if (existingError) {
        console.error("Error checking existing interview:", existingError);
        setRegistrationError("Unable to check existing interview. Please try again.");
        setIsCreatingPatient(false);
        return;
      }

      if (existingInterview) {
        console.log("Found existing active interview:", existingInterview.id);
        setInterviewId(existingInterview.id);
        setStep('interview');
        setIsCreatingPatient(false);
        return;
      }

      console.log("Attempting to insert new interview for patient:", resolvedPatientId);
      const { data: newInterview, error: createError } = await supabase
        .from("interviews")
        .insert({
          patient_id: resolvedPatientId,
          hospital_id: hospitalId,
          questionnaire_id: questionnaireId,
          status: "in_progress",
        })
        .select("id")
        .single();

      if (createError || !newInterview) {
        console.error("Error creating new interview:", createError);
        setRegistrationError("Unable to start interview. Please try again.");
        setIsCreatingPatient(false);
        return;
      }

      console.log("Created new interview:", newInterview.id);
      setInterviewId(newInterview.id);
      setStep('interview');
      setIsCreatingPatient(false);
    } catch (err) {
      console.error("Registration error:", err);
      setRegistrationError("An unexpected error occurred. Please try again.");
      setIsCreatingPatient(false);
    }
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
      <div className={`relative min-h-screen overflow-hidden ${isDarkMode ? "bg-black" : "bg-slate-50"}`} style={!isDarkMode ? { backgroundImage: `linear-gradient(rgba(248, 250, 252, 0.88), rgba(248, 250, 252, 0.88)), url('https://images.unsplash.com/photo-1581594693702-fbdc51b2763b?q=80&w=2070&auto=format&fit=crop')` } : undefined}>
        {isDarkMode && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
            <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
            <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
          </div>
        )}
        <div className="relative z-10 flex min-h-screen flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className={`h-12 w-12 animate-spin rounded-full border-4 ${isDarkMode ? "border-zinc-700 border-t-indigo-400" : "border-slate-200 border-t-teal-600"}`} />
            <p className={`text-lg ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>Preparing your clinical assessment...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`relative min-h-screen overflow-hidden ${isDarkMode ? "bg-black" : "bg-slate-50"}`} style={!isDarkMode ? { backgroundImage: `linear-gradient(rgba(248, 250, 252, 0.88), rgba(248, 250, 252, 0.88)), url('https://images.unsplash.com/photo-1581594693702-fbdc51b2763b?q=80&w=2070&auto=format&fit=crop')` } : undefined}>
        {isDarkMode && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
            <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
            <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
          </div>
        )}
        <div className="relative z-10 flex min-h-screen flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md px-6">
            <div className={`rounded-2xl border p-8 text-center shadow-2xl backdrop-blur-md ${isDarkMode ? "border-red-500/30 bg-red-500/10" : "border-red-500/30 bg-red-50"}`}>
              <h2 className={`mb-2 text-xl font-semibold ${isDarkMode ? "text-red-200" : "text-red-700"}`}>Something went wrong</h2>
              <p className={`text-base ${isDarkMode ? "text-red-300" : "text-red-700"}`}>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasAnswers = Object.values(answers).some((value) => value.trim().length > 0);
  const displayIndex = Math.min(currentQuestionIndex, Math.max(0, visibleQuestions.length - 1));

  return (
    <div className={`relative min-h-screen overflow-hidden py-10 ${isDarkMode ? "bg-black" : "bg-slate-50"}`} style={!isDarkMode ? { backgroundImage: `linear-gradient(rgba(248, 250, 252, 0.88), rgba(248, 250, 252, 0.88)), url('https://images.unsplash.com/photo-1581594693702-fbdc51b2763b?q=80&w=2070&auto=format&fit=crop')` } : undefined}>
      {isDarkMode && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
          <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
          <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
        </div>
      )}

      <div className="relative z-10 flex w-full justify-center px-6">
        <div className={`w-full max-w-3xl rounded-2xl border p-8 shadow-2xl backdrop-blur-md ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white shadow-slate-200/50"}`}>
          <h1 className={`mb-2 text-center text-4xl font-bold ${isDarkMode ? "bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent" : "text-slate-900"}`}>
            Clinical Interview
          </h1>
          <p className={`mb-8 text-center text-base ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>
            Please answer the following questions to the best of your ability.
          </p>

          {isResuming && (
            <div className="mb-6 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-center text-sm text-indigo-200">
              You have an unfinished assessment. Resuming where you left off.
            </div>
          )}

          <form onSubmit={handleStartInterview} noValidate className="flex flex-col gap-8">
            {step === 'registration' ? (
              <div className="flex flex-col gap-6">
                <h2 className={`text-center text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                  Patient Registration
                </h2>
                <p className={`text-center text-base ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>
                  Please enter your details to begin the clinical interview.
                </p>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="fullName" className={`text-sm font-medium ${isDarkMode ? "text-zinc-300" : "text-slate-700"}`}>
                      Full Name <span className={isDarkMode ? "text-red-400" : "text-red-500"}>*</span>
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={isCreatingPatient || Boolean(patientId)}
                      className={`w-full rounded-xl border px-4 py-3 text-base outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50 ${isDarkMode ? "border-white/10 bg-black/40 text-white placeholder-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" : "border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500"}`}
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="dob" className={`text-sm font-medium ${isDarkMode ? "text-zinc-300" : "text-slate-700"}`}>
                      Date of Birth <span className={isDarkMode ? "text-red-400" : "text-red-500"}>*</span>
                    </label>
                    <input
                      id="dob"
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      disabled={isCreatingPatient || Boolean(patientId)}
                      className={`w-full rounded-xl border px-4 py-3 text-base outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50 ${isDarkMode ? "border-white/10 bg-black/40 text-white placeholder-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" : "border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500"}`}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className={`text-sm font-medium ${isDarkMode ? "text-zinc-300" : "text-slate-700"}`}>
                      Gender <span className={isDarkMode ? "text-red-400" : "text-red-500"}>*</span>
                    </label>
                    <div className="flex gap-3">
                      {[
                        { value: 'male', label: 'Male' },
                        { value: 'female', label: 'Female' },
                        { value: 'other', label: 'Other' },
                      ].map((option) => {
                        const isActive = gender === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setGender(option.value)}
                            disabled={isCreatingPatient || Boolean(patientId)}
                            className={`flex-1 rounded-full border py-2.5 text-sm font-semibold transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                              isActive
                                ? isDarkMode
                                  ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                                  : 'bg-teal-600 text-white border-teal-600'
                                : isDarkMode
                                  ? 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {registrationError && (
                  <div className={`rounded-xl border p-4 text-sm ${isDarkMode ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-red-500/30 bg-red-50 text-red-700"}`}>
                    {registrationError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isCreatingPatient}
                  className={`flex min-h-[50px] w-full items-center justify-center rounded-full px-6 py-3 text-base font-semibold text-white shadow-md transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${isDarkMode ? "bg-gradient-to-r from-indigo-500 to-purple-600 shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:from-indigo-400 hover:to-purple-500" : "bg-teal-600 hover:bg-teal-700"}`}
                >
                  {isCreatingPatient
                    ? patientId
                      ? "Starting..."
                      : "Creating..."
                    : patientId
                      ? "Confirm & Start Interview"
                      : "Start Interview"}
                </button>
              </div>
            ) : showUploadStep ? (
              <div className="flex flex-col gap-6">
                <h2 className={`text-center text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                  Upload Medical Documents
                </h2>
                <p className={`text-center text-base ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>
                  You may optionally upload supporting medical documents (PDF, PNG, JPEG) up to 10MB each.
                </p>

                <label
                  htmlFor="medical-document-upload"
                  className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors focus:ring-2 focus:outline-none ${isDarkMode ? "focus:ring-indigo-400" : "focus:ring-teal-400"} ${
                    isUploading
                      ? isDarkMode ? 'border-zinc-600 bg-zinc-800/50' : 'border-slate-300 bg-slate-50'
                      : isDarkMode ? 'border-white/20 bg-white/5 hover:border-indigo-400 hover:bg-white/10' : 'border-slate-300 bg-slate-50 hover:border-teal-400 hover:bg-teal-50'
                  }`}
                >
                  <span className="text-4xl">📄</span>
                  <span className={`text-base font-semibold ${isDarkMode ? "text-white" : "text-slate-700"}`}>
                    {isUploading ? 'Uploading...' : 'Click to choose files'}
                  </span>
                  <span className={`text-sm ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>
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
                  <div className={`rounded-xl border p-4 text-sm ${isDarkMode ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-red-500/30 bg-red-50 text-red-700"}`}>
                    {uploadError}
                  </div>
                )}

                {documents.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h3 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                      Attached Documents ({documents.length})
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {documents.map((doc, index) => (
                        <li
                          key={doc.path}
                          className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}
                        >
                          <div className="flex flex-col">
                            <span className={`truncate text-base font-medium ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                              {doc.name}
                            </span>
                            <span className={`text-sm ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>
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
                              className={`text-sm font-medium mr-4 ${isDarkMode ? "text-indigo-400 hover:text-indigo-300" : "text-teal-600 hover:text-teal-700"}`}
                            >
                              View
                            </a>
                            <button
                              type="button"
                              onClick={() => handleRemoveDocument(index)}
                              className={`flex min-h-[44px] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus:ring-2 focus:outline-none ${isDarkMode ? "border-white/10 bg-white/5 text-white hover:border-red-500/30 hover:bg-red-500/10 focus:ring-red-400" : "border-slate-200 bg-white text-slate-700 hover:border-red-300 hover:bg-red-50 focus:ring-red-400"}`}
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
                    className={`flex min-h-[50px] w-full items-center justify-center rounded-full border px-6 py-3 text-base font-semibold transition-all focus:outline-none sm:w-auto ${isDarkMode ? "border-white/10 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueToReview}
                    disabled={isUploading}
                    className={`flex min-h-[50px] w-full items-center justify-center rounded-full px-6 py-3 text-base font-semibold text-white shadow-md transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${isDarkMode ? "bg-gradient-to-r from-indigo-500 to-purple-600 shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:from-indigo-400 hover:to-purple-500" : "bg-teal-600 hover:bg-teal-700"}`}
                  >
                    Continue to Review
                  </button>
                </div>
              </div>
            ) : isReviewMode ? (
              <div className="flex flex-col gap-6">
                <h2 className={`text-center text-2xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                  Review Your Answers
                </h2>
                <p className={`text-center text-base ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>
                  Please review your responses before submitting.
                </p>

                <div className="flex flex-col gap-4">
                  {visibleQuestions.map((question, index) => {
                    const answer = answers[question.id];
                    const isEmpty = !answer || answer.trim().length === 0;

                    return (
                      <div
                        key={question.id}
                        className={`rounded-xl border p-5 transition-colors ${
                          isEmpty
                            ? isDarkMode ? 'border-amber-500/30 bg-amber-500/10' : 'border-amber-200 bg-amber-50'
                            : isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            {getSectionTitle(question) && (
                              <div className="mb-4">
                                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${isDarkMode ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/30" : "text-teal-700 bg-teal-50 border border-teal-200"}`}>
                                  {getSectionTitle(question)}
                                </span>
                              </div>
                            )}
                            {question.section_id === '60f7a39e-754e-440f-99b6-eebfe01ebecd' && (
                              <div className="mb-4">
                                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${isDarkMode ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/30" : "text-teal-700 bg-teal-50 border border-teal-200"}`}>
                                  AYUSH Lifestyle Assessment
                                </span>
                              </div>
                            )}
                            <p className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                              <span className={`mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                                isEmpty
                                  ? isDarkMode ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'
                                  : isDarkMode ? 'bg-gradient-to-br from-indigo-500 to-emerald-500 text-white' : 'bg-teal-600 text-white'
                              }`}>
                                {index + 1}
                              </span>
                              {question.text}
                            </p>
                            <p className={`mt-2 text-base ${isEmpty ? (isDarkMode ? 'text-zinc-500 italic' : 'text-slate-400 italic') : (isDarkMode ? 'text-zinc-300' : 'text-slate-600')}`}>
                              {isEmpty ? 'No answer provided' : answer}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentQuestionIndex(index);
                              setIsReviewMode(false);
                            }}
                            className={`flex min-h-[50px] w-auto items-center justify-center rounded-full border px-5 py-2.5 text-sm font-semibold transition-all focus:outline-none ${isDarkMode ? "border-white/10 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {documents.length > 0 && (
                  <div className={`flex flex-col gap-4 rounded-xl border p-6 ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
                    <h3 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                      Uploaded Medical Documents
                    </h3>
                    <p className={`text-base ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>
                      The following documents are attached to your case.
                    </p>
                    <ul className="flex flex-col gap-2">
                      {documents.map((doc) => (
                        <li
                          key={doc.path}
                          className={`flex items-center justify-between gap-3 rounded-lg border p-4 ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}
                        >
                          <div className="flex flex-col">
                            <span className={`truncate text-base font-medium ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                              {doc.name}
                            </span>
                            <span className={`text-sm ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>
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
                              className={`text-sm font-medium mr-4 ${isDarkMode ? "text-indigo-400 hover:text-indigo-300" : "text-teal-600 hover:text-teal-700"}`}
                            >
                              View
                            </a>
                            <span className={`text-sm font-semibold ${isDarkMode ? "text-emerald-400" : "text-teal-600"}`}>
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
                    className={`flex min-h-[50px] w-full items-center justify-center rounded-full border px-6 py-3 text-base font-semibold transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${isDarkMode ? "border-white/10 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!hasAnswers || isSubmitting}
                    className={`flex min-h-[50px] w-full items-center justify-center rounded-full px-6 py-3 text-base font-semibold text-white shadow-md transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${isDarkMode ? "bg-gradient-to-r from-indigo-500 to-purple-600 shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:from-indigo-400 hover:to-purple-500" : "bg-teal-600 hover:bg-teal-700"}`}
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
                      <div className={`flex items-center justify-between text-base font-medium ${isDarkMode ? "text-zinc-300" : "text-slate-700"}`}>
                        <span>
                          Question {displayIndex + 1} of {visibleQuestions.length}
                        </span>
                        <span>{progressPercentage}%</span>
                      </div>
                      <div className={`h-3 w-full overflow-hidden rounded-full ${isDarkMode ? "bg-white/5" : "bg-slate-200"}`} role="progressbar" aria-valuenow={progressPercentage} aria-valuemin={0} aria-valuemax={100} aria-label="Question progress">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ease-out ${isDarkMode ? "bg-gradient-to-r from-indigo-500 to-emerald-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" : "bg-teal-600"}`}
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
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${isDarkMode ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/30" : "text-teal-700 bg-teal-50 border border-teal-200"}`}>
                            {getSectionTitle(question)}
                          </span>
                        </div>
                      )}
                      {question.section_id === '60f7a39e-754e-440f-99b6-eebfe01ebecd' && (
                        <div className="mb-4">
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${isDarkMode ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/30" : "text-teal-700 bg-teal-50 border border-teal-200"}`}>
                            AYUSH Lifestyle Assessment
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <label
                          htmlFor={question.id}
                          className={`flex-1 text-xl font-medium ${isDarkMode ? "text-white" : "text-slate-900"}`}
                        >
                          <span className={`mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                            isDarkMode
                              ? 'bg-gradient-to-br from-indigo-500 to-emerald-500 text-white'
                              : 'bg-teal-600 text-white'
                          }`}>
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
                          className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${isDarkMode ? "border-white/10 bg-white/5 text-white hover:border-indigo-400 hover:bg-indigo-500/10" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
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
                          className={`w-full rounded-xl border p-4 transition-all focus:outline-none ${isDarkMode ? "border-white/10 bg-black/40 text-white placeholder-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" : "border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500"}`}
                        />
                      )}

                      {question.type === "number" && (
                        <input
                          id={question.id}
                          type="number"
                          value={answers[question.id] || ""}
                          onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                          className={`w-full rounded-xl border p-4 transition-all focus:outline-none ${isDarkMode ? "border-white/10 bg-black/40 text-white placeholder-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" : "border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500"}`}
                        />
                      )}

                      {typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition) && (
                        <button
                          type="button"
                          onClick={toggleListening}
                          className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition-all hover:bg-white/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${isDarkMode ? "border-white/10 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                        >
                          {isListening ? '🔴 Listening...' : '🎤 Speak'}
                        </button>
                      )}

                      {question.type !== "text" && question.type !== "number" && (
                        <p className={`text-sm ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>
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
                      className={`flex min-h-[50px] w-full items-center justify-center rounded-full border px-6 py-3 text-base font-semibold transition-all focus:outline-none sm:w-auto ${isDarkMode ? "border-white/10 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      Back
                    </button>
                  )}

                  {currentQuestionIndex < visibleQuestions.length - 1 ? (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleNext}
                        className={`flex min-h-[50px] w-full items-center justify-center rounded-full px-6 py-3 text-base font-semibold text-white shadow-md transition-all focus:outline-none sm:w-auto ${isDarkMode ? "bg-gradient-to-r from-indigo-500 to-purple-600 shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:from-indigo-400 hover:to-purple-500" : "bg-teal-600 hover:bg-teal-700"}`}
                      >
                        Next
                      </button>
                      <span aria-live="polite" className="sr-only">
                        {saveStatus === 'saving' && 'Saving'}
                        {saveStatus === 'saved' && 'Saved'}
                        {saveStatus === 'error' && 'Error saving'}
                      </span>
                      <span className={`text-sm ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`} aria-hidden="true">
                        {saveStatus === 'saving' && 'Saving...'}
                        {saveStatus === 'saved' && 'Saved ✓'}
                        {saveStatus === 'error' && 'Error saving'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleReview}
                        className={`flex min-h-[50px] w-full items-center justify-center rounded-full px-6 py-3 text-base font-semibold text-white shadow-md transition-all focus:outline-none sm:w-auto ${isDarkMode ? "bg-gradient-to-r from-indigo-500 to-purple-600 shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:from-indigo-400 hover:to-purple-500" : "bg-teal-600 hover:bg-teal-700"}`}
                      >
                        Review Answers
                      </button>
                      <span aria-live="polite" className="sr-only">
                        {saveStatus === 'saving' && 'Saving'}
                        {saveStatus === 'saved' && 'Saved'}
                        {saveStatus === 'error' && 'Error saving'}
                      </span>
                      <span className={`text-sm ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`} aria-hidden="true">
                        {saveStatus === 'saving' && 'Saving...'}
                        {saveStatus === 'saved' && 'Saved ✓'}
                        {saveStatus === 'error' && 'Error saving'}
                      </span>
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
