import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface ApiImportViewProps {
  projectId: Id<"projects"> | null;
}

const INPUT_CLASS =
  "h-9 rounded-lg border border-line-control bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted";

export function ApiImportView({ projectId }: ApiImportViewProps) {
  const [name, setName] = useState("Sample Collection");
  const [collectionType, setCollectionType] = useState("postman");
  const [rawText, setRawText] = useState('{"steps":[{"method":"GET","url":"/health"}]}');

  const list = useQuery((api as any).apiCollections.list, { projectId: projectId ?? undefined, limit: 25 });
  const importCollection = useMutation((api as any).apiCollections.importCollection);
  const convert = useAction((api as any).apiCollections.convertToTests);
  const remove = useMutation((api as any).apiCollections.remove);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
      <header>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">API Import</h1>
        <p className="mt-1.5 text-[14px] text-ink-secondary">Import Postman/Bruno/SoapUI/OpenAPI payloads and convert to test suites.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            className={INPUT_CLASS}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className={INPUT_CLASS}
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
          className="min-h-[120px] w-full rounded-lg border border-line bg-surface-1 px-3 py-2 font-mono text-[12px] text-ink placeholder:text-ink-muted"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
        <h2 className="text-[15px] font-semibold text-ink">Imported Collections</h2>
        <div className="flex flex-col gap-2">
          {(list ?? []).map((row: any) => (
            <div
              key={row._id}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2 transition-colors duration-150 hover:bg-surface-2"
            >
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium text-ink">{row.name}</div>
                <div className="text-[12.5px] text-ink-muted">{row.collectionType} · {row.totalSteps} steps</div>
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
    </div>
  );
}
