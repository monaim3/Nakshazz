const TIME_ZONE = "Asia/Dhaka";

const moneyFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const moneyExactFormatter = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1250.00" → "৳1,250". Lakh grouping (1,25,000) as used in Bangladesh. */
export function formatBDT(value, { exact = false } = {}) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (Number.isNaN(number)) return "—";
  return `৳${(exact ? moneyExactFormatter : moneyFormatter).format(number)}`;
}

export function formatDate(value, options = {}) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE, ...options }).format(new Date(value));
}

export function formatDateTime(value) {
  return formatDate(value, { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(Number(value || 0));
}

/** Today in Dhaka as YYYY-MM-DD (for date inputs and report ranges). */
export function todayISO(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

export function humanize(value) {
  if (!value) return "";
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
