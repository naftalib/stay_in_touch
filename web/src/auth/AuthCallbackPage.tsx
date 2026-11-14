import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { useAuth } from "./AuthContext.tsx";
import styles from "./AuthCallbackPage.module.css";

const EXPIRED =
  "This link has expired or was already used. Enter the 6-digit code from the email, or ask for a new link.";

function linkError(): string | null {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const description = search.get("error_description") || hash.get("error_description");
  if (search.get("error") || hash.get("error") || description) return EXPIRED;
  return null;
}

export default function AuthCallbackPage() {
  const { session } = useAuth();
  const immediateError = linkError();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (immediateError) return;
    const timer = window.setTimeout(() => {
      setTimedOut(true);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [immediateError]);

  if (session) {
    return <Navigate to="/" replace />;
  }

  const error = immediateError ?? (timedOut ? EXPIRED : null);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Signing you in</h1>
        {error ? (
          <>
            <p className={styles.error} role="alert">
              {error}
            </p>
            <Link className={styles.link} to="/sign-in">
              Back to sign-in
            </Link>
          </>
        ) : (
          <p role="status">Signing you in...</p>
        )}
      </div>
    </main>
  );
}
