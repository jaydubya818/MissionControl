import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  AnalyticsViewContent,
  type ActivityHeatmapData,
  type DailyModelCost,
  type KpiSummary,
} from "./AnalyticsView";

function kpis(overrides: Partial<KpiSummary> = {}): KpiSummary {
  return {
    runs: { value: 128, delta: 12 },
    tasksCompleted: { value: 42, delta: -4 },
    costUsd: { value: 17.5, delta: 3.25 },
    policyDenials: { value: 3, delta: 2 },
    ...overrides,
  };
}

function dailyCost(overrides: Partial<DailyModelCost> = {}): DailyModelCost {
  return {
    days: [
      { date: "2026-07-09", series: { "claude-sonnet-4-5": 1.2, "claude-haiku-4-5": 0.3 } },
      { date: "2026-07-10", series: { "claude-sonnet-4-5": 2.1, "claude-haiku-4-5": 0.1 } },
      { date: "2026-07-11", series: { "claude-sonnet-4-5": 0.8, "claude-haiku-4-5": 0.4 } },
    ],
    models: ["claude-sonnet-4-5", "claude-haiku-4-5"],
    ...overrides,
  };
}

function heatmap(overrides: Partial<ActivityHeatmapData> = {}): ActivityHeatmapData {
  return {
    days: [
      { date: "2026-07-05", count: 0 },
      { date: "2026-07-06", count: 2 },
      { date: "2026-07-07", count: 5 },
      { date: "2026-07-08", count: 1 },
      { date: "2026-07-09", count: 0 },
      { date: "2026-07-10", count: 7 },
      { date: "2026-07-11", count: 3 },
    ],
    stats: {
      mostActiveMonth: "July 2026",
      mostActiveDay: "Friday",
      longestStreakDays: 3,
      currentStreakDays: 2,
    },
    ...overrides,
  };
}

function renderContent(
  props: Partial<Parameters<typeof AnalyticsViewContent>[0]> = {}
): ReturnType<typeof render> {
  return render(
    <AnalyticsViewContent
      kpis={kpis()}
      dailyCost={dailyCost()}
      heatmap={heatmap()}
      periodDays={30}
      onPeriodChange={vi.fn()}
      {...props}
    />
  );
}

describe("AnalyticsViewContent", () => {
  it("renders the KPI band with labels and values", () => {
    renderContent();
    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("Tasks Completed")).toBeInTheDocument();
    expect(screen.getByText("Spend")).toBeInTheDocument();
    expect(screen.getByText("Policy Denials")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("$17.50")).toBeInTheDocument();
  });

  it("colors positive deltas green and negative deltas red", () => {
    renderContent();
    expect(screen.getByText("+12").className).toContain("text-ok");
    expect(screen.getByText("-4").className).toContain("text-err");
    expect(screen.getByText("+$3.25").className).toContain("text-ok");
  });

  it("inverts delta coloring for policy denials — more denials is bad", () => {
    renderContent();
    expect(screen.getByText("+2").className).toContain("text-err");
  });

  it("colors a drop in policy denials green", () => {
    renderContent({
      kpis: kpis({ policyDenials: { value: 1, delta: -5 } }),
    });
    expect(screen.getByText("-5").className).toContain("text-ok");
  });

  it("renders the period control as a tablist and reports changes", () => {
    const onPeriodChange = vi.fn();
    renderContent({ onPeriodChange });
    const tablist = screen.getByRole("tablist", { name: "Period" });
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "30d" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    fireEvent.click(screen.getByRole("tab", { name: "7d" }));
    expect(onPeriodChange).toHaveBeenCalledWith(7);
  });

  it("renders the chart legend with model names", () => {
    renderContent();
    expect(screen.getByText("claude-sonnet-4-5")).toBeInTheDocument();
    expect(screen.getByText("claude-haiku-4-5")).toBeInTheDocument();
  });

  it("renders heatmap cells and the stats row", () => {
    renderContent();
    expect(screen.getAllByTestId("heatmap-cell").length).toBe(7);
    expect(screen.getByText("Most Active Month")).toBeInTheDocument();
    expect(screen.getByText("July 2026")).toBeInTheDocument();
    expect(screen.getByText("Friday")).toBeInTheDocument();
    expect(screen.getByText("3 days")).toBeInTheDocument();
    expect(screen.getByText("2 days")).toBeInTheDocument();
  });

  it("renders em-dashes for missing streak stats", () => {
    renderContent({
      heatmap: heatmap({
        days: [{ date: "2026-07-11", count: 4 }],
        stats: {
          mostActiveMonth: null,
          mostActiveDay: null,
          longestStreakDays: 0,
          currentStreakDays: 0,
        },
      }),
    });
    expect(screen.getAllByText("—").length).toBe(4);
  });

  it("shows the empty state when there is no data at all", () => {
    renderContent({
      kpis: {
        runs: { value: 0, delta: 0 },
        tasksCompleted: { value: 0, delta: 0 },
        costUsd: { value: 0, delta: 0 },
        policyDenials: { value: 0, delta: 0 },
      },
      dailyCost: { days: [], models: [] },
      heatmap: {
        days: [{ date: "2026-07-11", count: 0 }],
        stats: {
          mostActiveMonth: null,
          mostActiveDay: null,
          longestStreakDays: 0,
          currentStreakDays: 0,
        },
      },
    });
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("shows pulse skeletons while any query is loading", () => {
    const { container } = renderContent({ kpis: undefined });
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByText("Runs")).not.toBeInTheDocument();
  });
});
