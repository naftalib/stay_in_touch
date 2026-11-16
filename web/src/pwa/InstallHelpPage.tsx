import { Link } from "react-router";
import styles from "./InstallHelpPage.module.css";

export default function InstallHelpPage() {
  return (
    <main className={styles.page} id="main-content">
      <h1>Add Stay In Touch to your Home Screen</h1>
      <p>On iPhone and iPad, notifications only work when you open the app from the Home Screen.</p>
      <ol className={styles.steps}>
        <li>
          <ShareIcon />
          <span>Tap Share in Safari.</span>
        </li>
        <li>
          <AddIcon />
          <span>Tap Add to Home Screen.</span>
        </li>
        <li>
          <HomeIcon />
          <span>Open Stay In Touch from the new icon.</span>
        </li>
      </ol>
      <p>
        <Link to="/">Back</Link>
      </p>
    </main>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={styles.icon}>
      <rect x="8" y="14" width="32" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M24 8v18M18 14l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={styles.icon}>
      <rect x="8" y="8" width="32" height="32" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M24 16v16M16 24h16" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={styles.icon}>
      <path d="M8 22 L24 8 L40 22 V40 H8 Z" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
