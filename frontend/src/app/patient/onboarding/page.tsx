import { Metadata } from "next";
import PatientOnboardingForm from "./onboarding-form";

export const metadata: Metadata = {
  title: "Patient Onboarding | MediKiosk",
  description: "Complete your patient profile",
};

export default function PatientOnboardingPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md px-6 py-10">
        <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="mb-2 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Complete Your Profile
          </h1>
          <p className="mb-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
            Tell us a little about yourself to get started
          </p>
          <PatientOnboardingForm />
        </div>
      </div>
    </div>
  );
}
