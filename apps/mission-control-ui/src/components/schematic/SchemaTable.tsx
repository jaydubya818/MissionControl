export interface SchemaTableProps {
  columns: string[];
  rows: Record<string, string>[];
  count: number;
  sampleSize: number;
}

/** Scrollable schema-aligned table (waku dbTable). */
export function SchemaTable({ columns, rows, count, sampleSize }: SchemaTableProps): JSX.Element {
  if (rows.length === 0) {
    return <div className="schematic-card text-ink-muted">Empty — no rows yet</div>;
  }

  return (
    <>
      <div className="schematic-scrolly">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-line">
                {columns.map((c) => (
                  <td key={c} className="schematic-dbcell px-3 py-2">
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="schematic-meta mt-1.5">
        showing {sampleSize} of {count} row{count === 1 ? "" : "s"} (newest first)
      </p>
    </>
  );
}
