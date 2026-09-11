import { Metadata } from "next";
import PatientDashboardClient from "./patient-dashboard-client";

export const metadata: Metadata = {
  title: "Patient Dashboard | MediKiosk",
  description: "Patient dashboard",
};

export default function PatientPage() {
  return <PatientDashboardClient />;
}
