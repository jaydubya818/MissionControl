import { SignInButton, SignOutButton, UserButton, useAuth } from "@clerk/react";
import { useConvexAuth } from "convex/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { AuthRuntimeProvider } from "./AuthRuntimeContext";
import {
  probeClerkConvexToken,
  type ClerkConvexTokenProbe,
  type ClerkTokenFetcher,
} from "./clerkConvexDiagnostic";

function AuthStateLayout({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app p-6 text-ink">
      <section className="w-full max-w-md rounded-xl border border-line bg-surface-1 p-6 shadow-xl">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-secondary">
          <ShieldCheck size={18} aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </section>
    </main>
  );
}

export function AuthConfigurationError({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <AuthStateLayout
      title="Authentication setup required"
      description={`${message} Mission Control is closed until its identity configuration is complete.`}
      action={action}
    />
  );
}

function diagnosticMessage(probe: ClerkConvexTokenProbe | null): string {
  if (!probe) {
    return "Checking whether Clerk can issue the token required by Convex.";
  }
  if (probe.status === "issued") {
    const tokenLabel =
      probe.source === "session"
        ? "audience-qualified session token"
        : "legacy Convex-template token";
    return `Clerk issued the ${tokenLabel}, but Convex rejected it. Verify the deployed issuer and audience configuration.`;
  }
  if (probe.status === "missing") {
    return probe.source === "template"
      ? "Clerk did not issue the Convex-template token. Confirm that the Convex integration is active for this Clerk instance."
      : "Clerk did not issue its audience-qualified session token. Sign out, then establish a new session.";
  }
  return `Clerk could not issue the ${probe.source === "session" ? "session" : "Convex-template"} token (error: ${probe.errorCode}).`;
}

function ClerkConvexDiagnostic({
  getToken,
  sessionClaims,
}: {
  getToken: ClerkTokenFetcher;
  sessionClaims: unknown;
}) {
  const [probe, setProbe] = useState<ClerkConvexTokenProbe | null>(null);
  const [attempt, setAttempt] = useState(0);
  const probeInput = useRef({ getToken, sessionClaims });
  probeInput.current = { getToken, sessionClaims };

  useEffect(() => {
    let active = true;
    setProbe(null);
    void probeClerkConvexToken(probeInput.current).then((result) => {
      if (active) setProbe(result);
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <div className="space-y-3" data-auth-diagnostic={probe?.status ?? "checking"}>
      <p className="text-sm leading-relaxed text-ink-secondary">
        {diagnosticMessage(probe)}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="flex h-10 flex-1 items-center justify-center rounded-lg border border-line bg-surface-2 px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Retry validation
        </button>
        <SignOutButton>
          <button
            type="button"
            className="flex h-10 flex-1 items-center justify-center rounded-lg bg-act px-4 text-sm font-semibold text-act-ink transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}

export function ClerkSessionBoundary({ children }: { children: ReactNode }) {
  const clerk = useAuth();
  const convex = useConvexAuth();

  if (!clerk.isLoaded || convex.isLoading) {
    return (
      <AuthStateLayout
        title="Verifying your session"
        description="Mission Control is validating your identity and authority before loading company data."
      />
    );
  }

  if (!clerk.isSignedIn) {
    return (
      <AuthStateLayout
        title="Sign in to Mission Control"
        description="Use your approved company identity to access governed software-delivery work."
        action={
          <SignInButton mode="modal">
            <button
              type="button"
              className="flex h-10 w-full items-center justify-center rounded-lg bg-act px-4 text-sm font-semibold text-act-ink transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign in
            </button>
          </SignInButton>
        }
      />
    );
  }

  if (!convex.isAuthenticated) {
    return (
      <AuthConfigurationError
        message="Clerk signed you in, but Convex could not validate the session token."
        action={
          <ClerkConvexDiagnostic
            getToken={clerk.getToken}
            sessionClaims={clerk.sessionClaims}
          />
        }
      />
    );
  }

  return (
    <AuthRuntimeProvider
      value={{
        mode: "clerk",
        externalUserId: clerk.userId ?? undefined,
        userControl: (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-ink-secondary">Signed in</div>
              <div className="truncate font-mono text-[9px] text-ink-muted">{clerk.userId}</div>
            </div>
            <UserButton />
          </div>
        ),
      }}
    >
      {children}
    </AuthRuntimeProvider>
  );
}
