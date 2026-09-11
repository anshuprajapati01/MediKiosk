import { Metadata } from "next";
import LoginFormClient from "./LoginFormClient";

export const metadata: Metadata = {
  title: "Patient Login | MediKiosk",
  description: "Sign in or create a patient account",
};

export default function PatientLoginPage() {
  return <LoginFormClient />;
}
