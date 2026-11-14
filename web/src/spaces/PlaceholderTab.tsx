import styles from './PlaceholderTab.module.css'

type PlaceholderTabProps = {
  kind: 'pics' | 'video'
}

const COPY = {
  pics: {
    title: 'Photos',
    body: 'Photos are coming soon.',
  },
  video: {
    title: 'Video',
    body: 'Video is coming soon.',
  },
} as const

export default function PlaceholderTab({ kind }: PlaceholderTabProps) {
  const { title, body } = COPY[kind]

  return (
    <section className={styles.root} aria-labelledby="placeholder-title">
      <h2 id="placeholder-title">{title}</h2>
      <p className={styles.empty}>{body}</p>
    </section>
  )
}
