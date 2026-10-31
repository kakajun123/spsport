import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? "/";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res =
      mode === "login"
        ? await signIn(email, password)
        : await signUp(email, password, fullName);
    if (res.error) {
      setError(res.error);
      setBusy(false);
    } else {
      navigate(from);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold">
        {mode === "login" ? t("auth.loginTitle") : t("auth.signupTitle")}
      </h1>
      <form onSubmit={submit} className="space-y-3 rounded border bg-white p-5">
        {mode === "signup" && (
          <input
            className="w-full rounded border px-3 py-2"
            placeholder={t("auth.fullName")}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}
        <input
          type="email"
          required
          className="w-full rounded border px-3 py-2"
          placeholder={t("auth.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          minLength={6}
          className="w-full rounded border px-3 py-2"
          placeholder={t("auth.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-brand py-2 text-white hover:bg-brand-ink disabled:opacity-50"
        >
          {mode === "login" ? t("auth.login") : t("auth.signup")}
        </button>
      </form>
      <button
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
        className="mt-3 text-sm text-brand underline"
      >
        {mode === "login" ? t("auth.noAccount") : t("auth.haveAccount")}
      </button>
    </div>
  );
}
