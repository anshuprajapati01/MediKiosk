import { Metadata } from "next";
import PatientSignupForm from "./signup-form";

export const metadata: Metadata = {
  title: "Patient Signup | MediKiosk",
  description: "Create a new patient account",
};

export default function PatientSignupPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md px-6 py-10">
        <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="mb-2 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Create Account
          </h1>
          <p className="mb-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
            Sign up as a patient to get started
          </p>
          <PatientSignupForm />
        </div>
      </div>
    </div>
  );
}
