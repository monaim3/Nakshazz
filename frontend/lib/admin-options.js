/** Option lists mirroring the backend enums. */

export const ORDER_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
];

export const PAYMENT_STATUSES = [
  { value: "unpaid", label: "Unpaid" },
  { value: "pending_verification", label: "Needs verification" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "partially_refunded", label: "Partially refunded" },
  { value: "refunded", label: "Refunded" },
];

export const SALES_CHANNELS = [
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "physical_store", label: "Physical store" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
];

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "mobile_banking", label: "Nagad / Rocket" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cod", label: "Cash on delivery" },
  { value: "online_gateway", label: "Online payment" },
  { value: "other", label: "Other" },
];

/** What staff should see on the button that moves an order to each status. */
export const TRANSITION_LABELS = {
  confirmed: "Confirm order",
  processing: "Mark processing",
  shipped: "Mark shipped",
  delivered: "Mark delivered",
  cancelled: "Cancel order",
  returned: "Mark returned",
};
