/**
 * Modal overlay for the compact (mobile) shell.
 *
 * ## Why this exists
 *
 * The compact shell's two overlays — navigation and the chat dock — were plain
 * `<div className="fixed inset-0 z-50">` panels over a full-screen scrim
 * button. That meant:
 *
 * - No `role="dialog"` / `aria-modal`, so a screen reader announced them as
 *   ordinary content and never told the user a modal had opened.
 * - No accessible name.
 * - Escape did nothing; the only way out was hitting the scrim, which is a
 *   pointer-only target.
 * - No focus management: focus stayed on the trigger behind the scrim, and Tab
 *   walked straight through the overlay into the page underneath — a keyboard
 *   user could operate controls they could not see.
 *
 * WCAG 2.2: 2.1.2 (No Keyboard Trap / escapable), 2.4.3 (Focus Order),
 * 4.1.2 (Name, Role, Value).
 *
 * This component supplies dialog semantics, Escape-to-close, an initial focus
 * target, a Tab cycle bounded by the panel, and focus restoration to whatever
 * was focused before it opened.
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface MobileOverlayProps {
  /** Accessible name — required; a dialog with no name is unusable non-visually. */
  label: string;
  /** Scrim button label, e.g. "Close navigation". */
  dismissLabel: string;
  onDismiss: () => void;
  /** Panel alignment within the viewport. */
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}

export function MobileOverlay({
  label,
  dismissLabel,
  onDismiss,
  align = "start",
  className,
  children,
}: MobileOverlayProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Remember what to restore focus to, and move focus into the panel.
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        // `offsetParent` is not usable here: it is always null in jsdom, and
        // null for `position: fixed` elements in browsers. Filter on the
        // attributes that actually remove an element from the tab order.
        (element) =>
          element.getAttribute("aria-hidden") !== "true" && !element.hasAttribute("hidden"),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Cycle within the panel rather than escaping into the page behind it.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onDismiss],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`fixed inset-0 z-50 flex ${align === "end" ? "justify-end" : "justify-start"}`}
    >
      <button
        type="button"
        aria-label={dismissLabel}
        className="absolute inset-0 bg-black/65"
        onClick={onDismiss}
      />
      <div ref={panelRef} tabIndex={-1} className={`relative z-10 h-full shadow-2xl ${className ?? ""}`}>
        {children}
      </div>
    </div>
  );
}
