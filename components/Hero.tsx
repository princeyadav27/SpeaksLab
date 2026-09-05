import Image from "next/image";
import Link from "next/link";
import Navbar from "./Navbar";
import PracticeCards from "./PracticeCards";
import ScrollIndicator from "./ScrollIndicator";

function InkUnderline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 18"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4 13.2C72 6.5 150 15.5 248 10.2C318 6.4 372 12.8 416 8.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function QuoteRule({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 10"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M1 6.2C28 3.2 62 7.8 96 5.1C122 3.2 142 6.4 159 4.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WaveformMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 22 18"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="1" y="4" width="2.4" height="11" rx="1.1" />
      <rect x="7" y="1" width="2.4" height="16" rx="1.1" />
      <rect x="13" y="3" width="2.4" height="13" rx="1.1" />
      <rect x="19" y="2" width="2.4" height="14" rx="1.1" />
    </svg>
  );
}

export default function Hero() {
  return (
    <section className="relative isolate h-svh min-h-[640px] overflow-hidden bg-cobalt text-ivory">
      <div className="pointer-events-none absolute inset-0 z-0">
        <Image
          src="/images/hero-background.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center max-md:object-[72%_38%]"
          aria-hidden="true"
        />
      </div>

      <div className="relative z-10 h-full">
        <Navbar variant="overlay" />

        {/* Vertical editorial spine */}
        <div
          className="pointer-events-none absolute left-4 top-[42%] hidden -translate-y-1/2 lg:flex xl:left-6"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-5">
            <p className="font-sans text-[9px] font-medium tracking-[0.32em] text-ivory/55 [writing-mode:vertical-rl] rotate-180">
              Speak · Think · Improve
            </p>
            <span className="h-16 w-px bg-ivory/35" />
          </div>
        </div>

        {/* Page index + slider */}
        <div
          className="pointer-events-none absolute right-6 top-[30%] hidden flex-col items-center lg:flex xl:right-10"
          aria-hidden="true"
        >
          <span className="text-[10px] tracking-[0.16em] text-ivory/75">
            01&nbsp;/&nbsp;∞
          </span>
          <div className="relative mt-3 h-[4.6rem] w-px bg-ivory/45">
            <span className="absolute left-1/2 top-[22%] h-[9px] w-[9px] -translate-x-1/2 rounded-full bg-ivory" />
          </div>
          <div className="mt-4 flex flex-col items-center gap-2.5">
            <span className="h-[5px] w-[5px] rounded-full bg-ivory/35" />
            <span className="h-[5px] w-[5px] rounded-full bg-ivory/35" />
            <span className="h-[5px] w-[5px] rounded-full bg-ivory/35" />
          </div>
        </div>

        {/* Main copy — left sky */}
        <div className="absolute left-5 top-[12%] max-w-[36rem] sm:left-10 sm:top-[14%] md:left-[7%] md:top-[16.5%] lg:left-[7.2%]">
          <h1 className="reveal font-display text-[clamp(2.35rem,5.4vw,4.75rem)] leading-[1.06] tracking-[-0.012em] text-ivory">
            <span className="block">Think Deeper.</span>
            <span className="relative mt-0 block italic">
              Speak Freely.
              <InkUnderline className="pointer-events-none absolute -bottom-1 left-0 w-[min(92%,21rem)] text-ivory/90" />
            </span>
          </h1>

          <p className="reveal d2 mt-7 max-w-[22.5rem] text-[14px] font-normal leading-[1.65] text-ivory/88 sm:mt-8 sm:text-[15px]">
            A personal space to practice, record,
            <br className="hidden sm:block" />
            {" "}and improve your English — one conversation
            <br className="hidden sm:block" />
            {" "}at a time.
          </p>

          <div className="reveal d3 mt-8 flex flex-wrap items-center gap-5 sm:mt-9">
            <Link
              href="/practice"
              className="inline-flex items-center gap-2 rounded-full bg-ivory px-5 py-2.5 text-[13.5px] font-medium text-ink transition-transform duration-300 hover:translate-x-0.5 hover:bg-ivory-warm"
            >
              Start Practicing
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        {/* Cards on the painted ground */}
        <div
          id="practice-modes"
          className="absolute bottom-[11.5%] left-1/2 z-20 w-[min(calc(100%-1.5rem),46.5rem)] -translate-x-1/2"
        >
          <PracticeCards />
        </div>

        <blockquote className="absolute bottom-[3.6%] left-5 hidden max-w-[16rem] md:block lg:left-8">
          <p className="font-display text-[0.98rem] italic leading-snug text-cobalt">
            “It&apos;s not about perfection,
            <br />
            it&apos;s about progress.”
          </p>
          <QuoteRule className="mt-1 w-[7.5rem] text-cobalt/70" />
        </blockquote>

        <div className="absolute bottom-[3.2%] left-1/2 hidden -translate-x-1/2 md:block">
          <ScrollIndicator />
        </div>

        <div
          className="absolute bottom-[3.8%] right-6 hidden text-ink/80 md:block lg:right-10"
          aria-hidden="true"
        >
          <WaveformMark className="h-4 w-5" />
        </div>
      </div>
    </section>
  );
}
