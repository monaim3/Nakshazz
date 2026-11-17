import ReviewsManager from "./ReviewsManager";

export const instant = false;
export const metadata = { title: "Reviews" };

export default function ReviewsPage() {
  return <ReviewsManager />;
}
