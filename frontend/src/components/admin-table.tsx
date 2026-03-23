"use client";

type Row = Record<string, unknown>;

function renderValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AdminTable({ rows }: { rows: Row[] }) {
  if (!rows.length) {
    return <p className="text-sm text-muted">No rows found.</p>;
  }
  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
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
            <tr key={index} className="border-t border-white/5">
              {columns.map((column) => (
                <td key={column} className="px-3 py-2 align-top">
                  {renderValue(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
