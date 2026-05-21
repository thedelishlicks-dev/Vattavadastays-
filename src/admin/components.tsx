import type { BookingStatus } from "@/types/database";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export function StatusPill({ status }: { status: BookingStatus | string }) {
  const map: Record<string, string> = {
    pending:    "bg-amber-100 text-amber-800",
    confirmed:  "bg-primary-light text-primary",
    checked_in: "bg-blue-100 text-blue-800",
    completed:  "bg-muted text-muted-foreground",
    cancelled:  "bg-destructive/10 text-destructive",
  };

  const label: Record<string, string> = {
    pending:    "Pending",
    confirmed:  "Confirmed",
    checked_in: "Checked In",
    completed:  "Completed",
    cancelled:  "Cancelled",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {label[status] ?? status}
    </span>
  );
}

export function PaymentPill({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, string> = {
    unpaid:  "bg-destructive/10 text-destructive",
    partial: "bg-amber-100 text-amber-800",
    paid:    "bg-primary-light text-primary",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${map[status]}`}
    >
      {status}
    </span>
  );
}
