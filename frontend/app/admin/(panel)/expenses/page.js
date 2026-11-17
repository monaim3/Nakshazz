import ExpensesManager from "./ExpensesManager";

export const instant = false;
export const metadata = { title: "Expenses" };

export default function ExpensesPage() {
  return <ExpensesManager />;
}
