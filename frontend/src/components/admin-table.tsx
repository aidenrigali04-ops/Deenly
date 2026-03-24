"use client";

type Row = Record<string, unknown>;

function renderValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AdminTable({ rows }: { rows: Row[] }) {
  if (!rows.length) {
    return <p className="surface-card text-sm text-muted">No rows found.</p>;
  }
  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-surface/20">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-card/60 text-muted">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-white/5 align-top odd:bg-white/[0.02]">
              {columns.map((column) => (
                <td key={column} className="max-w-80 px-3 py-2">
                  <span className="block truncate" title={renderValue(row[column])}>
                    {renderValue(row[column])}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
