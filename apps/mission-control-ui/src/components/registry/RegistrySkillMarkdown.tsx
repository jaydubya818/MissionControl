/** Lightweight SKILL.md renderer with table support (Tessl-style). */

function parseTable(lines: string[]): string[][] | null {
  if (lines.length < 2) return null;
  const rows = lines.map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())
  );
  if (rows.some((r) => r.length === 0)) return null;
  const sep = rows[1]?.every((c) => /^[-:]+$/.test(c));
  if (!sep) return null;
  return [rows[0], ...rows.slice(2)];
}

export function RegistrySkillMarkdown({ content }: { content: string }): JSX.Element {
  const blocks: JSX.Element[] = [];
  const lines = content.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={key++} className="mt-6 text-[17px] font-semibold text-ink first:mt-0">
          {line.slice(3)}
        </h2>
      );
      i += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={key++} className="mt-4 text-[15px] font-semibold text-ink-secondary">
          {line.slice(4)}
        </h3>
      );
      i += 1;
      continue;
    }

    if (line.startsWith(">")) {
      blocks.push(
        <blockquote
          key={key++}
          className="mt-3 rounded-lg border border-registry-accent/30 bg-registry-accent-soft/40 px-4 py-3 text-[13.5px] leading-relaxed text-ink-secondary"
        >
          {line.replace(/^>\s?/, "")}
          {lines[i + 1]?.startsWith(">") ? ` ${lines[++i].replace(/^>\s?/, "")}` : ""}
        </blockquote>
      );
      i += 1;
      continue;
    }

    if (line.includes("|") && lines[i + 1]?.includes("---")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const table = parseTable(tableLines);
      if (table) {
        const [head, ...body] = table;
        blocks.push(
          <div key={key++} className="registry-scrolly mt-3">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  {head.map((cell) => (
                    <th key={cell} className="px-3 py-2 text-[12px] font-semibold text-registry-accent">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row) => (
                  <tr key={row.join("-")} className="border-t border-line">
                    {row.map((cell, ci) => (
                      <td
                        key={`${ci}-${cell}`}
                        className="px-3 py-2 text-[13px] text-ink-secondary"
                      >
                        {cell.startsWith("references/") ? (
                          <code className="font-mono text-[12px] text-registry-accent">{cell}</code>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    if (line.trim()) {
      blocks.push(
        <p key={key++} className="mt-2 text-[14px] leading-relaxed text-ink-secondary">
          {line}
        </p>
      );
    }
    i += 1;
  }

  return <div className="registry-skill-md">{blocks}</div>;
}
