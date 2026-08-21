import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MobileOverlay } from "./MobileOverlay";

afterEach(cleanup);

describe("MobileOverlay", () => {
  it("announces itself as a named modal dialog", () => {
    // The compact shell's nav and chat panels were plain divs: a screen reader
    // was never told a modal had opened, and the panel had no name.
    render(
      <MobileOverlay label="Navigation" dismissLabel="Close navigation" onDismiss={() => {}}>
        <button type="button">Work Orders</button>
      </MobileOverlay>,
    );
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("closes on Escape, not only by clicking the scrim", () => {
    const onDismiss = vi.fn();
    render(
      <MobileOverlay label="Chat" dismissLabel="Close chat" onDismiss={onDismiss}>
        <button type="button">Send</button>
      </MobileOverlay>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the panel on open", () => {
    render(
      <MobileOverlay label="Navigation" dismissLabel="Close navigation" onDismiss={() => {}}>
        <button type="button">Work Orders</button>
      </MobileOverlay>,
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Work Orders" }));
  });

  it("keeps Tab inside the panel instead of walking into the page behind it", () => {
    render(
      <MobileOverlay label="Navigation" dismissLabel="Close navigation" onDismiss={() => {}}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </MobileOverlay>,
    );
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });

  it("restores focus to the trigger when it closes", () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button" id="trigger">
            Open nav
          </button>
          {open ? (
            <MobileOverlay label="Navigation" dismissLabel="Close navigation" onDismiss={() => {}}>
              <button type="button">Work Orders</button>
            </MobileOverlay>
          ) : null}
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    const trigger = screen.getByRole("button", { name: "Open nav" });
    trigger.focus();
    rerender(<Harness open />);
    expect(document.activeElement).not.toBe(trigger);
    rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(trigger);
  });
});
