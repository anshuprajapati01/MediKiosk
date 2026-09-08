"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/language-context";

type LanguageOption = {
  code: "en" | "hi";
  label: string;
  nativeLabel: string;
  description: string;
};

const LANGUAGES: LanguageOption[] = [
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    description: "Continue in English",
  },
  {
    code: "hi",
    label: "Hindi",
    nativeLabel: "हिंदी",
    description: "हिंदी में जारी रखें",
  },
];

export default function LanguageSelectionForm() {
  const router = useRouter();
  const { language: selectedLanguage, setLanguage } = useLanguage();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseClient();

    async function checkAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        router.push("/patient/login");
        return;
      }

      const { data, error } = await supabase
        .from("patients")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error || !data) {
        router.push("/patient/onboarding");
        return;
      }

      setIsLoading(false);
    }

    checkAccess();

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

  function handleSelect(code: "en" | "hi") {
    setLanguage(code);
    router.push("/patient/consent");
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-center text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
        Choose Your Language
      </h1>
      <p className="text-center text-base text-zinc-600 dark:text-zinc-400">
        Select the language you are most comfortable with
      </p>
      <div className="grid w-full max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
        {LANGUAGES.map((option) => {
          const isActive = selectedLanguage === option.code;
          return (
            <button
              key={option.code}
              type="button"
              onClick={() => handleSelect(option.code)}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-8 text-center transition-colors ${
                isActive
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 bg-white hover:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-100"
              }`}
            >
              <span className="text-2xl font-semibold sm:text-3xl">
                {option.nativeLabel}
              </span>
              <span
                className={`text-sm ${
                  isActive
                    ? "text-zinc-200 dark:text-zinc-700"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
