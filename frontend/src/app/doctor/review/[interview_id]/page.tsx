import { Metadata } from "next";
import DoctorReviewPage from "./doctor-review-page";

type Props = {
  params: Promise<{ interview_id: string }>;
};

export const metadata: Metadata = {
  title: "Doctor Review | MediKiosk",
  description: "Review patient interview and documents.",
};

export default async function Page({ params }: Props) {
  const { interview_id } = await params;
  return <DoctorReviewPage interviewId={interview_id} />;
}
