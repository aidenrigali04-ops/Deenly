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
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Dhikr</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-white">{dhikrCount.toLocaleString()}</p>
        <p className="mt-1 text-xs text-white/45">Tasbeeh total on this device · not public</p>
        <Link href="/dhikr" className="mt-2 inline-block text-sm font-medium text-sky-400 hover:underline">
          Open Dhikr
        </Link>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Salah</p>
        {prayerStatusQuery.isError ? (
          <p className="mt-2 text-sm text-white/50">Salah times unavailable.</p>
        ) : nextName ? (
          <p className="mt-2 text-sm text-white/90">
            Next: <span className="font-semibold text-white">{nextName}</span>
            {timeStr ? <span className="text-white/60"> · {timeStr}</span> : null}
          </p>
        ) : (
          <p className="mt-2 text-sm text-white/50">No upcoming prayer in window.</p>
        )}
        <Link href="#salah-settings" className="mt-2 inline-block text-sm font-medium text-sky-400 hover:underline">
          Salah settings
        </Link>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-white/50">
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
                    ? "border-sky-500/80 bg-sky-500/25 text-sky-100"
                    : "border-white/15 bg-black/30 text-white/50 hover:border-white/30"
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
