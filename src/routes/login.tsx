import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    email: (search.email as string) ?? "",
  }),
});

function LoginPage() {
  const { email: prefilledEmail } = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");

  useEffect(() => { if (prefilledEmail && !email) setEmail(prefilledEmail); }, [prefilledEmail, email]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const emailValue = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const errEl = document.getElementById("loginerr");
    const { error } = await supabase.auth.signInWithPassword({ email: emailValue, password });
    if (error) { if (errEl) errEl.textContent = error.message; }
    else { window.location.href = "/admin/dashboard"; }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f4", padding: "16px" }}>
      <div style={{ background: "white", borderRadius: "16px", padding: "32px", width: "100%", maxWidth: "380px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <h1 style={{ color: "#166534", fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>VattavadaStays</h1>
        <p style={{ color: "#78716c", fontSize: "14px", marginBottom: "24px" }}>Owner login</p>
        <p id="loginerr" style={{ color: "#dc2626", fontSize: "13px", marginBottom: "12px" }}></p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="email" style={{ display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#78716c", marginBottom: "6px" }}>Email</label>
            <input id="email" name="email" type="email" placeholder="owner@example.com" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid #d4d4d0", borderRadius: "8px", fontSize: "16px", background: "white", color: "#1c1917", WebkitAppearance: "none", appearance: "none" as any }} />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="password" style={{ display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#78716c", marginBottom: "6px" }}>Password</label>
            <input id="password" name="password" type="password" placeholder="••••••••" autoComplete="current-password" required style={{ width: "100%", padding: "10px 12px", border: "1px solid #d4d4d0", borderRadius: "8px", fontSize: "16px", background: "white", color: "#1c1917", WebkitAppearance: "none", appearance: "none" as any }} />
          </div>
          <button type="submit" style={{ width: "100%", padding: "14px", background: "#166534", color: "white", border: "none", borderRadius: "100px", fontSize: "15px", fontWeight: 600, cursor: "pointer", marginTop: "8px" }}>Sign in</button>
        </form>
      </div>
    </div>
  );
}
