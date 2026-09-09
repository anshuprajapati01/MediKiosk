import { Metadata } from "next";
import DoctorDashboard from "./doctor-dashboard";

export const metadata: Metadata = {
  title: "Doctor Dashboard | MediKiosk",
  description: "Review patient cases awaiting doctor review",
};

export default function DoctorDashboardPage() {
  return <DoctorDashboard />;
}
