"use client";

import { useEffect, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";

type PatientInfo = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  full_name?: string | null;
  gender?: string | null;
  dob?: string | null;
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

type SeverityTier = {
  label: string;
  bg: string;
  text: string;
  border: string;
  shadow: string;
};

const SEVERITY_OPTIONS: SeverityTier[] = [
  {
    label: "Critical - Red",
    bg: "bg-rose-500/15",
    text: "text-rose-300",
    border: "border-rose-500/40",
    shadow: "shadow-[0_0_15px_rgba(244,63,94,0.25)]",
  },
  {
    label: "High - Amber",
    bg: "bg-amber-500/15",
    text: "text-amber-300",
    border: "border-amber-500/40",
    shadow: "shadow-[0_0_15px_rgba(245,158,11,0.25)]",
  },
  {
    label: "Routine - Green",
    bg: "bg-emerald-500/15",
    text: "text-emerald-300",
    border: "border-emerald-500/40",
    shadow: "shadow-[0_0_15px_rgba(16,185,129,0.25)]",
  },
];

function getPatientName(patient: PatientInfo | null | undefined): string {
  if (!patient) return "Unknown Patient";
  if (patient.first_name || patient.last_name) {
    return `${patient.first_name || ""} ${patient.last_name || ""}`.trim();
  }
  if (patient.full_name) return patient.full_name;
  if (patient.name) return patient.name;
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMockSeverity(status: string): SeverityTier {
  if (status === "awaiting_review") {
    const index = Math.floor(Math.random() * SEVERITY_OPTIONS.length);
    return SEVERITY_OPTIONS[index];
  }
  if (status === "under_review") {
    return SEVERITY_OPTIONS[1];
  }
  return SEVERITY_OPTIONS[2];
}

export default function TriagePage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routingIds, setRoutingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadCases() {
      try {
        const supabase = createSupabaseClient();

        const { data: interviewsData, error: interviewsError } = await supabase
          .from("interviews")
          .select("*, patients(*)")
          .eq("status", "awaiting_review")
          .order("created_at", { ascending: false });

        if (interviewsError) {
          setError("Unable to load triage queue. Please try again later.");
          setIsLoading(false);
          return;
        }

        setCases((interviewsData || []) as Case[]);
      } catch {
        setError("An unexpected error occurred. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    }

    loadCases();
  }, []);

  async function handleRouteToDoctor(caseId: string) {
    const supabase = createSupabaseClient();
    const { error } = await supabase
      .from("interviews")
      .update({ status: "under_review" })
      .eq("id", caseId);

    if (error) {
      console.error("Error routing case:", error);
      return;
    }

    setRoutingIds((prev) => new Set(prev).add(caseId));
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, status: "under_review" } : c))
    );
  }

  if (isLoading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-black">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
          <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
          <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
        </div>
        <div className="relative z-10 flex min-h-screen flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-indigo-400" />
            <p className="text-lg text-zinc-400">Loading triage queue...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-black">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
          <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
          <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
        </div>
        <div className="relative z-10 flex min-h-screen flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md px-6">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center shadow-2xl backdrop-blur-md">
              <h2 className="mb-2 text-xl font-semibold text-red-200">Something went wrong</h2>
              <p className="text-base text-red-300">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
      </div>

      <div className="relative z-10 flex w-full justify-center px-6">
        <div className="w-full max-w-6xl">
          <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                Triage Command Center
              </h1>
              <p className="mt-2 text-base text-zinc-400">
                Live AI Severity Assessment &amp; Routing Queue
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
              {cases.length} {cases.length === 1 ? 'case' : 'cases'} in queue
            </span>
          </div>

          {cases.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center shadow-2xl backdrop-blur-md">
              <p className="text-base text-zinc-400">No active cases in the triage queue.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {cases.map((c) => {
                const patient = c.patients;
                const patientName = getPatientName(patient);
                const age = calculateAge(patient?.dob ?? null);
                const submitted = formatDateTime(c.created_at);
                const severity = getMockSeverity(c.status);

                return (
                  <div
                    key={c.id}
                    className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md transition hover:border-indigo-500/40 hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.35)]">
                        {patientName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-base font-semibold text-white">{patientName}</span>
                        <span className="text-sm text-zinc-400">
                          {age !== null ? `${age} years` : "Age N/A"}
                          {patient?.gender ? ` · ${patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)}` : ""}
                        </span>
                        <span className="text-xs text-zinc-500">MRN: {patient?.mrn || "—"}</span>
                        <span className="text-xs text-zinc-500">Submitted: {submitted}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${severity.bg} ${severity.text} ${severity.border} ${severity.shadow}`}>
                        {severity.label}
                      </span>
                      {routingIds.has(c.id) || c.status !== "awaiting_review" ? (
                        <span className="inline-flex items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-300">
                          Routed to Doctor ✔
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRouteToDoctor(c.id)}
                          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all hover:from-indigo-400 hover:to-purple-500 focus:outline-none"
                        >
                          Route to Doctor
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
