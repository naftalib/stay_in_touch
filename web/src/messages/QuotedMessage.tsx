import { Button } from 'react-aria-components'
import type { ThreadMessage } from './types.ts'
import styles from './QuotedMessage.module.css'

type QuotedMessageProps = {
  quote: ThreadMessage | null | undefined
  onActivate: () => void
}

export default function QuotedMessage({
  quote,
  onActivate,
}: QuotedMessageProps) {
  const label = quote
    ? `${quote.authorLabel}: ${firstLine(quote.body)}`
    : 'Original message unavailable'

  return (
    <Button className={styles.quote} onPress={onActivate}>
      {label}
    </Button>
  )
}

function firstLine(body: string): string {
  const line = body.split('\n')[0] ?? body
  return line.length > 80 ? `${line.slice(0, 77)}…` : line
}
