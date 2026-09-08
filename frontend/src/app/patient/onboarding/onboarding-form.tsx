"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

type FormErrors = {
  fullName?: string;
  dob?: string;
  gender?: string;
  phone?: string;
  general?: string;
};

type PatientProfile = {
  full_name: string;
  dob: string | null;
  gender: string | null;
  phone: string | null;
};

export default function PatientOnboardingForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);
  const [existingProfile, setExistingProfile] = useState<PatientProfile | null>(null);

  useEffect(() => {
    const supabase = createSupabaseClient();

    async function checkProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        router.push("/patient/login");
        return;
      }

      const { data, error } = await supabase
        .from("patients")
        .select("full_name, dob, gender, phone")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        setErrors({ general: "Unable to load profile. Please try again." });
        setIsCheckingProfile(false);
        return;
      }

      if (data) {
        setExistingProfile(data as PatientProfile);
        router.push("/patient");
        return;
      }

      setIsCheckingProfile(false);
    }

    checkProfile();

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

  function validate(): FormErrors {
    const newErrors: FormErrors = {};

    if (!fullName.trim()) {
      newErrors.fullName = "Full name is required";
    }

    if (dob) {
      const selectedDate = new Date(dob);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate > today) {
        newErrors.dob = "Date of birth cannot be in the future";
      }
    }

    if (phone && !/^[+]?[\d\s()-]{7,20}$/.test(phone)) {
      newErrors.phone = "Please enter a valid phone number";
    }

    return newErrors;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        router.push("/patient/login");
        return;
      }

      const { error } = await supabase.from("patients").insert({
        user_id: session.user.id,
        full_name: fullName.trim(),
        dob: dob || null,
        gender: gender || null,
        phone: phone || null,
      });

      if (error) {
        setErrors({ general: "Unable to save profile. Please try again." });
        return;
      }

      router.push("/patient");
      router.refresh();
    } catch {
      setErrors({ general: "An unexpected error occurred. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  if (isCheckingProfile) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (existingProfile) {
    return null;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {errors.general && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          role="alert"
        >
          {errors.general}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="fullName"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Full Name <span className="text-red-500">*</span>
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={isLoading}
          className={`h-12 rounded-lg border px-4 text-base outline-none transition-colors disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-100 ${
            errors.fullName
              ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : "border-zinc-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:focus:border-zinc-100"
          }`}
          placeholder="John Doe"
          autoComplete="name"
        />
        {errors.fullName && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {errors.fullName}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="dob"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Date of Birth
        </label>
        <input
          id="dob"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          disabled={isLoading}
          className={`h-12 rounded-lg border px-4 text-base outline-none transition-colors disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-100 ${
            errors.dob
              ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : "border-zinc-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:focus:border-zinc-100"
          }`}
        />
        {errors.dob && (
          <p className="text-sm text-red-600 dark:text-red-400">{errors.dob}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="gender"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Gender
        </label>
        <select
          id="gender"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          disabled={isLoading}
          className={`h-12 rounded-lg border px-4 text-base outline-none transition-colors disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-100 ${
            errors.gender
              ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : "border-zinc-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:focus:border-zinc-100"
          }`}
        >
          <option value="">Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
          <option value="prefer-not-to-say">Prefer not to say</option>
        </select>
        {errors.gender && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {errors.gender}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="phone"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Phone
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isLoading}
          className={`h-12 rounded-lg border px-4 text-base outline-none transition-colors disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-100 ${
            errors.phone
              ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : "border-zinc-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:focus:border-zinc-100"
          }`}
          placeholder="(555) 123-4567"
          autoComplete="tel"
        />
        {errors.phone && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {errors.phone}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="mt-2 flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {isLoading ? "Saving..." : "Complete Onboarding"}
      </button>
    </form>
  );
}
