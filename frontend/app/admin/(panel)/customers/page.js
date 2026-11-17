import CustomersList from "./CustomersList";

export const instant = false;
export const metadata = { title: "Customers" };

export default function CustomersPage() {
  return <CustomersList />;
}
