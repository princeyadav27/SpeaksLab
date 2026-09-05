import Link from "next/link";

function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 16"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <g transform="skewX(-16)">
        <rect x="2.2" y="2.2" width="1.55" height="12.2" rx="0.55" />
        <rect x="6.6" y="1.4" width="1.55" height="13.4" rx="0.55" />
        <rect x="11" y="2" width="1.55" height="12.5" rx="0.55" />
        <rect x="15.4" y="0.6" width="1.55" height="14.6" rx="0.55" />
        <rect x="19.8" y="1.8" width="1.55" height="12.8" rx="0.55" />
      </g>
    </svg>
  );
}

type NavbarProps = {
  variant?: "overlay" | "solid";
};

export default function Navbar({ variant = "overlay" }: NavbarProps) {
  const overlay = variant === "overlay";

  return (
    <header
      className={`relative z-30 ${overlay ? "" : "nav-light border-b border-ink/10 bg-ivory"}`}
    >
      <nav
        className="flex items-center justify-between px-6 py-[1.35rem] sm:px-8 lg:px-12 xl:px-14"
        aria-label="Primary"
      >
        <Link
          href="/"
          className={`flex items-center gap-3 ${overlay ? "text-ivory" : "text-ink"}`}
        >
          <LogoMark className="h-[15px] w-[24px]" />
          <span className="font-display text-[1.28rem] font-medium leading-none tracking-tight">
            SpeakLab
          </span>
        </Link>

        <div className="flex items-center gap-8 lg:gap-10">
          <Link
            href="/practice/recordings"
            className={`rounded-lg border px-3.5 py-2 text-[13px] font-normal tracking-[0.01em] transition-colors ${
              overlay
                ? "border-ivory/30 text-ivory hover:border-ivory/70 hover:bg-ivory/10"
                : "border-ink/15 text-ink/75 hover:border-cobalt/35 hover:bg-cobalt/5 hover:text-cobalt"
            }`}
          >
            My Recordings
          </Link>
        </div>
      </nav>
    </header>
  );
}
