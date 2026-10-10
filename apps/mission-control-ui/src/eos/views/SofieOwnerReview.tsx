import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useLocation, useNavigate } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useAuthRuntime } from "../../auth/AuthRuntimeContext";

type Review = FunctionReturnType<typeof api.sofieOwnerReview.inspect>;
export function SofieOwnerReview({ projectId }: { projectId: Id<"projects"> }) {
  const auth = useAuthRuntime();
  if (auth.mode !== "clerk")
    return (
      <section
        aria-label="Sofie owner decisions"
        className="rounded-xl border border-line p-4"
      >
        <h2 className="font-semibold">Sofie owner decisions</h2>
        <p>
          Sign in with your MissionControl owner account to review linked
          proposals.
        </p>
      </section>
    );
  return <OwnerReview projectId={projectId} />;
}
function OwnerReview({ projectId }: { projectId: Id<"projects"> }) {
  const location = useLocation(),
    navigate = useNavigate();
  const params = new URLSearchParams(location.search),
    proposalId = params.get("proposal"),
    digest = params.get("proposalDigest");
  const rows = useQuery(api.sofieOwnerReview.list, { projectId });
  const inspect = useMutation(api.sofieOwnerReview.inspect),
    decide = useMutation(api.sofieEnterprise.decide);
  const authorizeResult = useMutation(api.sofieOwnerReview.authorizeResultRead),
    decideResult = useMutation(api.sofieOwnerReview.decideResult);
  const [review, setReview] = useState<Review | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [now, setNow] = useState(Date.now);
  const generation = useRef(0),
    pending = useRef(false),
    decisionKey = useRef(crypto.randomUUID());
  const load = useCallback(async () => {
    const current = ++generation.current;
    setReview(null);
    setError("");
    if (!proposalId || !digest) return;
    try {
      const result = await inspect({
        projectId,
        proposalId: proposalId as Id<"enterpriseMissionProposals">,
        expectedDigest: digest,
      });
      if (current === generation.current) setReview(result);
    } catch {
      if (current === generation.current)
        setError(
          "This proposal is unavailable, expired, or outside your owner authority. Check the selected workspace and sign-in.",
        );
    }
  }, [inspect, projectId, proposalId, digest]);
  useEffect(() => {
    setNotice("");
    setReason("");
    decisionKey.current = crypto.randomUUID();
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const act = async (
    action: "AUTHORIZE_DRAFT" | "REVOKE" | "READ" | "ACCEPT" | "REJECT",
  ) => {
    if (!review || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const current = generation.current;
    const binding = {
      projectId,
      proposalId: review.proposalId,
      expectedDigest: review.digest,
    };
    try {
      if (action === "AUTHORIZE_DRAFT" || action === "REVOKE") {
        await decide({
          ...binding,
          connectionId: review.connectionId,
          decision: action,
        });
      } else {
        if (!review.result || !review.missionId || !review.resultDigest)
          throw Error("Current Result is required");
        const resultBinding = {
          ...binding,
          missionId: review.missionId,
          expectedPlanDigest: review.result.plan.planDigest,
        };
        if (action === "READ") await authorizeResult(resultBinding);
        else
          await decideResult({
            ...resultBinding,
            expectedResultDigest: review.resultDigest,
            decision: action,
            reason,
            idempotencyKey: decisionKey.current,
          });
      }
      if (current === generation.current) {
        setNotice(
          action === "AUTHORIZE_DRAFT"
            ? "Creation authorized. Return to the same Sofie conversation and refresh to create this draft."
            : action === "REVOKE"
              ? "Proposal rejected. Sofie cannot create it."
              : action === "READ"
                ? "Sofie may read this exact Mission and Plan."
                : `Result ${action === "ACCEPT" ? "accepted" : "rejected"}.`,
        );
        decisionKey.current = crypto.randomUUID();
        await load();
      }
    } catch {
      if (current === generation.current)
        setError(
          "The decision was not confirmed. Refresh to inspect the current state before retrying; stale or unauthorized evidence cannot be accepted.",
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const select = (id: string, value: string) => {
    const next = new URLSearchParams(location.search);
    next.set("proposal", id);
    next.set("proposalDigest", value);
    navigate({ pathname: "/v2/missions", search: next.toString() });
  };
  useEffect(() => {
    const missionId = new URLSearchParams(location.search).get("reviewMission");
    const match =
      !proposalId && missionId && rows?.find((p) => p.missionId === missionId);
    if (match) select(match.id, match.digest);
  }, [rows, proposalId, location.search]);
  const currentResult =
    review?.result &&
    review.result.status === "AVAILABLE" &&
    now < review.result.freshUntil;
  return (
    <section
      aria-label="Sofie owner decisions"
      className="space-y-4 rounded-xl border border-line bg-surface-1 p-4 text-sm text-ink"
    >
      <h2 className="text-lg font-semibold">Sofie owner decisions</h2>
      <p>
        Review with your MissionControl owner session. Draft creation does not
        authorize execution.
      </p>
      {rows === undefined ? (
        <p role="status">Loading proposals…</p>
      ) : rows.length === 0 ? (
        <p>No linked proposals in this workspace.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {rows.map((p) => (
            <li key={p.id}>
              <Button disabled={busy} onClick={() => select(p.id, p.digest)}>
                {p.title}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {proposalId && (
        <Button disabled={busy} onClick={() => void load()}>
          Refresh owner review
        </Button>
      )}
      {proposalId && !review && !error && (
        <p role="status">Loading owner review…</p>
      )}
      {review && (
        <>
          <h3 className="font-semibold">{review.proposal.title}</h3>
          <p>{review.proposal.objective}</p>
          <p>Proposal: {review.status}</p>
          <ul className="list-disc ps-5">
            {review.proposal.workstreams.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p>Stop condition: {review.proposal.stopCondition}</p>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2">
              Linked identity
            </summary>
            <p className="break-all">Proposal {review.proposalId}</p>
            <p className="break-all">Digest {review.digest}</p>
            <p className="break-all">
              Mission {review.missionId ?? "Not created"}
            </p>
          </details>
          {["PENDING", "AUTHORIZED"].includes(review.status) && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || review.status === "AUTHORIZED"}
                onClick={() => void act("AUTHORIZE_DRAFT")}
              >
                Authorize Mission creation
              </Button>
              <Button disabled={busy} onClick={() => void act("REVOKE")}>
                Reject proposal
              </Button>
            </div>
          )}
          {review.detail && (
            <section aria-label="Linked Mission status" className="space-y-2">
              <h3 className="font-semibold">
                Mission status: {review.detail.mission.state}
              </h3>
              <p>{review.detail.needsYou}</p>
              <p>
                {review.detail.plan
                  ? `Plan ${review.detail.plan.revision}: ${review.detail.plan.status}`
                  : "Plan not prepared."}
              </p>
              <a
                className="inline-flex min-h-11 items-center underline focus-visible:outline-2"
                href={`/v2/missions/${review.missionId}?workspace=${encodeURIComponent(projectId)}`}
              >
                Open Mission and Plan
              </a>
              <h4 className="font-semibold">WorkOrders</h4>
              {review.detail.workOrders.length === 0 ? (
                <p>No WorkOrders yet.</p>
              ) : (
                <ul>
                  {review.detail.workOrders.map((w) => (
                    <li key={w.id} className="break-words">
                      {w.title}: {w.state} — {w.id}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {review.result && (
            <section aria-label="Owner Result and Proof" className="space-y-3">
              <h3 className="font-semibold">Result / Proof</h3>
              <p role="status">
                {currentResult
                  ? "Current enterprise Quality Gate: PASS"
                  : "Current Result unavailable. Refresh before deciding."}
              </p>
              <p>Owner acceptance: {review.result.ownerAcceptance}</p>
              <p>
                Evidence expires{" "}
                {new Date(review.result.freshUntil).toLocaleString()}.
              </p>
              {review.result.reasons.map((r) => (
                <p key={r}>{r}</p>
              ))}
              <ul>
                {review.result.workOrders.map((w) => (
                  <li key={w.workOrderId} className="my-3 break-all">
                    WorkOrder {w.workOrderId}
                    <br />
                    Candidate {w.candidate}
                    <br />
                    Verifier {w.verificationAttemptId}
                    <br />
                    Evidence {w.evidenceSetDigest}
                    <br />
                    Proof {w.proofDigest}
                  </li>
                ))}
              </ul>
              {!review.sofieResultAuthorized && (
                <Button disabled={busy} onClick={() => void act("READ")}>
                  Allow Sofie to read this Result
                </Button>
              )}
              {review.detail?.mission.state === "AWAITING_ACCEPTANCE" && (
                <>
                  <label className="block">
                    Decision reason
                    <textarea
                      className="mt-1 block w-full rounded border border-line bg-surface-2 p-2"
                      value={reason}
                      maxLength={2000}
                      disabled={busy}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy || !currentResult}
                      onClick={() => void act("ACCEPT")}
                    >
                      Accept enterprise Result
                    </Button>
                    <Button
                      disabled={busy || !currentResult || !reason.trim()}
                      onClick={() => void act("REJECT")}
                    >
                      Reject enterprise Result
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
