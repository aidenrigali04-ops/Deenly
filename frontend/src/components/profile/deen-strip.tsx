"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchPrayerStatus } from "@/lib/prayer";
import { useDhikrCount } from "@/hooks/use-dhikr-count";
import { useSalahDaily } from "@/hooks/use-salah-daily";
import { countSalahDone, SALAH_LABELS } from "@/lib/salah-daily";

function formatNextPrayerTime(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return "";
    }
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function DeenStrip() {
  const [dhikrCount] = useDhikrCount();
  const [salahDaily, toggleSalah] = useSalahDaily();
  const prayerStatusQuery = useQuery({
    queryKey: ["account-profile-prayer-status"],
    queryFn: () => fetchPrayerStatus(),
    staleTime: 60_000
  });
  const status = prayerStatusQuery.data;
  const nextName = status?.nextPrayer || status?.reminderPrayer || null;
  const nextAt = status?.nextPrayerAt || status?.activePrayerAt;
  const timeStr = formatNextPrayerTime(nextAt || null);
  const salahDone = countSalahDone(salahDaily.mask);

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-black/10 bg-surface px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Dhikr</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-text">{dhikrCount.toLocaleString()}</p>
        <p className="mt-1 text-xs text-muted">Tasbeeh on this device · only you see this</p>
        <Link href="/dhikr" className="mt-2 inline-block text-sm font-medium text-sky-600 hover:underline">
          Open Dhikr
        </Link>
      </div>
      <div className="rounded-xl border border-black/10 bg-surface px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Salah</p>
        {prayerStatusQuery.isError ? (
          <p className="mt-2 text-sm text-muted">Salah times unavailable.</p>
        ) : nextName ? (
          <p className="mt-2 text-sm text-text">
            Next: <span className="font-semibold">{nextName}</span>
            {timeStr ? <span className="text-muted"> · {timeStr}</span> : null}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">No upcoming prayer in window.</p>
        )}
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Today on this device · {salahDone}/5
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SALAH_LABELS.map((label, i) => {
            const on = Boolean(salahDaily.mask & (1 << i));
            return (
              <button
                key={label}
                type="button"
                title={label}
                onClick={() => toggleSalah(i)}
                className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition ${
                  on
                    ? "border-sky-500/60 bg-sky-500/15 text-sky-900"
                    : "border-black/15 bg-card text-muted hover:border-black/25"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
