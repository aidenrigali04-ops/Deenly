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

const labelClass = "text-[10px] font-semibold uppercase tracking-[0.12em] text-muted";
const cardClass = "rounded-xl border border-black/10 bg-surface p-4";

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
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className={cardClass}>
        <p className={labelClass}>Dhikr</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums leading-none text-text">{dhikrCount.toLocaleString()}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">Tasbeeh on this device · only you see this</p>
        <Link
          href="/dhikr"
          className="mt-3 inline-block text-sm font-medium text-sky-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-sm"
        >
          Open Dhikr
        </Link>
      </div>
      <div className={cardClass}>
        <p className={labelClass}>Salah</p>
        {prayerStatusQuery.isError ? (
          <p className="mt-2 text-sm leading-relaxed text-muted">Salah times unavailable.</p>
        ) : nextName ? (
          <p className="mt-2 text-sm leading-relaxed text-text">
            Next: <span className="font-semibold">{nextName}</span>
            {timeStr ? <span className="text-muted"> · {timeStr}</span> : null}
          </p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted">No upcoming prayer in window.</p>
        )}
        <p className={`${labelClass} mt-4`}>Today on this device · {salahDone}/5</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SALAH_LABELS.map((label, i) => {
            const on = Boolean(salahDaily.mask & (1 << i));
            return (
              <button
                key={label}
                type="button"
                title={label}
                onClick={() => toggleSalah(i)}
                className={`min-h-9 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  on
                    ? "border-sky-500/60 bg-sky-500/15 text-sky-900"
                    : "border-black/15 bg-card text-muted hover:border-black/30 hover:bg-black/[0.02]"
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
