import { useState } from 'react'
import { Button } from 'react-aria-components'
import styles from './App.module.css'

export default function App() {
  const [acknowledged, setAcknowledged] = useState(false)

  return (
    <main className={styles.shell}>
      <h1>Stay In Touch</h1>
      <p className={styles.lede}>
        A private, invite-only place for one family. This page is a placeholder.
        Signing in, spaces, and photos are not built yet.
      </p>
      <Button className={styles.button} onPress={() => setAcknowledged(true)}>
        This is a placeholder
      </Button>
      {acknowledged ? (
        <p className={styles.note} role="status">
          The database is ready. The app UI comes next.
        </p>
      ) : null}
    </main>
  )
}
