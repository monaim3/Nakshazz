import PendingPayments from "./PendingPayments";

export const instant = false;
export const metadata = { title: "bKash verification" };

export default function PaymentsPage() {
  return <PendingPayments />;
}
