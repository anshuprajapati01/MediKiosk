import { Metadata } from "next";
import DoctorLoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Doctor Login | MediKiosk",
  description: "Secure sign in for doctors",
};

export default function DoctorLoginPage() {
  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-black">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]" />
      </div>
      <div className="relative z-10 w-full max-w-md px-6 py-10">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md">
          <h1 className="mb-2 text-center text-3xl font-bold bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            Doctor Portal
          </h1>
          <p className="mb-8 text-center text-base text-zinc-400">
            Sign in to review patient cases
          </p>
          <DoctorLoginForm />
        </div>
      </div>
    </div>
  );
}
