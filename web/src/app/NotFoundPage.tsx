import { Link } from 'react-router'
import styles from './NotFoundPage.module.css'

export default function NotFoundPage() {
  return (
    <main className={styles.page}>
      <h1>Page not found</h1>
      <p>This address does not match anything in the app.</p>
      <Link to="/">Go home</Link>
    </main>
  )
}
