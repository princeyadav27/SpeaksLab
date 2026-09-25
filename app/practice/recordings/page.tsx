import MyRecordingsClient from "@/components/recordings/MyRecordingsClient";
import { requireSignedIn } from "@/lib/authGate";

export const metadata = {
  title: "My Recordings — SpeakLab",
  description: "Review your saved practice recordings, transcripts, and AI feedback.",
};

/**
 * The recording library lives in the signed-in user's account, so this page
 * requires sign-in. Signed-out visitors are sent to sign-in and returned
 * here afterwards.
 */
export default async function MyRecordingsPage() {
  await requireSignedIn("/practice/recordings");
  return <MyRecordingsClient />;
}
