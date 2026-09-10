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

export default function PatientAuthForm() {
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

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {successMessage && (
        <div
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200"
          role="status"
        >
          {successMessage}
        </div>
      )}

      {errors.general && (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
          role="alert"
        >
          {errors.general}
        </div>
      )}

      {mode === "signup" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-sm font-medium text-zinc-300">
            Full Name <span className="text-red-400">*</span>
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isLoading}
            className={`h-12 rounded-xl border bg-black/40 px-4 text-base text-white placeholder-zinc-500 outline-none transition-colors disabled:opacity-50 ${
              errors.fullName
                ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                : "border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            }`}
            placeholder="John Doe"
            autoComplete="name"
          />
          {errors.fullName && (
            <p className="text-sm text-red-400">{errors.fullName}</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-zinc-300">
          Email <span className="text-red-400">*</span>
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          className={`h-12 rounded-xl border bg-black/40 px-4 text-base text-white placeholder-zinc-500 outline-none transition-colors disabled:opacity-50 ${
            errors.email
              ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : "border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          }`}
          placeholder="you@example.com"
          autoComplete="email"
        />
        {errors.email && (
          <p className="text-sm text-red-400">{errors.email}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-zinc-300">
          Password <span className="text-red-400">*</span>
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          className={`h-12 rounded-xl border bg-black/40 px-4 text-base text-white placeholder-zinc-500 outline-none transition-colors disabled:opacity-50 ${
            errors.password
              ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : "border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          }`}
          placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />
        {errors.password && (
          <p className="text-sm text-red-400">{errors.password}</p>
        )}
      </div>

      {mode === "signup" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-zinc-300">
            Confirm Password <span className="text-red-400">*</span>
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            className={`h-12 rounded-xl border bg-black/40 px-4 text-base text-white placeholder-zinc-500 outline-none transition-colors disabled:opacity-50 ${
              errors.confirmPassword
                ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                : "border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            }`}
            placeholder="Re-enter your password"
            autoComplete="new-password"
          />
          {errors.confirmPassword && (
            <p className="text-sm text-red-400">{errors.confirmPassword}</p>
          )}
        </div>
      )}

      {mode === "signup" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dob" className="text-sm font-medium text-zinc-300">
              Date of Birth <span className="text-red-400">*</span>
            </label>
            <input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              disabled={isLoading}
              className={`h-12 rounded-xl border bg-black/40 px-4 text-base text-white placeholder-zinc-500 outline-none transition-colors disabled:opacity-50 ${
                errors.dob
                  ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                  : "border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              }`}
            />
            {errors.dob && (
              <p className="text-sm text-red-400">{errors.dob}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">
              Gender <span className="text-red-400">*</span>
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
                      isActive
                        ? "bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                        : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {errors.gender && (
              <p className="text-sm text-red-400">{errors.gender}</p>
            )}
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="mt-2 flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-base font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all hover:from-indigo-400 hover:to-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading
          ? mode === "signin"
            ? "Signing in..."
            : "Creating account..."
          : mode === "signin"
            ? "Sign In"
            : "Create Account"}
      </button>

      <p className="text-center text-sm text-zinc-400">
        {mode === "signin" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={toggleMode}
              className="font-medium text-indigo-400 underline underline-offset-4 hover:text-indigo-300"
            >
              Create Account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={toggleMode}
              className="font-medium text-indigo-400 underline underline-offset-4 hover:text-indigo-300"
            >
              Sign In
            </button>
          </>
        )}
      </p>
    </form>
  );
}
