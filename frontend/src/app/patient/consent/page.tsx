"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

type FormErrors = {
  general?: string;
};

export default function PatientConsentPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    const supabase = createSupabaseClient();

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        router.push("/patient/login");
        return;
      }

      setIsLoading(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user?.id) {
        router.push("/patient/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});

    if (!agreed) {
      setErrors({ general: "You must agree to the terms before continuing." });
      return;
    }

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
        setErrors({ general: "Patient profile not found. Please complete onboarding first." });
        setIsSubmitting(false);
        return;
      }

      const { error: consentError } = await supabase.from("consents").insert({
        patient_id: patient.id,
        consent_type: "digital_intake_and_ai",
        version: "1.0",
        status: "accepted",
        consented_at: new Date().toISOString(),
      });

      if (consentError) {
        setErrors({ general: "Unable to save consent. Please try again." });
        setIsSubmitting(false);
        return;
      }

      router.push("/patient/interview");
      router.refresh();
    } catch {
      setErrors({ general: "An unexpected error occurred. Please try again." });
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white dark:bg-black">
        <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-white dark:bg-black">
      <div className="w-full max-w-3xl px-6 py-10">
        <div className="rounded-2xl border-2 border-zinc-900 bg-white p-8 shadow-lg dark:border-zinc-100 dark:bg-zinc-900">
          <h1 className="mb-8 text-center text-4xl font-bold text-zinc-900 dark:text-zinc-50">
            Patient Consent &amp; Data Processing
          </h1>

          <div className="mb-8 max-h-80 overflow-y-auto rounded-xl border border-zinc-300 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800">
            <ul className="flex list-disc flex-col gap-4 text-lg leading-relaxed text-zinc-800 dark:text-zinc-200">
              <li className="pl-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">Digital Case Recording:</span>{" "}
                I agree to provide my health information digitally.
              </li>
              <li className="pl-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">AI Assistance:</span>{" "}
                I understand an AI system will assist in organizing my history, but a qualified doctor will make all final clinical decisions.
              </li>
              <li className="pl-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">Document Processing:</span>{" "}
                I consent to the automated scanning of any old medical records I upload.
              </li>
            </ul>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
            {errors.general && (
              <div
                className="rounded-xl border-2 border-red-500 bg-red-50 p-4 text-center text-base font-medium text-red-800 dark:border-red-400 dark:bg-red-950 dark:text-red-200"
                role="alert"
              >
                {errors.general}
              </div>
            )}

            <label
              htmlFor="consent"
              className="flex cursor-pointer items-center justify-center gap-4 rounded-xl border-2 border-zinc-300 bg-zinc-50 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600"
            >
              <input
                id="consent"
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={isSubmitting}
                className="h-7 w-7 cursor-pointer accent-zinc-900 dark:accent-zinc-100"
              />
              <span className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                I have read and agree to these terms.
              </span>
            </label>

            <button
              type="submit"
              disabled={!agreed || isSubmitting}
              className="mt-2 flex h-16 w-full items-center justify-center rounded-xl bg-zinc-900 text-xl font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isSubmitting ? "Processing..." : "Agree & Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
