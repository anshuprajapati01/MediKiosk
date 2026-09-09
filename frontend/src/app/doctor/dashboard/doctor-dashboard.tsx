"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

type PatientInfo = {
  first_name?: string | null;
  last_name?: string | null;
  gender: string | null;
  dob: string | null;
  name?: string | null;
  full_name?: string | null;
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
  const [cases, setCases] = useState<Case[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseClient();

    async function loadCases() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        router.push("/patient/login");
        return;
      }

      const { data: interviewsData, error: interviewsError } = await supabase
        .from("interviews")
        .select("*")
        .in("status", ["awaiting_review", "completed"])
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

      console.log("Fetched Patients Data:", patientsData);

      const combinedData = (interviewsData ?? []).map((interview) => ({
        ...interview,
        patients:
          patientsData?.find((p) => p.id === interview.patient_id) ?? null,
      }));

      setCases(combinedData as Case[]);
      setIsLoading(false);
    }

    loadCases();
  }, [router]);

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

  function handleReviewCase(interviewId: string) {
    console.log("Review case:", interviewId);
    router.push(`/doctor/review/${interviewId}`);
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading case queue...</p>
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
      <div className="w-full max-w-5xl px-6">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md dark:border-white/5 dark:bg-white/5">
          <h1 className="mb-2 text-center text-4xl font-bold text-zinc-900 dark:text-zinc-50">
            Doctor Dashboard - Case Queue
          </h1>
          <p className="mb-8 text-center text-base text-zinc-600 dark:text-zinc-400">
            Review patient cases awaiting your attention.
          </p>

          {cases.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center shadow-2xl backdrop-blur-md dark:border-white/5 dark:bg-white/5">
              <p className="text-lg text-zinc-600 dark:text-zinc-400">No pending cases</p>
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
                    className="flex flex-col gap-4 rounded-xl border border-white/10 border-l-4 border-l-emerald-500 bg-gray-800/50 p-6 transition-all duration-300 hover:bg-gray-800 hover:shadow-xl"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-xl font-bold tracking-tight text-white">
                          {fullName}
                        </h3>
                        <p className="text-sm text-gray-400">
                          {patient?.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : "Gender N/A"}
                          {age !== null ? `, Age ${age}` : ""}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${
                          caseItem.status === "awaiting_review"
                            ? "border-amber-500/30 bg-amber-500/20 text-amber-300"
                            : "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        {caseItem.status === "awaiting_review" ? "Awaiting Review" : "Completed"}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1 text-sm text-gray-400">
                      <span>Submitted: {formatDate(caseItem.updated_at)}</span>
                      <span>Case ID: {caseItem.id}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleReviewCase(caseItem.id)}
                      className="mt-auto w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2.5 text-lg font-semibold text-white shadow-md transition-all duration-300 hover:from-emerald-500 hover:to-teal-400 hover:shadow-lg focus:ring-2 focus:ring-emerald-400 focus:outline-none"
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
  );
}