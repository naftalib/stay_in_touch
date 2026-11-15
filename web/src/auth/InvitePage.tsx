import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button, Form, Input, Label, TextField } from "react-aria-components";
import { useAuth } from "./AuthContext.tsx";
import { getSupabase } from "../lib/supabase.ts";
import { mapError, type AppError } from "../lib/errors.ts";
import { rememberRecentAccount } from "./recentAccounts.ts";
import { safeReturnPath } from "./safeReturnPath.ts";
import { useOnlineStatus } from "../shell/useOnlineStatus.ts";
import ConnectionBanner from "../shell/ConnectionBanner.tsx";
import styles from "./InvitePage.module.css";

const TOKEN_KEY = "stay-invite-token";

type Preview = {
  status: string;
  email: string;
  family_name: string;
  inviter_name: string;
  role: string;
  label: string;
  expires_at: string;
};

type PageState =
  | { kind: "loading" }
  | { kind: "unknown" }
  | { kind: "terminal"; status: string }
  | { kind: "pending"; preview: Preview; token: string };

function readTokenFromLocation(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash) return hash;
  return sessionStorage.getItem(TOKEN_KEY);
}

export default function InvitePage() {
  const { session, user, signOut, displayName } = useAuth();
  const { offline } = useOnlineStatus();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [error, setError] = useState<AppError | null>(null);
  const [code, setCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showChildPassword, setShowChildPassword] = useState(false);
  const [childPassword, setChildPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordReady, setPasswordReady] = useState(false);
  const [joinedFamilyId, setJoinedFamilyId] = useState<string | null>(null);

  useEffect(() => {
    function loadFromLocation() {
      const token = readTokenFromLocation();
      if (!token) {
        setState({ kind: "unknown" });
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, token);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      void loadPreview(token);
    }
    loadFromLocation();
    window.addEventListener("hashchange", loadFromLocation);
    return () => window.removeEventListener("hashchange", loadFromLocation);
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [state.kind]);

  async function loadPreview(token: string) {
    setState({ kind: "loading" });
    try {
      const { data, error: rpcError } = await getSupabase().rpc("invitation_preview", {
        p_token: token,
      });
      if (rpcError) throw rpcError;
      const row = (Array.isArray(data) ? data[0] : data) as Preview | undefined;
      if (!row) {
        setState({ kind: "unknown" });
        return;
      }
      if (row.status !== "pending") {
        setState({ kind: "terminal", status: row.status });
        return;
      }
      setState({ kind: "pending", preview: row, token });
    } catch (caught) {
      setError(mapError(caught));
      setState({ kind: "unknown" });
    }
  }

  async function sendCode(email: string) {
    setSubmitting(true);
    setError(null);
    const next = safeReturnPath("/invite");
    try {
      const { error: authError } = await getSupabase().auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (authError) {
        setError(mapError(authError));
        return;
      }
      setEmailSent(true);
    } catch (caught) {
      setError(mapError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(email: string) {
    setSubmitting(true);
    setError(null);
    sessionStorage.removeItem("stay-signed-out");
    try {
      const { error: authError } = await getSupabase().auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });
      if (authError) {
        setError({ title: "That code did not work. Try again.", code: authError.code });
        return;
      }
    } catch (caught) {
      setError(mapError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function join(token: string, preview: Preview) {
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: rpcError } = await getSupabase().rpc("accept_invitation", {
        p_token: token,
      });
      if (rpcError) {
        const title =
          rpcError.code === "42501"
            ? "This invitation isn't for this account or is no longer valid."
            : rpcError.message;
        setError({ title, code: rpcError.code });
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as
        | { family_id: string; member_id: string }
        | undefined;
      if (!row?.family_id) {
        setError({ title: "Could not join this family." });
        return;
      }
      sessionStorage.removeItem(TOKEN_KEY);
      rememberRecentAccount({ email: preview.email, displayName: preview.label });
      if (preview.role === "member") {
        setJoinedFamilyId(row.family_id);
        setShowChildPassword(true);
        return;
      }
      navigate(`/f/${row.family_id}`, { replace: true });
    } catch (caught) {
      setError(mapError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveChildPassword() {
    if (childPassword.length < 8) {
      setError({ title: "Choose at least 8 characters." });
      return;
    }
    setSubmitting(true);
    const { error: pwError } = await getSupabase().auth.updateUser({ password: childPassword });
    setSubmitting(false);
    if (pwError) {
      setError(mapError(pwError));
      return;
    }
    setPasswordReady(true);
  }

  async function continueAsInvitee(preview: Preview) {
    if (user?.email) {
      const name = displayName || user.email;
      rememberRecentAccount({ email: user.email, displayName: name });
      sessionStorage.setItem(
        "stay-return-account",
        JSON.stringify({ email: user.email, displayName: name }),
      );
    }
    sessionStorage.setItem(TOKEN_KEY, state.kind === "pending" ? state.token : "");
    sessionStorage.setItem("stay-return-to-invite", "1");
    await signOut();
    setState({ kind: "pending", preview, token: state.kind === "pending" ? state.token : "" });
  }

  function returnAccountName(fallback: string): string {
    try {
      const raw = sessionStorage.getItem("stay-return-account");
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as { displayName?: string };
      return parsed.displayName || fallback;
    } catch {
      return fallback;
    }
  }

  if (state.kind === "loading") {
    return (
      <main className={styles.page}>
        {offline ? <ConnectionBanner offline /> : null}
        <h1 ref={headingRef} tabIndex={-1}>
          Checking your invitation…
        </h1>
      </main>
    );
  }

  if (state.kind === "unknown") {
    return (
      <main className={styles.page}>
        <h1 ref={headingRef} tabIndex={-1}>
          This invitation link isn't valid
        </h1>
        <p>Ask the person who invited you to send a new one.</p>
        {error ? (
          <p role="alert" className={styles.error}>
            {error.title}
          </p>
        ) : null}
      </main>
    );
  }

  if (state.kind === "terminal") {
    const message =
      state.status === "expired"
        ? "This invitation has expired."
        : state.status === "revoked"
          ? "This invitation was cancelled."
          : state.status === "accepted"
            ? "You've already joined."
            : "This invitation is no longer available.";
    return (
      <main className={styles.page}>
        <h1 ref={headingRef} tabIndex={-1}>
          {message}
        </h1>
        {state.status === "accepted" ? (
          <Link className={styles.primary} to="/sign-in">
            Sign in
          </Link>
        ) : null}
      </main>
    );
  }

  const { preview, token } = state;
  const signedInEmail = user?.email?.trim().toLowerCase();
  const inviteEmail = preview.email.trim().toLowerCase();
  const wrongAccount = Boolean(signedInEmail && signedInEmail !== inviteEmail);

  if (showChildPassword && passwordReady) {
    const backTo = returnAccountName("the previous account");
    return (
      <main className={styles.page}>
        <h1 ref={headingRef} tabIndex={-1}>
          {preview.label} is ready
        </h1>
        <p>
          {preview.label} can now sign in with {preview.email} and this password.
        </p>
        <div className={styles.actions}>
          <Button
            className={styles.primary}
            onPress={() => joinedFamilyId && navigate(`/f/${joinedFamilyId}`, { replace: true })}
          >
            Stay signed in as {preview.label}
          </Button>
          <Button className={styles.secondary} onPress={() => void signOut()}>
            Switch back to {backTo}
          </Button>
        </div>
      </main>
    );
  }

  if (showChildPassword) {
    return (
      <main className={styles.page}>
        {offline ? <ConnectionBanner offline /> : null}
        <h1 ref={headingRef} tabIndex={-1}>
          Choose a password for {preview.label}
        </h1>
        <p>{preview.label} can sign in with {preview.email} and this password.</p>
        <Form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void saveChildPassword();
          }}
        >
          <TextField
            isRequired
            className={styles.field}
            value={childPassword}
            onChange={setChildPassword}
          >
            <Label>Password (at least 8 characters)</Label>
            <Input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} />
          </TextField>
          <Button type="button" className={styles.secondary} onPress={() => setShowPassword((value) => !value)}>
            {showPassword ? "Hide password" : "Show password"}
          </Button>
          {error ? (
            <p role="alert" className={styles.error}>
              {error.title}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Button type="submit" className={styles.primary} isDisabled={submitting}>
              Save password
            </Button>
            <Button
              type="button"
              className={styles.secondary}
              onPress={() => joinedFamilyId && navigate(`/f/${joinedFamilyId}`, { replace: true })}
            >
              Skip for now
            </Button>
          </div>
        </Form>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {offline ? <ConnectionBanner offline /> : null}
      <h1 ref={headingRef} tabIndex={-1}>
        Join {preview.family_name}
      </h1>
      <p className={styles.lead}>
        {preview.inviter_name} invited you to join <strong>{preview.family_name}</strong> as{" "}
        {preview.label}.
      </p>
      <p className={styles.email}>Email: {preview.email}</p>

      {error ? (
        <p role="alert" className={styles.error}>
          {error.title}
        </p>
      ) : null}

      {wrongAccount ? (
        <section className={styles.panel}>
          <p>
            This invitation is for {preview.email}. You're signed in as {user?.email}.
          </p>
          <Button
            className={styles.primary}
            onPress={() => void continueAsInvitee(preview)}
          >
            Continue as {preview.label}
          </Button>
        </section>
      ) : session ? (
        <Button className={styles.primary} isDisabled={submitting} onPress={() => void join(token, preview)}>
          Join {preview.family_name}
        </Button>
      ) : offline ? (
        <Button className={styles.primary} onPress={() => void loadPreview(token)}>
          Try again
        </Button>
      ) : (
        <section className={styles.panel}>
          {!emailSent ? (
            <>
              <Button
                className={styles.primary}
                isDisabled={submitting}
                onPress={() => void sendCode(preview.email)}
              >
                Email me a sign-in code
              </Button>
              <Link className={styles.secondaryLink} to={`/sign-in?next=/invite&email=${encodeURIComponent(preview.email)}`}>
                I have a password
              </Link>
            </>
          ) : (
            <Form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                void verifyCode(preview.email);
              }}
            >
              <TextField isRequired className={styles.field} value={code} onChange={setCode}>
                <Label>6-digit code</Label>
                <Input inputMode="numeric" autoComplete="one-time-code" />
              </TextField>
              <Button type="submit" className={styles.primary} isDisabled={submitting}>
                Continue
              </Button>
            </Form>
          )}
        </section>
      )}
    </main>
  );
}