import type { KeyboardEvent } from "react";
import type { Category } from "@/lib/categories";

type CategoryCardProps = {
  category: Category;
  selected: boolean;
  onSelect: (id: string) => void;
};

export default function CategoryCard({
  category,
  selected,
  onSelect,
}: CategoryCardProps) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onSelect(category.id);
    }
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={category.name}
      onClick={() => onSelect(category.id)}
      onKeyDown={onKeyDown}
      className={`flex h-[220px] w-full flex-col items-start rounded-[4px] border bg-[#faf6ee] p-5 text-left transition-colors duration-200 sm:h-[240px] sm:p-6 ${
        selected
          ? "border-cobalt bg-cobalt/[0.04]"
          : "border-ink/15 hover:border-ink/30"
      }`}
    >
      <span
        className={`text-[11px] tracking-[0.08em] ${
          selected ? "text-cobalt" : "text-ink/45"
        }`}
      >
        {category.index}
      </span>
      <h3 className="mt-6 font-display text-[1.35rem] leading-tight text-ink sm:text-[1.45rem]">
        {category.name}
      </h3>
      <p className="mt-3 max-w-[16.5rem] text-[13px] leading-relaxed text-ink/60">
        {category.blurb}
      </p>
      {selected ? (
        <span className="mt-auto text-[10px] tracking-[0.16em] text-cobalt">
          Selected
        </span>
      ) : (
        <span className="mt-auto h-[15px]" aria-hidden="true" />
      )}
    </button>
  );
}
