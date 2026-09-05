"use client";

type TopicWheelProps = {
  spinning: boolean;
  rotation: number;
  disabled: boolean;
  onSpin: () => void;
};

export default function TopicWheel({
  spinning,
  rotation,
  disabled,
  onSpin,
}: TopicWheelProps) {
  const ticks = Array.from({ length: 80 }, (_, i) => i);

  return (
    <div className="relative mx-auto h-[270px] w-[270px] sm:h-[318px] sm:w-[318px]">
      <span
        className="absolute left-1/2 top-[-3px] z-10 -translate-x-1/2 text-cobalt"
        aria-hidden="true"
      >
        <svg viewBox="0 0 12 10" className="h-[11px] w-[13px]">
          <path d="M6 10 L0 0 H12 Z" fill="currentColor" />
        </svg>
      </span>

      <div
        className="absolute inset-0 rounded-full border border-ink/10 bg-[#fbf7ef] shadow-[0_12px_36px_rgba(22,22,22,0.05)]"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: "none",
        }}
      >
        <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
          {ticks.map((tick) => {
            const major = tick % 5 === 0;
            const angle = (tick / 80) * 360;
            return (
              <line
                key={tick}
                x1="100"
                y1="7"
                x2="100"
                y2={major ? "18" : "14"}
                stroke="currentColor"
                strokeWidth={major ? 1.35 : 0.75}
                className={major ? "text-ink/35" : "text-ink/16"}
                transform={`rotate(${angle} 100 100)`}
              />
            );
          })}
        </svg>
      </div>

      <button
        type="button"
        onClick={onSpin}
        disabled={disabled}
        aria-label={spinning ? "Spinning" : "Spin"}
        className={`absolute left-1/2 top-1/2 z-10 flex h-[112px] w-[112px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-display text-[1.85rem] leading-none text-ivory shadow-[0_10px_28px_rgba(0,41,164,0.28)] sm:h-[128px] sm:w-[128px] ${
          disabled
            ? "cursor-not-allowed bg-cobalt"
            : "bg-cobalt hover:bg-cobalt-deep"
        }`}
      >
        Spin
      </button>
    </div>
  );
}
