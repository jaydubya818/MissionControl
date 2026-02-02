export function SetupMessage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>Mission Control</h1>
      <p style={{ margin: "0 0 16px", color: "#94a3b8" }}>
        Convex is not configured. The UI needs a backend URL to load tasks.
      </p>
      <ol
        style={{
          margin: 0,
          paddingLeft: 20,
          color: "#cbd5e1",
          fontSize: "0.875rem",
          lineHeight: 1.8,
        }}
      >
        <li>Run <code style={{ background: "#1e293b", padding: "2px 6px", borderRadius: 4 }}>npx convex dev</code> in the project root and sign in if prompted.</li>
        <li>In the repo root, create or edit <code style={{ background: "#1e293b", padding: "2px 6px", borderRadius: 4 }}>.env.local</code>.</li>
        <li>Add <code style={{ background: "#1e293b", padding: "2px 6px", borderRadius: 4 }}>VITE_CONVEX_URL=https://your-deployment.convex.cloud</code> (use the URL from the Convex dashboard or <code>.env.local</code> after <code>convex dev</code>).</li>
        <li>Restart the dev server: <code style={{ background: "#1e293b", padding: "2px 6px", borderRadius: 4 }}>pnpm run dev:ui</code>.</li>
      </ol>
      <p style={{ marginTop: 24, color: "#64748b", fontSize: "0.8rem" }}>
        If you already set VITE_CONVEX_URL, make sure it’s in the repo root <code>.env.local</code> and that you restarted the UI after adding it.
      </p>
    </div>
  );
}
