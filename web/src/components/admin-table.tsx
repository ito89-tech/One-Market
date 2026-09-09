import type { ReactNode } from "react";

/**
 * Admin tables can be wide; the wrapper scrolls instead of the page, so the
 * "no horizontal scroll" rule for the public site is not broken here either.
 */
export function AdminTable({
  columns,
  rows,
  empty = "データがありません",
}: {
  columns: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--color-line)] bg-white px-4 py-8 text-center text-sm text-ink-500">
        {empty}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-line)] bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-[var(--color-surface-muted)] text-xs text-ink-500">
          <tr>
            {columns.map((column, index) => (
              <th
                key={`${index}-${column}`}
                scope="col"
                className="whitespace-nowrap px-4 py-3 font-bold"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-line)]">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 align-top text-ink-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
