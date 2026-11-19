"use client";

import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, X } from "lucide-react";
import { humanize } from "@/lib/format";

export function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

/* ---------- Buttons ---------- */

const buttonVariants = {
  primary: "bg-ink-900 text-cream-50 hover:bg-ink-800 disabled:bg-ink-300",
  gold: "bg-gold-500 text-white hover:bg-gold-600 disabled:bg-gold-300",
  secondary: "bg-white text-ink-800 ring-1 ring-ink-200 hover:bg-cream-100 disabled:text-ink-300",
  ghost: "text-ink-600 hover:bg-cream-200 hover:text-ink-900",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
};

const buttonSizes = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export const Button = forwardRef(function Button(
  { variant = "primary", size = "md", loading = false, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/* ---------- Form fields ---------- */

const fieldBase =
  "block w-full rounded-lg border-0 bg-white px-3 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-300 focus:ring-2 focus:ring-gold-500 focus:outline-none disabled:bg-ink-50 disabled:text-ink-400";

export function Field({ label, error, hint, required, children, className, htmlFor }) {
  return (
    <div className={cx("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-700">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-ink-400">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input({ label, error, hint, required, className, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={cx(fieldBase, "h-10", error && "ring-red-400")}
        {...props}
      />
    </Field>
  );
});

/** Password field with a show/hide (eye) toggle. */
export const PasswordInput = forwardRef(function PasswordInput({ label, error, hint, required, className, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={inputId}>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          className={cx(fieldBase, "h-10 pr-11", error && "ring-red-400")}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-ink-400 transition hover:text-ink-800"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={inputId}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Field>
  );
});

export const Textarea = forwardRef(function Textarea({ label, error, hint, required, className, id, rows = 3, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={inputId}>
      <textarea ref={ref} id={inputId} rows={rows} className={cx(fieldBase, "py-2", error && "ring-red-400")} {...props} />
    </Field>
  );
});

export const Select = forwardRef(function Select({ label, error, hint, required, className, id, options = [], placeholder, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={inputId}>
      <select ref={ref} id={inputId} className={cx(fieldBase, "h-10 pr-8", error && "ring-red-400")} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
});

export const Checkbox = forwardRef(function Checkbox({ label, hint, className, ...props }, ref) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-2.5", className)}>
      <input ref={ref} type="checkbox" className="mt-0.5 size-4 rounded border-ink-300 accent-gold-500" {...props} />
      <span>
        <span className="text-sm text-ink-800">{label}</span>
        {hint && <span className="block text-xs text-ink-400">{hint}</span>}
      </span>
    </label>
  );
});

/* ---------- Layout ---------- */

export function Card({ className, children, title, actions, padded = true }) {
  return (
    <section className={cx("rounded-[var(--radius-card)] bg-white ring-1 ring-ink-100", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          {title && <h2 className="text-sm font-semibold text-ink-900">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={padded ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "default", icon: Icon }) {
  const tones = {
    default: "text-ink-900",
    good: "text-emerald-700",
    bad: "text-red-700",
    gold: "text-gold-700",
  };
  return (
    <div className="rounded-[var(--radius-card)] bg-white p-4 ring-1 ring-ink-100 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
        {Icon && <Icon className="size-4 text-ink-300" aria-hidden />}
      </div>
      <p className={cx("mt-2 text-xl font-semibold tabular-nums sm:text-2xl", tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

/* ---------- Feedback ---------- */

const badgeTones = {
  neutral: "bg-ink-50 text-ink-600 ring-ink-200",
  gold: "bg-gold-300/25 text-gold-700 ring-gold-400/40",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({ tone = "neutral", children, className }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

const statusTones = {
  pending: "amber",
  confirmed: "blue",
  processing: "violet",
  shipped: "gold",
  delivered: "green",
  cancelled: "neutral",
  returned: "red",
  unpaid: "neutral",
  pending_verification: "amber",
  partially_paid: "blue",
  paid: "green",
  partially_refunded: "violet",
  refunded: "red",
  verified: "green",
  rejected: "red",
  active: "green",
  draft: "neutral",
  archived: "red",
  approved: "green",
};

export function StatusBadge({ status }) {
  const value = typeof status === "object" && status !== null ? status.value : status;
  return <Badge tone={statusTones[value] || "neutral"}>{humanize(value)}</Badge>;
}

export function Spinner({ className }) {
  return <Loader2 className={cx("size-5 animate-spin text-ink-400", className)} aria-label="Loading" />;
}

export function LoadingBlock({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-400">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl bg-red-50 px-4 py-10 text-center text-sm text-red-700">
      <AlertCircle className="size-6" aria-hidden />
      <p>{error?.message || "Something went wrong."}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      {Icon && <Icon className="size-8 text-ink-200" aria-hidden />}
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------- Table ---------- */

export function Table({ columns, rows, rowKey = "id", onRowClick, empty }) {
  if (!rows?.length) return empty || null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-xs tracking-wide text-ink-500 uppercase">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cx("px-4 py-3 font-medium whitespace-nowrap", column.align === "right" && "text-right", column.className)}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => (
            <tr
              key={row[rowKey]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cx(onRowClick && "cursor-pointer hover:bg-cream-100/60")}
            >
              {columns.map((column) => (
                <td key={column.key} className={cx("px-4 py-3 align-middle", column.align === "right" && "text-right tabular-nums", column.className)}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ meta, onPageChange }) {
  if (!meta || meta.last_page <= 1) return null;

  return (
    <nav className="flex items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 text-sm text-ink-500" aria-label="Pagination">
      <span>
        Page {meta.current_page} of {meta.last_page} · {meta.total} total
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={meta.current_page <= 1} onClick={() => onPageChange(meta.current_page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="sm" variant="secondary" disabled={meta.current_page >= meta.last_page} onClick={() => onPageChange(meta.current_page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

/* ---------- Modal ---------- */

export function Modal({ open, onClose, title, children, footer, size = "md" }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => event.target === dialogRef.current && onClose()}
      className={cx("m-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-0 text-ink-800 shadow-xl backdrop:bg-ink-900/40", widths[size])}
    >
      {open && (
        <div className="animate-fade-in">
          <header className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-400 hover:bg-cream-100 hover:text-ink-700" aria-label="Close">
              <X className="size-5" />
            </button>
          </header>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/* ---------- Toasts ---------- */

const ToastContext = createContext({ notify: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              "pointer-events-auto flex max-w-sm animate-fade-in items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg",
              toast.tone === "error" ? "bg-red-600 text-white" : "bg-ink-900 text-cream-50",
            )}
          >
            {toast.tone === "error" ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0 text-gold-300" />}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
