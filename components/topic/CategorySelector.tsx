"use client";

import { getCategories, type Category } from "@/lib/categories";
import CategoryCard from "./CategoryCard";

type CategorySelectorProps = {
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function CategorySelector({
  selectedId,
  onSelect,
}: CategorySelectorProps) {
  const categories: Category[] = getCategories();

  return (
    <div
      role="radiogroup"
      aria-label="Topic categories"
      className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-3.5"
    >
      {categories.map((category) => (
        <CategoryCard
          key={category.id}
          category={category}
          selected={selectedId === category.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
