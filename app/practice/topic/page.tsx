import Navbar from "@/components/Navbar";
import TopicChallengeFlow from "@/components/topic/TopicChallengeFlow";

export const metadata = {
  title: "Topic Challenge — SpeakLab",
  description: "Choose an area. We'll give you a topic to explore.",
};

export default function TopicChallengePage() {
  return (
    <main className="paper-surface relative min-h-svh bg-ivory text-ink">
      <div className="relative z-10 flex min-h-svh flex-col">
        <Navbar variant="solid" />
        <TopicChallengeFlow />
      </div>
    </main>
  );
}
