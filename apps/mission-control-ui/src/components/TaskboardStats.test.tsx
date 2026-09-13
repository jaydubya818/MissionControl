import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    tasks: {
      listAll: "tasks.listAll",
      listByWorkOrder: "tasks.listByWorkOrder",
    },
  },
}));

import { TaskboardStats } from "./TaskboardStats";

describe("TaskboardStats WorkOrder scope", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it("uses the WorkOrder-scoped task read model for every displayed count", () => {
    useQueryMock.mockImplementation((query: string) => {
      if (query === "tasks.listByWorkOrder") {
        return [
          { status: "READY", _creationTime: 1 },
          { status: "DONE", _creationTime: 1 },
        ];
      }
      return undefined;
    });

    render(
      <TaskboardStats
        projectId={"project-1" as never}
        workOrderId={"work-order-1" as never}
      />,
    );

    expect(useQueryMock).toHaveBeenCalledWith("tasks.listAll", "skip");
    expect(useQueryMock).toHaveBeenCalledWith("tasks.listByWorkOrder", {
      projectId: "project-1",
      workOrderId: "work-order-1",
    });
    expect(screen.getByText("Total").parentElement).toHaveTextContent("2 Total");
    expect(screen.getByText("Done").parentElement).toHaveTextContent("1 Done");
  });
});
