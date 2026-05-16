import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) ?? "",
  }),
});

type Step = "validating" | "invalid" | "ready" | "saving" | "done" | "error";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-sm p-6">
        <div className="mb-5">
          <span className="font-display text-primary font-semibold text-lg">
            VattavadaStays
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

function SetupPage() {
  const { token } = useSearch({ from: "/setup" });
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("validating");
  const [propertyId, setPropertyId] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStep("invalid");
      return;
    }

    async function validate() {
      try {
        const { data, error: rpcErr } = await supabase.rpc("get_invite_by_token", {
          p_token: token,
        });
        const row = Array.isArray(data) ? data[0] : data;
        if (rpcErr || !row) {
          setStep("invalid");
          return;
        }
        if (row.used_at) {
          setStep("invalid");
          return;
        }
        if (new Date(row.expires_at) < new Date()) {
          setStep("invalid");
          return;
        }
        setOwnerEmail(row.email);
        setPropertyName(row.property_name ?? "your property");
        setPropertyId(row.property_id);
        setStep("ready");
      } catch {
        setStep("invalid");
      }
    }
    validate();
  }, [token]);

  const strengthScore = (() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strengthScore];
  const strengthColor = [
    "",
    "bg-destructive",
    "bg-yellow-400",
    "bg-blue-400",
    "bg-primary",
  ][strengthScore];

  const handleSetPassword = async () => {
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setStep("saving");

    try {
      const response = await fetch(
        "https://vzzfqgqxnodlrvnaxpbw.supabase.co/functions/v1/create-owner",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: ownerEmail,
            password,
            property_id: propertyId,
            token,
          }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to create account");
      setStep("done");
      setTimeout(() => {
        navigate({ to: "/login", search: { email: ownerEmail } });
      }, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setStep("ready");
    }
  };

  if (step === "validating") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking your invite link…</p>
        </div>
      </Shell>
    );
  }

  if (step === "invalid") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <XCircle className="h-10 w-10 text-destructive" />
          <h2 className="font-display text-lg font-semibold">Invalid or expired link</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            This invite link has already been used or has expired. Ask your platform
            admin for a new one.
          </p>
        </div>
      </Shell>
    );
  }

  if (step === "done") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-primary" />
          <h2 className="font-display text-lg font-semibold">You're all set!</h2>
          <p className="text-sm text-muted-foreground">Taking you to the login page…</p>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-1" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-1 mb-6">
        <h1 className="font-display text-2xl font-semibold">Welcome to VattavadaStays</h1>
        <p className="text-sm text-muted-foreground">
          Set a password for{" "}
          <span className="font-medium text-foreground">{ownerEmail}</span> to access
          the{" "}
          <span className="font-medium text-foreground">{propertyName}</span> dashboard.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Password
          </label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputCls} pr-10`}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPw ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {password.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={[
                      "h-1 flex-1 rounded-full transition-colors",
                      i <= strengthScore ? strengthColor : "bg-muted",
                    ].join(" ")}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{strengthLabel}</p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Confirm password
          </label>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`${inputCls} pr-10`}
              placeholder="Repeat your password"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirm ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {confirm.length > 0 && password !== confirm && (
            <p className="text-xs text-destructive mt-1">Passwords don't match</p>
          )}
        </div>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={handleSetPassword}
          disabled={step === "saving" || !password || !confirm}
          className="w-full rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {step === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {step === "saving" ? "Setting up your account…" : "Create account & continue"}
        </button>
      </div>
    </Shell>
  );
}
