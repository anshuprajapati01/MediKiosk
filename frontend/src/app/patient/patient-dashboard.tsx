"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

type PatientProfile = {
  full_name: string;
  mrn: string;
};

export default function PatientDashboard() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientProfile | null>(null);
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
        .select("full_name, mrn")
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
        router.push("/patient/login");
      } else {
        setUserEmail(session.user.email);
        supabase
          .from("patients")
          .select("full_name, mrn")
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

  async function handleLogout() {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    router.push("/patient/login");
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!userEmail || !patient) {
    return null;
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md px-6 py-10">
        <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="mb-2 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Welcome to MediKiosk
          </h1>
          <p className="mb-1 text-center text-sm text-zinc-600 dark:text-zinc-400">
            {patient.full_name}
          </p>
          <p className="mb-1 text-center text-sm text-zinc-600 dark:text-zinc-400">
            {userEmail}
          </p>
          <p className="mb-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
            MRN: {patient.mrn}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
