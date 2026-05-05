import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isAuthed, login, MOCK_OWNER } from "@/admin/auth";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [{ title: "Owner login — Bleaf Mud House" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthed()) navigate({ to: "/admin/dashboard" });
  }, [navigate]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(phone, password)) {
      navigate({ to: "/admin/dashboard" });
    } else {
      setError("Invalid phone number or password.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 md:p-8 shadow-[var(--shadow-soft)]">
        <h1 className="font-display text-2xl font-semibold text-primary">Bleaf Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Owner login for {MOCK_OWNER.property}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Phone</span>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876543210"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Password</span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            />
          </label>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in
          </button>

          <p className="text-[11px] text-muted-foreground text-center">
            Demo: phone <strong>9876543210</strong> · password <strong>1234</strong>
          </p>
        </form>
      </div>
    </div>
  );
}
