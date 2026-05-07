import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Section, Field, inputCls, SaveBar } from "@/admin/formKit";
import { BOOKINGS } from "@/admin/mockData";
import { PaymentPill, StatusPill } from "@/admin/components";

export const Route = createFileRoute("/admin/payments")({ component: PaymentsPage });

function PaymentsPage() {
  const [upi, setUpi] = useState("rajuthomas@okicici");
  const [bank, setBank] = useState({
    accountName: "Raju Thomas",
    accountNumber: "0123456789012",
    ifsc: "SBIN0001234",
    bankName: "State Bank of India, Munnar",
  });
  const [cashOnArrival, setCashOnArrival] = useState(true);
  const [terms, setTerms] = useState(
    "50% advance via UPI/bank to confirm booking. Balance payable in cash or UPI on arrival. Refunds processed within 7 working days as per cancellation policy.",
  );
  const [dirty, setDirty] = useState(false);
  const mark = () => setDirty(true);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Payments" subtitle="Where guests should pay you, and what they've paid." />

      <Section title="UPI">
        <Field label="UPI ID" hint="Shown on the booking confirmation page.">
          <input
            value={upi}
            onChange={(e) => {
              setUpi(e.target.value);
              mark();
            }}
            className={`${inputCls} max-w-md`}
          />
        </Field>
      </Section>

      <Section title="Bank account">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Account holder name">
            <input
              value={bank.accountName}
              onChange={(e) => {
                setBank({ ...bank, accountName: e.target.value });
                mark();
              }}
              className={inputCls}
            />
          </Field>
          <Field label="Account number">
            <input
              value={bank.accountNumber}
              onChange={(e) => {
                setBank({ ...bank, accountNumber: e.target.value });
                mark();
              }}
              className={inputCls}
            />
          </Field>
          <Field label="IFSC code">
            <input
              value={bank.ifsc}
              onChange={(e) => {
                setBank({ ...bank, ifsc: e.target.value });
                mark();
              }}
              className={inputCls}
            />
          </Field>
          <Field label="Bank name & branch">
            <input
              value={bank.bankName}
              onChange={(e) => {
                setBank({ ...bank, bankName: e.target.value });
                mark();
              }}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      <Section title="Cash on arrival">
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={cashOnArrival}
            onChange={(e) => {
              setCashOnArrival(e.target.checked);
              mark();
            }}
            className="h-4 w-4 accent-primary"
          />
          <span>
            {cashOnArrival
              ? "Allow guests to pay in cash on arrival"
              : "Disabled — advance payment required"}
          </span>
        </label>
      </Section>

      <Section title="Payment terms">
        <textarea
          value={terms}
          onChange={(e) => {
            setTerms(e.target.value);
            mark();
          }}
          rows={4}
          className="w-full rounded-md border border-border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </Section>

      <Section title="Payment history" description="From recent bookings.">
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 font-medium">Booking</th>
                <th className="px-4 py-2.5 font-medium">Guest</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Payment</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {BOOKINGS.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs">{b.id}</td>
                  <td className="px-4 py-3">{b.guest}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={b.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentPill status={b.payment} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    ₹{b.amount.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <SaveBar dirty={dirty} onSave={() => setDirty(false)} />
    </div>
  );
}
