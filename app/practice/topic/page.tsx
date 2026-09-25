import Navbar from "@/components/Navbar";
import TopicChallengeFlow from "@/components/topic/TopicChallengeFlow";
import { requireSignedIn } from "@/lib/authGate";

export const metadata = {
  title: "Topic Challenge — SpeakLab",
  description: "Choose an area. We'll give you a topic to explore.",
};

/**
 * Recordings are saved to the signed-in user's account, so the challenge
 * flow requires sign-in. Signed-out visitors are sent to sign-in and
 * returned here afterwards.
 */
export default async function TopicChallengePage() {
  await requireSignedIn("/practice/topic");
  return (
    <main className="paper-surface relative min-h-svh bg-ivory text-ink">
      <div className="relative z-10 flex min-h-svh flex-col">
        <Navbar variant="solid" />
        <TopicChallengeFlow />
      </div>
    </main>
  );
}
