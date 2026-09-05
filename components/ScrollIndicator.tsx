export default function ScrollIndicator() {
  return (
    <div
      className="flex flex-col items-center gap-1 text-ink/55"
      aria-hidden="true"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-[18px] w-[12px] items-start justify-center rounded-full border border-ink/40 pt-[3px]">
          <span className="block h-[5px] w-[1.5px] rounded-full bg-ink/50" />
        </span>
        <span className="text-[11px] tracking-[0.02em] text-ink/55">
          Scroll to explore
        </span>
      </div>
      <span className="text-[11px] leading-none text-ink/40">⌄</span>
    </div>
  );
}
