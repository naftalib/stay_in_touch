import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button, Form, Input, Label, TextField } from "react-aria-components";
import { useAuth } from "./AuthContext.tsx";
import { getSupabase } from "../lib/supabase.ts";
import { mapError, type AppError } from "../lib/errors.ts";
import { rememberRecentAccount } from "./recentAccounts.ts";
import { safeReturnPath } from "./safeReturnPath.ts";
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
  const { session, user, signOut } = useAuth();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [error, setError] = useState<AppError | null>(null);
  const [code, setCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showChildPassword, setShowChildPassword] = useState(false);
  const [childPassword, setChildPassword] = useState("");
  const [joinedFamilyId, setJoinedFamilyId] = useState<string | null>(null);

  useEffect(() => {
    const token = readTokenFromLocation();
    if (!token) {
      setState({ kind: "unknown" });
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, token);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    void loadPreview(token);
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
        const message = authError.message.toLowerCase();
        if (message.includes("rate") || authError.code?.includes("rate")) {
          setError(mapError(authError));
          return;
        }
        // Invitee auth users are created by invite-send; still show the code form if
        // GoTrue returns a generic signup-policy message.
        setEmailSent(true);
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
    if (childPassword.length < 6) {
      setError({ title: "Choose at least 6 characters." });
      return;
    }
    setSubmitting(true);
    const { error: pwError } = await getSupabase().auth.updateUser({ password: childPassword });
    setSubmitting(false);
    if (pwError) {
      setError(mapError(pwError));
      return;
    }
    if (joinedFamilyId) {
      navigate(`/f/${joinedFamilyId}`, { replace: true });
    }
  }

  async function continueAsInvitee(preview: Preview) {
    sessionStorage.setItem(TOKEN_KEY, state.kind === "pending" ? state.token : "");
    await signOut();
    setState({ kind: "pending", preview, token: state.kind === "pending" ? state.token : "" });
  }

  if (state.kind === "loading") {
    return (
      <main className={styles.page}>
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
  const signedInEmail = user?.email?.toLowerCase();
  const inviteEmail = preview.email.toLowerCase();
  const wrongAccount = Boolean(signedInEmail && signedInEmail !== inviteEmail);

  if (showChildPassword) {
    return (
      <main className={styles.page}>
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
            <Label>Password (at least 6 characters)</Label>
            <Input type="password" autoComplete="new-password" />
          </TextField>
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