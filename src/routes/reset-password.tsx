import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, KeyRound, Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase puts the recovery token in the URL hash as:
  // /reset-password#access_token=xxx&refresh_token=yyy&type=recovery
  // The Supabase JS SDK picks this up automatically via onAuthStateChange
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        // SDK has exchanged the token for a session — safe to update password now
        setSessionReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setStatus("loading");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMsg(error.message);
      setStatus("error");
      return;
    }

    setStatus("success");

    // Sign out so they log in fresh with new password
    await supabase.auth.signOut();

    setTimeout(() => {
      navigate({ to: "/admin" });
    }, 2500);
  };

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-4">
            <KeyRound className="h-5 w-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold">Set new password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a strong password for your account.
          </p>
        </div>

        {/* Waiting for token */}
        {!sessionReady && status !== "success" && (
          <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">
              Verifying your reset link…
            </p>
            <p className="text-xs text-muted-foreground">
              If this takes too long, your link may have expired. Request a new one from the login page.
            </p>
          </div>
        )}

        {/* Success state */}
        {status === "success" && (
          <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <div>
              <p className="font-medium">Password updated!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Redirecting you to login…
              </p>
            </div>
          </div>
        )}

        {/* Password form — shown once session is ready */}
        {sessionReady && status !== "success" && (
          <div className="bg-card border border-border rounded-2xl p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  New password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                    placeholder="At least 8 characters"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Confirm password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputCls}
                  placeholder="Same password again"
                  required
                />
              </div>

              {/* Password strength hint */}
              {password.length > 0 && (
                <div className="flex gap-1">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className={[
                        "h-1 flex-1 rounded-full transition-colors",
                        password.length >= (i + 1) * 3
                          ? password.length >= 12 ? "bg-primary"
                            : password.length >= 8 ? "bg-amber-400"
                            : "bg-destructive"
                          : "bg-border",
                      ].join(" ")}
                    />
                  ))}
                  <span className="text-xs text-muted-foreground ml-1 self-center">
                    {password.length < 8 ? "Too short" : password.length < 12 ? "OK" : "Strong"}
                  </span>
                </div>
              )}

              {errorMsg && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                  <p className="text-xs text-destructive">{errorMsg}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                {status === "loading" ? "Updating…" : "Set new password"}
              </button>
            </form>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Remember your password?{" "}
          <a href="/admin" className="text-primary hover:underline">
            Go to login
          </a>
        </p>
      </div>
    </div>
  );
}
