"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

type FormErrors = {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  dob?: string;
  gender?: string;
  general?: string;
};

type Mode = "signin" | "signup";

type Props = {
  isDarkMode?: boolean;
};

export default function PatientAuthForm({ isDarkMode = false }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const supabase = createSupabaseClient();

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user?.email) {
        router.replace("/patient");
      }
    }

    checkSession();
  }, [router]);

  function validate(): FormErrors {
    const newErrors: FormErrors = {};

    if (mode === "signup") {
      if (!fullName.trim()) {
        newErrors.fullName = "Full name is required";
      }
      if (!dob) {
        newErrors.dob = "Date of birth is required";
      }
      if (!gender) {
        newErrors.gender = "Gender is required";
      }
    }

    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    if (mode === "signup" && password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    return newErrors;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccessMessage("");
    setErrors({});

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createSupabaseClient();

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              dob,
              gender,
            },
          },
        });

        if (error) {
          setErrors({ general: error.message });
          setIsLoading(false);
          return;
        }

        if (data.user) {
          const mrn = `MK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

          const { error: patientError } = await supabase
            .from("patients")
            .insert({
              user_id: data.user.id,
              mrn,
              full_name: fullName.trim(),
              dob,
              gender,
              email: email.trim(),
            });

          if (patientError) {
            console.error("Failed to create patient profile:", patientError);
            setErrors({
              general: "Account created but profile setup failed. Please contact support.",
            });
            setIsLoading(false);
            return;
          }
        }

        if (data.session) {
          router.replace("/patient");
          router.refresh();
        } else {
          setSuccessMessage(
            "Account created! Please check your email to verify your account before signing in.",
          );
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setErrors({ general: "Invalid email or password" });
          setIsLoading(false);
          return;
        }

        router.replace("/patient");
        router.refresh();
      }
    } catch {
      setErrors({ general: "An unexpected error occurred. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  function toggleMode() {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
    setErrors({});
    setSuccessMessage("");
  }

  const inputBase = `h-12 rounded-xl border px-4 text-base outline-none transition-colors disabled:opacity-50 ${
    isDarkMode
      ? "bg-black/50 text-white placeholder-zinc-500"
      : "bg-slate-50 text-slate-800 placeholder-slate-400"
  }`;

  const labelClass = `text-sm font-medium ${
    isDarkMode ? "text-zinc-300" : "text-slate-700"
  }`;

  const errorClass = `text-sm ${
    isDarkMode ? "text-red-400" : "text-red-500"
  }`;

  const successClass = `rounded-lg border p-4 text-sm ${
    isDarkMode
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-emerald-500/30 bg-emerald-50 text-emerald-700"
  }`;

  const alertClass = `rounded-lg border p-4 text-sm ${
    isDarkMode
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : "border-red-500/30 bg-red-50 text-red-700"
  }`;

  const textLinkClass = `font-medium ${
    isDarkMode
      ? "text-teal-400 hover:text-teal-300"
      : "text-teal-600 hover:text-teal-700"
  }`;

  const genderActive = isDarkMode
    ? "bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
    : "bg-teal-50 border-teal-500 text-teal-700";

  const genderInactive = isDarkMode
    ? "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50";

  const inputFocusSuccess = isDarkMode
    ? "focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
    : "focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

  const inputFocusError = isDarkMode
    ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
    : "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

  const inputBorderDefault = isDarkMode ? "border-white/10" : "border-slate-200";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {successMessage && (
        <div className={successClass} role="status">
          {successMessage}
        </div>
      )}

      {errors.general && (
        <div className={alertClass} role="alert">
          {errors.general}
        </div>
      )}

      {mode === "signup" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className={labelClass}>
            Full Name <span className={isDarkMode ? "text-red-400" : "text-red-500"}>*</span>
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isLoading}
            className={`${inputBase} ${
              errors.fullName ? inputFocusError : `${inputBorderDefault} ${inputFocusSuccess}`
            }`}
            placeholder="John Doe"
            autoComplete="name"
          />
          {errors.fullName && <p className={errorClass}>{errors.fullName}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelClass}>
          Email <span className={isDarkMode ? "text-red-400" : "text-red-500"}>*</span>
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          className={`${inputBase} ${
            errors.email ? inputFocusError : `${inputBorderDefault} ${inputFocusSuccess}`
          }`}
          placeholder="you@example.com"
          autoComplete="email"
        />
        {errors.email && <p className={errorClass}>{errors.email}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={labelClass}>
          Password <span className={isDarkMode ? "text-red-400" : "text-red-500"}>*</span>
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          className={`${inputBase} ${
            errors.password ? inputFocusError : `${inputBorderDefault} ${inputFocusSuccess}`
          }`}
          placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />
        {errors.password && <p className={errorClass}>{errors.password}</p>}
      </div>

      {mode === "signup" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirmPassword" className={labelClass}>
            Confirm Password <span className={isDarkMode ? "text-red-400" : "text-red-500"}>*</span>
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            className={`${inputBase} ${
              errors.confirmPassword ? inputFocusError : `${inputBorderDefault} ${inputFocusSuccess}`
            }`}
            placeholder="Re-enter your password"
            autoComplete="new-password"
          />
          {errors.confirmPassword && <p className={errorClass}>{errors.confirmPassword}</p>}
        </div>
      )}

      {mode === "signup" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dob" className={labelClass}>
              Date of Birth <span className={isDarkMode ? "text-red-400" : "text-red-500"}>*</span>
            </label>
            <input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              disabled={isLoading}
              className={`${inputBase} ${
                errors.dob ? inputFocusError : `${inputBorderDefault} ${inputFocusSuccess}`
              }`}
            />
            {errors.dob && <p className={errorClass}>{errors.dob}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>
              Gender <span className={isDarkMode ? "text-red-400" : "text-red-500"}>*</span>
            </label>
            <div className="flex gap-3">
              {[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
              ].map((option) => {
                const isActive = gender === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setGender(option.value)}
                    className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all duration-200 ${
                      isActive ? genderActive : genderInactive
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {errors.gender && <p className={errorClass}>{errors.gender}</p>}
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className={`mt-2 flex h-12 w-full items-center justify-center rounded-full text-base font-semibold text-white shadow-md transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
          isDarkMode
            ? "bg-teal-600 hover:bg-teal-700"
            : "bg-teal-600 hover:bg-teal-700"
        }`}
      >
        {isLoading
          ? mode === "signin"
            ? "Signing in..."
            : "Creating account..."
          : mode === "signin"
            ? "Sign In"
            : "Create Account"}
      </button>

      <p className={`text-center text-sm ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>
        {mode === "signin" ? (
          <>
            Don&apos;t have an account?{" "}
            <button type="button" onClick={toggleMode} className={textLinkClass}>
              Create Account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button type="button" onClick={toggleMode} className={textLinkClass}>
              Sign In
            </button>
          </>
        )}
      </p>
    </form>
  );
}
