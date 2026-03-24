"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { AdminTable } from "@/components/admin-table";
import { ErrorState, LoadingState } from "@/components/states";

type AdminResponse = {
  table: string;
  items: Record<string, unknown>[];
};

export default function AdminTablePage() {
  const params = useParams<{ table: string }>();
  const table = params.table;
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-table", table],
    queryFn: () => apiRequest<AdminResponse>(`/admin/tables/${table}`, { auth: true })
  });

  return (
    <section className="space-y-4">
      <div className="surface-card">
        <h1 className="section-title">Table: {table}</h1>
      </div>
      {isLoading ? <LoadingState label="Loading table..." /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}
      {data ? <AdminTable rows={data.items} /> : null}
    </section>
  );
}
