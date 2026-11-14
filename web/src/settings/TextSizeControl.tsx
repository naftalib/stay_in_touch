import { Label, Radio, RadioGroup } from 'react-aria-components'
import { useTextSize, type TextSize } from './useTextSize.ts'
import styles from './TextSizeControl.module.css'

const OPTIONS: { value: TextSize; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
  { value: 'extraLarge', label: 'Extra large' },
]

export default function TextSizeControl() {
  const { size, setSize } = useTextSize()

  return (
    <RadioGroup
      className={styles.group}
      value={size}
      onChange={(value) => setSize(value as TextSize)}
      aria-label="Text size"
    >
      <Label className={styles.label}>Text size</Label>
      <div className={styles.options}>
        {OPTIONS.map((opt) => (
          <Radio key={opt.value} value={opt.value} className={styles.radio}>
            {opt.label}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  )
}
