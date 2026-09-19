import { redirect } from "next/navigation";

/** Compatibility route for the reference portal's plural catalogue URL. */
export default function ExamRoomsPage() {
  redirect("/exam-room");
}
