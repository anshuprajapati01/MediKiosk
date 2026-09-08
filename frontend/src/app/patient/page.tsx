import { Metadata } from "next";
import PatientDashboard from "./patient-dashboard";

export const metadata: Metadata = {
  title: "Patient Dashboard | MediKiosk",
  description: "Patient dashboard",
};

export default function PatientPage() {
  return <PatientDashboard />;
}
