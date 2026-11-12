import styles from './SettingsPage.module.css'

export default function SettingsPage() {
  return (
    <section className={styles.page}>
      <h1>Family settings</h1>
      <p>
        Space management, invites, and audit history will appear here. Only
        parents (admins) see this page.
      </p>
    </section>
  )
}
