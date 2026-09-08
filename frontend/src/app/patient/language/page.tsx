import { Metadata } from "next";
import LanguageSelectionForm from "./language-selection-form";
import { LanguageProvider } from "@/lib/language-context";

export const metadata: Metadata = {
  title: "Choose Language | MediKiosk",
  description: "Select your preferred language",
};

export default function PatientLanguagePage() {
  return (
    <LanguageProvider>
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="w-full max-w-lg px-6 py-10">
          <LanguageSelectionForm />
        </div>
      </div>
    </LanguageProvider>
  );
}
