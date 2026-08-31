import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ClerkConvexDiagnostic } from "./AuthStates";

vi.mock("@clerk/react", () => ({
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
  UserButton: () => null,
  useAuth: vi.fn(),
}));

vi.mock("convex/react", () => ({ useConvexAuth: vi.fn() }));

describe("ClerkConvexDiagnostic", () => {
  it("reconnects the application after Clerk issues a valid token", async () => {
    const onReconnect = vi.fn();
    const getToken = vi.fn().mockResolvedValue("sensitive-token-value");

    render(
      <ClerkConvexDiagnostic
        getToken={getToken}
        sessionClaims={{ aud: "convex" }}
        onReconnect={onReconnect}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Reconnect Mission Control" }),
    );

    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(onReconnect).toHaveBeenCalledOnce();
  });
});
