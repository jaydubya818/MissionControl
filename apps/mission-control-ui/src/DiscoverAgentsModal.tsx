import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Radio, UserPlus } from "lucide-react";

type DiscoveredAgent = {
  id: string;
  name: string;
  alias?: string;
  status?: string;
  capabilities?: string[];
  description?: string;
};

export function DiscoverAgentsModal({
  projectId,
  open,
  onClose,
  onImported,
}: {
  projectId: Id<"projects"> | null;
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}) {
  const [discovered, setDiscovered] = useState<DiscoveredAgent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  const discoverAgents = useAction(api.openclawDiscovery.discoverAgents);
  const importAgent = useMutation(api.openclawDiscovery.importAgent);

  const handleDiscover = async () => {
    setLoading(true);
    setError(null);
    setDiscovered([]);
    try {
      const result = await discoverAgents({});
      setDiscovered(result.agents);
      if (result.error) setError(result.error);
    } catch (e) {
      // Gateway discovery reads a URL the server then calls with the
      // deployment's GATEWAY_TOKEN, so it is company-administrator only.
      // Say that plainly instead of surfacing a raw authorization throw.
      const message = e instanceof Error ? e.message : "Discovery failed";
      setError(
        /administrator/i.test(message)
          ? "Discovering agents reads the shared Gateway connection, so it requires company administrator access. Ask an administrator to run discovery, or add agents manually."
          : message,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (agent: DiscoveredAgent) => {
    setImportingId(agent.id);
    setError(null);
    try {
      await importAgent({
        projectId: projectId ?? undefined,
        discovered: {
          id: agent.id,
          name: agent.name,
          alias: agent.alias,
          status: agent.status,
          capabilities: agent.capabilities,
          description: agent.description,
        },
      });
      setDiscovered((prev) => prev.filter((a) => a.id !== agent.id));
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Discover agents from OpenClaw Gateway
          </DialogTitle>
          <DialogDescription>
            Fetch agents from the gateway configured in Convex (OPENCLAW_GATEWAY_URL). Import them into the registry with one click.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Button
            onClick={handleDiscover}
            disabled={loading}
            variant="outline"
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Discovering…
              </>
            ) : (
              <>
                <Radio className="h-4 w-4 mr-2" />
                Discover agents
              </>
            )}
          </Button>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
              {error}
            </p>
          )}

          {discovered.length > 0 && (
            <ul className="space-y-2 border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
              {discovered.map((agent) => (
                <li key={agent.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{agent.name}</p>
                    {(agent.alias || agent.description) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {agent.alias ?? agent.description}
                      </p>
                    )}
                    {agent.capabilities && agent.capabilities.length > 0 && (
                      <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                        {agent.capabilities.slice(0, 4).join(", ")}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleImport(agent)}
                    disabled={importingId !== null}
                  >
                    {importingId === agent.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="h-3.5 w-3.5 mr-1" />
                        Import
                      </>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {!loading && discovered.length === 0 && !error && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click &quot;Discover agents&quot; to fetch from the gateway.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
