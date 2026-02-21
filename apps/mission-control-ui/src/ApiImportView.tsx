import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface ApiImportViewProps {
  projectId: Id<"projects"> | null;
}

export function ApiImportView({ projectId }: ApiImportViewProps) {
  const [name, setName] = useState("Sample Collection");
  const [collectionType, setCollectionType] = useState("postman");
  const [rawText, setRawText] = useState('{"steps":[{"method":"GET","url":"/health"}]}');

  const list = useQuery((api as any).apiCollections.list, { projectId: projectId ?? undefined, limit: 25 });
  const importCollection = useMutation((api as any).apiCollections.importCollection);
  const convert = useAction((api as any).apiCollections.convertToTests);
  const remove = useMutation((api as any).apiCollections.remove);

  return (
    <main className="flex-1 overflow-auto p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold">API Import</h2>
        <p className="text-sm text-muted-foreground">Import Postman/Bruno/SoapUI/OpenAPI payloads and convert to test suites.</p>
      </header>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={collectionType}
            onChange={(e) => setCollectionType(e.target.value)}
          >
            <option value="postman">postman</option>
            <option value="bruno">bruno</option>
            <option value="soapui">soapui</option>
            <option value="openapi">openapi</option>
          </select>
          <Button
            onClick={async () => {
              await importCollection({
                projectId: projectId ?? undefined,
                importedBy: "operator",
                name,
                collectionType,
                raw: JSON.parse(rawText),
              });
            }}
          >
            Import Collection
          </Button>
        </div>
        <textarea
          className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
      </section>

      <section className="rounded-lg border border-border p-4 space-y-2">
        <h3 className="font-medium">Imported Collections</h3>
        <div className="space-y-2">
          {(list ?? []).map((row: any) => (
            <div key={row._id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div>
                <div className="text-sm font-medium">{row.name}</div>
                <div className="text-xs text-muted-foreground">{row.collectionType} · {row.totalSteps} steps</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => convert({ id: row._id, createdBy: "operator" })}>
                  Convert to Tests
                </Button>
                <Button size="sm" variant="outline" onClick={() => remove({ id: row._id })}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
