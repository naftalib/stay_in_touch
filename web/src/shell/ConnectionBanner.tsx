import styles from './ConnectionBanner.module.css'

type ConnectionBannerProps = {
  paused?: boolean
  offline?: boolean
}

export default function ConnectionBanner({
  paused,
  offline,
}: ConnectionBannerProps) {
  if (!paused && !offline) return null

  const text = offline
    ? "You're offline. You can read messages you've already loaded. New messages will appear when you're back online."
    : 'Live updates paused. Reconnecting…'

  return (
    <div className={styles.banner} role="status">
      {text}
    </div>
  )
}
