import { useState } from "react";
import { Check } from "lucide-react";
import type { BookingDetails } from "@/components/RoomDetail";

type Payment = "UPI" | "Bank Transfer" | "Cash on Arrival";

type Props = {
  selection: BookingDetails | null;
};

export function BookingForm({ selection }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [requests, setRequests] = useState("");
  const [payment, setPayment] = useState<Payment>("UPI");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section id="booking" className="py-16 md:py-24 bg-background">
      <div className="mx-auto max-w-3xl px-4 md:px-8">
        <div className="text-center mb-10">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">Step 3</span>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold">Confirm your booking</h2>
        </div>

        {!selection && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            Select a room above to continue.
          </div>
        )}

        {selection && (
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-[var(--shadow-soft)]">
            <div className="rounded-xl bg-primary-light/40 p-4 mb-6 text-sm">
              <div className="font-medium">{selection.room.name}</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                {selection.nights} night{selection.nights > 1 ? "s" : ""} · {selection.adults} adults
                {selection.children ? ` · ${selection.children} children` : ""}
                {selection.meal !== "None" ? ` · ${selection.meal}` : ""}
              </div>
              <div className="mt-2 font-display text-xl font-semibold text-primary">
                ₹{selection.total.toLocaleString("en-IN")}
              </div>
            </div>

            {submitted ? (
              <div className="text-center py-6">
                <div className="mx-auto h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold">Request sent!</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Deepak will reach out on WhatsApp shortly to confirm your booking.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Full name" required>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                    />
                  </Field>
                  <Field label="Phone" required>
                    <input
                      required
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="input"
                    />
                  </Field>
                </div>
                <Field label="Email">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Special requests">
                  <textarea
                    rows={3}
                    value={requests}
                    onChange={(e) => setRequests(e.target.value)}
                    className="input"
                    placeholder="Arrival time, dietary needs, etc."
                  />
                </Field>
                <Field label="Payment method">
                  <div className="grid grid-cols-3 gap-2">
                    {(["UPI", "Bank Transfer", "Cash on Arrival"] as Payment[]).map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setPayment(p)}
                        className={[
                          "rounded-lg border px-3 py-2 text-xs md:text-sm font-medium transition-colors",
                          payment === p
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-accent",
                        ].join(" ")}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {payment === "UPI" && "Pay 25% via UPI to confirm. Details shared on WhatsApp."}
                    {payment === "Bank Transfer" && "Bank details will be shared after request."}
                    {payment === "Cash on Arrival" && "Pay in cash on arrival at the property."}
                  </p>
                </Field>

                <button
                  type="submit"
                  className="w-full rounded-full bg-primary py-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Confirm Request
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.625rem;
          border: 1px solid var(--border);
          background: var(--background);
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
        }
        .input:focus { outline: 2px solid var(--ring); outline-offset: 1px; }
      `}</style>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
        {required && " *"}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
