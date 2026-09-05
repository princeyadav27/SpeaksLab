import catalog from "@/data/categories.json";

export type Subcategory = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  name: string;
  blurb: string;
  index: string;
  subcategories: Subcategory[];
};

type Catalog = {
  categories: Category[];
};

const data = catalog as Catalog;

export function getCategories(): Category[] {
  return data.categories;
}

export function getCategoryById(id: string): Category | undefined {
  return data.categories.find((category) => category.id === id);
}
