import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/test-booking")({
  component: TestBooking,
});

function TestBooking() {
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const runTests = async () => {
    setLoading(true);
    const lines: string[] = [];

    // Test 1: Check supabase URL and key prefix
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    lines.push(`URL: ${url ?? "MISSING"}`);
    lines.push(`Key prefix: ${key ? key.slice(0, 30) + "..." : "MISSING"}`);
    lines.push(`Key length: ${key?.length ?? 0}`);
    lines.push("---");

    // Test 2: Check current session/role
    const { data: sessionData } = await supabase.auth.getSession();
    lines.push(`Session: ${sessionData.session ? "authenticated" : "anon (no session)"}`);
    lines.push("---");

    // Test 3: Try reading properties (should work as anon)
    const { data: props, error: propErr } = await supabase
      .from("properties")
      .select("id, name")
      .limit(1);
    lines.push(`Properties read: ${propErr ? "FAILED - " + propErr.message : "OK - " + props?.[0]?.name}`);
    lines.push("---");

    // Test 4: Try the booking insert
    const { data: booking, error: bookErr } = await supabase
      .from("bookings")
      .insert({
        property_id: "2dd364e7-cb2c-485c-b4da-e9b7f201c66d",
        room_id: "764c2e84-c822-4ab5-9a72-c2001ea64da1",
        guest_name: "Browser Test",
        guest_phone: "+91 9999999999",
        guest_count: 2,
        check_in: "2026-06-01",
        check_out: "2026-06-03",
        room_price: 2500,
        extra_guest_charge: 0,
        total_amount: 5000,
        payment_method: "Cash on Arrival",
        status: "pending",
        is_paid: false,
      })
      .select("id")
      .single();

    if (bookErr) {
      lines.push(`Booking insert: FAILED`);
      lines.push(`Error code: ${bookErr.code}`);
      lines.push(`Error message: ${bookErr.message}`);
      lines.push(`Error details: ${bookErr.details ?? "none"}`);
      lines.push(`Error hint: ${bookErr.hint ?? "none"}`);
    } else {
      lines.push(`Booking insert: SUCCESS - id ${booking?.id}`);
      // Clean up
      await supabase.from("bookings").delete().eq("id", booking!.id);
      lines.push("Test booking deleted.");
    }

    setResult(lines.join("\n"));
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Booking Diagnostic</h1>
        <p className="text-sm text-muted-foreground">
          This page tests the Supabase connection and booking insert from the browser.
        </p>
        <button
          onClick={runTests}
          disabled={loading}
          className="rounded-lg bg-primary text-primary-foreground px-6 py-3 font-medium disabled:opacity-50"
        >
          {loading ? "Running tests..." : "Run diagnostic"}
        </button>
        {result && (
          <pre className="rounded-xl border border-border bg-muted p-4 text-xs whitespace-pre-wrap font-mono">
            {result}
          </pre>
        )}
        <p className="text-xs text-muted-foreground">
          Remove this page before going to production.
        </p>
      </div>
    </div>
  );
}
