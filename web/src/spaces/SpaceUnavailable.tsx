import { Link } from 'react-router'
import styles from './SpaceUnavailable.module.css'

type SpaceUnavailableProps = {
  familyId: string
  generalTo?: string
}

export default function SpaceUnavailable({
  familyId,
  generalTo,
}: SpaceUnavailableProps) {
  const generalHref = generalTo ?? `/f/${familyId}`

  return (
    <section className={styles.root} aria-labelledby="unavailable-title">
      <h1 id="unavailable-title">This space isn&apos;t available</h1>
      <p>You may not have permission to view it, or it may not exist.</p>
      <Link to={generalHref} className={styles.link}>
        Go to General
      </Link>
    </section>
  )
}
