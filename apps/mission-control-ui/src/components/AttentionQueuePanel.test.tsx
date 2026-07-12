import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  AttentionQueuePanel,
  ExceptionSummaryStrip,
  NeedsAttentionCard,
} from "./AttentionQueuePanel";
import type { AttentionItem } from "@/lib/attentionQueue";

const ITEMS: AttentionItem[] = [
  {
    id: "approval-1",
    title: "Deploy to production",
    detail: "Operator approval required",
    badgeLabel: "Approval",
    badgeTone: "warning",
    onOpen: vi.fn(),
    onApprove: vi.fn(),
  },
  {
    id: "blocked-1",
    title: "Fix checkout timeout",
    detail: "Waiting on dependency",
    badgeLabel: "Blocked",
    badgeTone: "warning",
    onOpen: vi.fn(),
    onUnblock: vi.fn(),
  },
];

describe("NeedsAttentionCard", () => {
  it("renders all-clear state with scan time", () => {
    render(<NeedsAttentionCard items={[]} scannedAt={Date.now()} />);
    expect(screen.getByText("All clear")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
  });

  it("renders attention rows with action buttons", () => {
    render(<NeedsAttentionCard items={ITEMS} scannedAt={Date.now()} />);
    expect(screen.getByText("Deploy to production")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unblock" })).toBeInTheDocument();
  });
});

describe("ExceptionSummaryStrip", () => {
  it("shows exception counts and clear badges", () => {
    render(
      <ExceptionSummaryStrip
        counts={{ approvals: 2, blocked: 1, failed: 0, alerts: 0 }}
        onOpenApprovals={vi.fn()}
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText("Clear").length).toBeGreaterThan(0);
  });
});

describe("AttentionQueuePanel", () => {
  it("places needs attention before exception summary strip", () => {
    const { container } = render(
      <AttentionQueuePanel
        items={ITEMS}
        scannedAt={Date.now()}
        counts={{ approvals: 1, blocked: 1, failed: 0, alerts: 0 }}
      />
    );
    const headings = [...container.querySelectorAll("h2")].map((h) => h.textContent);
    expect(headings[0]).toBe("Needs attention");
    expect(screen.getByText("Approvals")).toBeInTheDocument();
  });

  it("fires approve handler from attention row", () => {
    const onApprove = vi.fn();
    const items: AttentionItem[] = [
      {
        ...ITEMS[0],
        onApprove,
      },
    ];
    render(
      <AttentionQueuePanel
        items={items}
        scannedAt={Date.now()}
        counts={{ approvals: 1, blocked: 0, failed: 0, alerts: 0 }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalled();
  });
});
