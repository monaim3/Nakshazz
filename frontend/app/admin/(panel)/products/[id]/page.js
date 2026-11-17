import ProductEditor from "../ProductEditor";

export const instant = false;
export const metadata = { title: "Edit product" };

export default function EditProductPage() {
  return <ProductEditor editing />;
}
