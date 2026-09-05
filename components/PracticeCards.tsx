import PracticeCard from "./PracticeCard";

type PracticeCardsProps = {
  id?: string;
};

export default function PracticeCards({ id }: PracticeCardsProps) {
  return (
    <div
      id={id}
      className="flex w-full flex-row flex-nowrap items-stretch justify-center gap-2.5"
    >
      <PracticeCard
        title="Shadow Speaking"
        description={"Watch, listen, and repeat. Match the\nrhythm, tone and flow."}
        image="/images/shadow-speaking.webp"
        imageAlt="Silhouette of a person wearing headphones, speaking along with flowing sound."
        href="/practice"
        objectPosition="center 40%"
      />
      <PracticeCard
        title="Topic Challenge"
        description={"Research, think and explain.\nYour ideas. Your voice."}
        image="/images/topic-challenge.webp"
        imageAlt="Silhouette of a person thinking at a desk, ideas drifting upward."
        href="/practice/topic"
        objectPosition="center 45%"
      />
    </div>
  );
}
