import styles from './NewMessageAnnouncer.module.css'

type NewMessageAnnouncerProps = {
  announcement: string
}

export default function NewMessageAnnouncer({
  announcement,
}: NewMessageAnnouncerProps) {
  return (
    <div
      className={styles.announcer}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {announcement}
    </div>
  )
}
