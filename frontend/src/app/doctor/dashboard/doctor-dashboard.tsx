"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createSupabaseClient } from "@/lib/supabase/client";

type PatientInfo = {
  first_name?: string | null;
  last_name?: string | null;
  gender: string | null;
  dob: string | null;
  name?: string | null;
  full_name?: string | null;
  mrn?: string | null;
};

type Case = {
  id: string;
  patient_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  patients: PatientInfo | null;
};

export default function DoctorDashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";
  const [cases, setCases] = useState<Case[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseClient();

    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        router.replace("/doctor/login");
        return;
      }

      setIsAuthChecking(false);
    }

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/doctor/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (isAuthChecking) return;

    async function loadCases() {
      const supabase = createSupabaseClient();

      const { data: interviewsData, error: interviewsError } = await supabase
        .from("interviews")
        .select("*, patients(*)")
        .eq("status", "under_review")
        .order("updated_at", { ascending: false });

      if (interviewsError) {
        setError("Unable to load case queue. Please try again later.");
        setIsLoading(false);
        return;
      }

      const patientIds = Array.from(
        new Set(
          (interviewsData ?? []).map((i) => i.patient_id).filter(Boolean)
        )
      );

      const { data: patientsData, error: patientsError } = patientIds.length
        ? await supabase
            .from("patients")
            .select("*")
            .in("id", patientIds)
        : { data: null, error: null };

      if (patientsError) {
        setError("Unable to load patient details. Please try again later.");
        setIsLoading(false);
        return;
      }

      const combinedData = (interviewsData ?? []).map((interview) => ({
        ...interview,
        patients:
          patientsData?.find((p) => p.id === interview.patient_id) ?? null,
      }));

      setCases(combinedData as Case[]);
      setIsLoading(false);
    }

    loadCases();
  }, [isAuthChecking]);

  function calculateAge(dob: string | null): number | null {
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

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  async function handleLogout() {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/doctor/login");
  }

  function handleReviewCase(interviewId: string) {
    router.push(`/doctor/review/${interviewId}`);
  }

  if (isAuthChecking || isLoading) {
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
                ? "border-zinc-700 border-t-indigo-400"
                : "border-slate-300 border-t-teal-600"
            }`}
          />
          <p
            className={`text-lg ${
              isDarkMode ? "text-zinc-400" : "text-slate-600"
            }`}
          >
            Loading case queue...
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

  return (
    <div
      className={`flex min-h-screen flex-col ${
        isDarkMode ? "bg-black" : "bg-slate-50"
      }`}
    >
      <header
        className={`flex items-center justify-between px-6 py-4 ${
          isDarkMode
            ? "border-b border-white/5 bg-white/5 backdrop-blur-xl"
            : "border-b border-slate-200 bg-white"
        }`}
      >
        <div className="flex items-center gap-3">
          <h1
            className={`text-xl font-bold ${
              isDarkMode ? "text-zinc-50" : "text-slate-800"
            }`}
          >
            Doctor Dashboard
          </h1>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              isDarkMode
                ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                : "border-teal-200 bg-teal-50 text-teal-700"
            }`}
          >
            Case Queue
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition hover:border-opacity-30 focus:ring-2 focus:outline-none ${
            isDarkMode
              ? "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white focus:ring-white/20"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900 focus:ring-slate-300"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
          Logout
        </button>
      </header>

      <main className="flex flex-1 items-start justify-center py-10">
        <div className="w-full max-w-5xl px-6">
          <div
            className={`relative overflow-hidden rounded-2xl border p-8 shadow-2xl backdrop-blur-md ${
              isDarkMode
                ? "border-white/10 bg-white/5"
                : "border-slate-200 bg-white shadow-lg"
            }`}
          >
            {isDarkMode && (
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
            )}
            <div className="relative">
              <h2
                className={`mb-2 text-center text-2xl font-bold ${
                  isDarkMode ? "text-zinc-50" : "text-slate-900"
                }`}
              >
                Review patient cases awaiting your attention.
              </h2>
              <p
                className={`mb-8 text-center text-base ${
                  isDarkMode ? "text-zinc-400" : "text-slate-600"
                }`}
              >
                {cases.length} {cases.length === 1 ? "case" : "cases"} pending review
              </p>

              {cases.length === 0 ? (
                <div
                  className={`rounded-xl border p-12 text-center shadow-sm ${
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
                    No pending cases
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {cases.map((caseItem) => {
                    const patient = caseItem.patients;
                    const age = calculateAge(patient?.dob ?? null);

                    const p = caseItem.patients;
                    let fullName = "Unknown Patient";
                    if (p) {
                      if (p.first_name || p.last_name) {
                        fullName = `${p.first_name || ""} ${p.last_name || ""}`.trim();
                      } else if (p.name) {
                        fullName = p.name;
                      } else if (p.full_name) {
                        fullName = p.full_name;
                      }
                    }

                    return (
                      <div
                        key={caseItem.id}
                        className={`flex flex-col gap-4 rounded-xl border p-6 transition-all duration-300 ${
                          isDarkMode
                            ? "border-white/10 bg-[#111] hover:bg-white/5 hover:shadow-xl"
                            : "border-slate-200 bg-white shadow-md hover:shadow-lg"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex flex-col gap-1">
                            <h3
                              className={`text-xl font-bold tracking-tight ${
                                isDarkMode ? "text-white" : "text-slate-900"
                              }`}
                            >
                              {fullName}
                            </h3>
                            <p
                              className={`text-sm ${
                                isDarkMode ? "text-gray-400" : "text-slate-500"
                              }`}
                            >
                              {patient?.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : "Gender N/A"}
                              {age !== null ? `, Age ${age}` : ""}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${
                              caseItem.status === "under_review"
                                ? isDarkMode
                                  ? "border-indigo-500/30 bg-indigo-500/20 text-indigo-300"
                                  : "bg-amber-100 text-amber-700 border-amber-200"
                                : isDarkMode
                                  ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                                  : "bg-emerald-100 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {caseItem.status === "under_review" ? "Under Review" : "Completed"}
                          </span>
                        </div>

                        <div
                          className={`flex flex-col gap-1 text-sm ${
                            isDarkMode ? "text-gray-400" : "text-slate-500"
                          }`}
                        >
                          <span>Submitted: {formatDate(caseItem.updated_at)}</span>
                          <span>MRN: {patient?.mrn || "—"}</span>
                          <span>Case ID: {caseItem.id}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleReviewCase(caseItem.id)}
                          className={`mt-auto w-full rounded-lg px-4 py-2.5 text-lg font-semibold text-white transition-all shadow-sm focus:ring-2 focus:outline-none ${
                            isDarkMode
                              ? "bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 hover:shadow-lg focus:ring-emerald-400"
                              : "bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"
                          }`}
                        >
                          Review Case
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
