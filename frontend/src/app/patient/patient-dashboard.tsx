"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

type PatientProfile = {
  id: string;
  full_name: string;
  mrn: string;
};

type CaseRecord = {
  id: string;
  status: string;
  created_at: string;
};

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  awaiting_review: {
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/30",
  },
  under_review: {
    bg: "bg-blue-500/10",
    text: "text-blue-300",
    border: "border-blue-500/30",
  },
  in_progress: {
    bg: "bg-indigo-500/10",
    text: "text-indigo-300",
    border: "border-indigo-500/30",
  },
  completed: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    border: "border-emerald-500/30",
  },
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PatientDashboard() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseClient();

    async function loadDashboard() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.email) {
        router.push("/patient/login");
        return;
      }

      setUserEmail(session.user.email);

      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, mrn")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        setPatient(null);
      } else if (data) {
        setPatient(data as PatientProfile);
      } else {
        setPatient(null);
        router.push("/patient/onboarding");
        return;
      }

      setIsLoading(false);
    }

    loadDashboard();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user?.email) {
        setUserEmail(null);
        setPatient(null);
        setCases([]);
        router.push("/patient/login");
      } else {
        setUserEmail(session.user.email);
        supabase
          .from("patients")
          .select("id, full_name, mrn")
          .eq("user_id", session.user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setPatient(data as PatientProfile);
            } else {
              setPatient(null);
              router.push("/patient/onboarding");
            }
          });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    const supabase = createSupabaseClient();

    async function loadCases() {
      if (!patient?.full_name) return;

      const { data: casesData, error: casesError } = await supabase
        .from("interviews")
        .select("id, status, created_at")
        .eq("patient_id", patient.id)
        .order("created_at", { ascending: false });

      if (casesError) {
        console.error("Error loading cases:", casesError);
        setCases([]);
        return;
      }

      setCases((casesData || []) as CaseRecord[]);
    }

    loadCases();
  }, [patient]);

  async function handleLogout() {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    router.push("/patient/login");
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
            <p className="text-lg text-zinc-400">Loading your dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!userEmail || !patient) {
    return null;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
      </div>

      <div className="relative z-10 flex w-full justify-center px-6">
        <div className="w-full max-w-3xl flex flex-col gap-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
              Patient Dashboard
            </h1>
            <p className="mt-2 text-base text-zinc-400">
              Manage your clinical intake and account settings
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md">
            <h3 className="mb-6 text-lg font-semibold text-white">Profile Details</h3>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                <span className="text-sm text-zinc-400">Full Name</span>
                <span className="text-sm font-medium text-white">{patient.full_name}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                <span className="text-sm text-zinc-400">Email</span>
                <span className="text-sm font-medium text-white">{userEmail}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                <span className="text-sm text-zinc-400">MRN</span>
                <span className="text-sm font-medium text-white">{patient.mrn}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">My Clinical Cases</h3>
              {cases.length > 0 && (
                <span className="text-xs font-medium text-zinc-400">
                  {cases.length} {cases.length === 1 ? 'case' : 'cases'}
                </span>
              )}
            </div>

            {cases.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
                <p className="text-sm text-zinc-400">
                  No past cases found. Start a new intake to report your symptoms.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {cases.map((item) => {
                  const statusStyle =
                    STATUS_STYLES[item.status] || STATUS_STYLES.in_progress;
                  const shortId = item.id.slice(0, 6);

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-5 py-4"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-white">
                          {formatDate(item.created_at)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          ID: {shortId}
                        </span>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                      >
                        {item.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => router.push("/patient/interview")}
              className="flex min-h-[50px] w-full items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-base font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all hover:from-indigo-400 hover:to-purple-500 focus:outline-none sm:w-auto"
            >
              Start New Intake
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-h-[50px] w-full items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-base font-semibold text-zinc-300 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-200 focus:outline-none sm:w-auto"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
