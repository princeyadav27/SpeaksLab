import Hero from "@/components/Hero";

export default function Home() {
  return (
    <main>
      <a
        href="#practice-modes"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ivory focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to practice modes
      </a>
      <Hero />
    </main>
  );
}
