"use client";

import { useEffect, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";

type PatientInfo = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  gender?: string | null;
  dob?: string | null;
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

function getPatientName(patient: PatientInfo | null | undefined): string {
  if (!patient) return "Unknown Patient";
  if (patient.first_name || patient.last_name) {
    return `${patient.first_name || ""} ${patient.last_name || ""}`.trim();
  }
  if (patient.name) return patient.name;
  if (patient.full_name) return patient.full_name;
  return "Unknown Patient";
}

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

function formatWaitingTime(createdAt: string): string {
  const now = new Date();
  const submitted = new Date(createdAt);
  const diffMs = now.getTime() - submitted.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h ago`;
}

export default function TriagePage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [selectedSeverity, setSelectedSeverity] = useState<string>("Urgent");
  const [selectedDoctor, setSelectedDoctor] = useState<string>("any");
  const [routeNotes, setRouteNotes] = useState<string>("");
  const [isRouting, setIsRouting] = useState<boolean>(false);
  const [routingError, setRoutingError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCases() {
      try {
        const supabase = createSupabaseClient();

        const { data: interviewsData, error: interviewsError } = await supabase
          .from("interviews")
          .select("*")
          .eq("status", "awaiting_review")
          .order("created_at", { ascending: true });

        if (interviewsError) {
          setError("Unable to load triage queue. Please try again later.");
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
      } catch {
        setError("An unexpected error occurred. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    }

    loadCases();
  }, []);

  const handleAssess = (caseItem: Case) => {
    setSelectedCase(caseItem);
    setSelectedSeverity("Urgent");
    setSelectedDoctor("any");
    setRouteNotes("");
    setRoutingError(null);
  };

  const handleCloseModal = () => {
    setSelectedCase(null);
    setRoutingError(null);
  };

  async function handleRouteCase() {
    if (!selectedCase || isRouting) return;
    setIsRouting(true);
    setRoutingError(null);

    try {
      const supabase = createSupabaseClient();
      const { error } = await supabase
        .from("interviews")
        .update({ status: "under_review" })
        .eq("id", selectedCase.id);

      if (error) {
        throw new Error(error.message);
      }

      setCases((prev) => prev.filter((c) => c.id !== selectedCase.id));
      handleCloseModal();
    } catch (err) {
      setRoutingError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while routing the case.",
      );
    } finally {
      setIsRouting(false);
    }
  }

  useEffect(() => {
    if (!selectedCase) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedCase(null);
        setRoutingError(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedCase]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading triage queue...</p>
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

  return (
    <div className="flex flex-1 items-start justify-center bg-zinc-50 py-10 dark:bg-black">
      <div className="w-full max-w-6xl px-6">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Triage Command Center</h1>
              <p className="mt-1 text-base text-zinc-600 dark:text-zinc-400">
                Monitor incoming cases, assess severity, and route to doctors.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
              {cases.length} in queue
            </span>
          </div>

          {cases.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center shadow-2xl backdrop-blur-md dark:border-white/5 dark:bg-white/5">
              <p className="text-lg text-zinc-600 dark:text-zinc-400">No cases awaiting triage.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {cases.map((c) => {
                const patient = c.patients;
                const patientName = getPatientName(patient);
                const age = calculateAge(patient?.dob ?? null);
                const waiting = formatWaitingTime(c.created_at);

                return (
                  <div
                    key={c.id}
                    className="flex h-full flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md transition hover:border-indigo-500/40 hover:bg-slate-800/40 dark:border-white/5 dark:bg-white/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">{patientName}</h3>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {age !== null ? `${age} years` : "Age N/A"}
                          {patient?.gender ? ` · ${patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="inline-flex shrink-0 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                          Awaiting Triage
                        </span>
                        <span className="inline-flex shrink-0 items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                          Priority Pending
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2.5 rounded-xl border border-white/5 bg-white/5 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Submitted</span>
                        <span className="text-sm font-medium text-gray-200">{waiting}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">MRN</span>
                        <span className="font-mono text-xs text-gray-200">{patient?.mrn || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Case ID</span>
                        <span className="truncate max-w-[60%] text-xs font-mono text-gray-200">{c.id}</span>
                      </div>
                    </div>

                    <div className="mt-auto border-t border-white/5 pt-4">
                      <button
                        type="button"
                        onClick={() => handleAssess(c)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.35)] transition-transform hover:scale-[1.01] hover:shadow-[0_0_25px_rgba(99,102,241,0.45)] focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Assess &amp; Route
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCloseModal} />
          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Route Patient Case</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {getPatientName(selectedCase.patients)} · MRN: {selectedCase.patients?.mrn || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:text-white hover:border-white/20 focus:ring-2 focus:ring-white/20 focus:outline-none"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Severity
                </label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {["Critical", "Urgent", "Routine"].map((severity) => {
                    const isSelected = selectedSeverity === severity;
                    const activeClasses =
                      severity === "Critical"
                        ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                        : severity === "Urgent"
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                          : "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
                    return (
                      <label
                        key={severity}
                        className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                          isSelected ? activeClasses : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20"
                        }`}
                      >
                        <input
                          type="radio"
                          name="severity"
                          value={severity}
                          checked={isSelected}
                          onChange={(e) => setSelectedSeverity(e.target.value)}
                          className="sr-only"
                        />
                        {severity}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="route-doctor" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Assign Doctor / Department
                </label>
                <select
                  id="route-doctor"
                  value={selectedDoctor}
                  onChange={(e) => setSelectedDoctor(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="any">Any Available</option>
                  <option value="cardiology">Dr. Sharma - Cardiology</option>
                  <option value="general">Dr. Gupta - General</option>
                  <option value="neurology">Dr. Patel - Neurology</option>
                </select>
              </div>

              <div>
                <label htmlFor="route-notes" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Triage Notes
                </label>
                <textarea
                  id="route-notes"
                  value={routeNotes}
                  onChange={(e) => setRouteNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Patient needs ECG immediately..."
                  className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {routingError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-sm text-red-400">{routingError}</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isRouting}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white focus:ring-2 focus:ring-white/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRouteCase}
                  disabled={isRouting}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.35)] transition-transform hover:scale-[1.01] hover:shadow-[0_0_25px_rgba(99,102,241,0.45)] focus:ring-2 focus:ring-indigo-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRouting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Routing...
                    </>
                  ) : (
                    "Confirm Routing"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
