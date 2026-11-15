import { useEffect, useRef } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import styles from "./ConfirmDialog.module.css";

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel: string;
};

export default function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose: (confirmed: boolean) => void;
}) {
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!request) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      opener.current?.focus();
    };
  }, [request]);

  if (!request) return null;

  return (
    <ModalOverlay
      isOpen
      isDismissable
      className={styles.overlay}
      onOpenChange={(open) => {
        if (!open) onClose(false);
      }}
    >
      <Modal className={styles.modal}>
        <Dialog className={styles.dialog} role="alertdialog">
          <Heading slot="title">{request.title}</Heading>
          <p>{request.body}</p>
          <div className={styles.actions}>
            <Button className={styles.primary} autoFocus onPress={() => onClose(true)}>
              {request.confirmLabel}
            </Button>
            <Button className={styles.secondary} onPress={() => onClose(false)}>
              Go back
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
