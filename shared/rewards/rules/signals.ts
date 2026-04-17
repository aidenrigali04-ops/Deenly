import type { AntiFarmingSignals } from "./types";
import type { CapSnapshot } from "./types";

/**
 * Prefer explicit `signals`; fall back to fields on `CapSnapshot` when orchestrators attach counters there.
 */
export function mergeAntiFarmingSignals(snapshot: CapSnapshot, signals: AntiFarmingSignals): AntiFarmingSignals {
  return {
    grantsLastHourCount: signals.grantsLastHourCount ?? snapshot.grantsLastHourCount,
    grantsLastFiveMinutesCount:
      signals.grantsLastFiveMinutesCount ?? snapshot.grantsLastFiveMinutesCount,
    secondsSinceLastEarnSameTarget:
      signals.secondsSinceLastEarnSameTarget ?? snapshot.secondsSinceLastEarnSameTarget,
    accountAgeDays: signals.accountAgeDays,
    sameTargetEarnCountToday: signals.sameTargetEarnCountToday ?? snapshot.sameTargetEarnCountToday
  };
}
