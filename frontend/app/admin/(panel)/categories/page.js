import CategoriesManager from "./CategoriesManager";

export const instant = false;
export const metadata = { title: "Categories" };

export default function CategoriesPage() {
  return <CategoriesManager />;
}
