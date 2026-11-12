import {
  Button,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components'
import styles from './DeleteMessageDialog.module.css'

type DeleteMessageDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export default function DeleteMessageDialog({
  isOpen,
  onOpenChange,
  onConfirm,
}: DeleteMessageDialogProps) {
  if (!isOpen) return null

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={styles.overlay}
    >
      <Modal className={styles.modal}>
        <Dialog className={styles.dialog}>
          <Heading slot="title" className={styles.title}>
            Delete this message?
          </Heading>
          <p>Everyone will stop seeing it.</p>
          <div className={styles.actions}>
            <Button
              className={styles.danger}
              onPress={() => {
                onConfirm()
                onOpenChange(false)
              }}
            >
              Delete
            </Button>
            <Button
              className={styles.cancel}
              onPress={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}
