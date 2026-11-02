import { useEffect, useRef, type ReactNode } from "react";
import { label } from "./types";
export function Status({ value }: { value: string }): React.JSX.Element {
  return <span className={`status status-${value}`}>{label(value)}</span>;
}
export function Empty({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="empty">
      <span className="empty-mark" aria-hidden="true">
        ＋
      </span>
      <p>{children}</p>
    </div>
  );
}
export function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}): React.JSX.Element {
  return (
    <header className="section-title">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
export function Field({
  label: text,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}): React.JSX.Element {
  return (
    <label className="field">
      <span>{text}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="form-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Modal({
  children,
  onClose,
  titleId = "app-detail-title",
}: {
  children: ReactNode;
  onClose: () => void;
  titleId?: string;
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return (): void => {
      element?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="detail-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
