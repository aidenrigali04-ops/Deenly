import { apiRequest } from "@/lib/api";

type VariantId = "control" | "value_copy" | "fast_path";

const EXPERIMENTS = {
  financialPrompt: "exp_financial_prompt_v1",
  timeCopy: "exp_time_copy_v1",
  convenienceResume: "exp_resume_card_v1",
  quickActionPlacementV2: "exp_quick_action_placement_v2",
  valueHierarchyV2: "exp_value_hierarchy_v2",
  resumeProminenceV2: "exp_resume_prominence_v2"
} as const;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function resolveVariant(seed: string, experimentId: string): VariantId {
  const bucket = hashString(`${seed}:${experimentId}`) % 100;
  if (bucket < 34) return "control";
  if (bucket < 67) return "value_copy";
  return "fast_path";
}

export async function trackClientExperimentEvent(input: {
  eventName: string;
  persona?: string | null;
  source?: string;
  surface: string;
  experimentId: string;
  variantId: VariantId;
  properties?: Record<string, unknown>;
}) {
  try {
    await apiRequest("/analytics/events/client", {
      method: "POST",
      auth: true,
      body: {
        eventName: input.eventName,
        source: input.source || "web",
        surface: input.surface,
        platform: "web",
        experimentId: input.experimentId,
        variantId: input.variantId,
        persona: input.persona || null,
        properties: input.properties || {}
      }
    });
  } catch {
    // Best-effort analytics only.
  }
}

function promptCapForPersona(persona?: string | null) {
  if (persona === "consumer" || persona === "personal") return 1;
  if (persona === "professional") return 2;
  return 3;
}

export function shouldShowExperimentPrompt(input: {
  experimentId: string;
  persona?: string | null;
  dayKey?: string;
}) {
  if (typeof window === "undefined") {
    return true;
  }
  const day = input.dayKey || new Date().toISOString().slice(0, 10);
  const key = `deenly-exp-prompt-${input.experimentId}-${day}`;
  const cap = promptCapForPersona(input.persona);
  let count = 0;
  try {
    count = Number(window.localStorage.getItem(key) || "0");
  } catch {
    return true;
  }
  if (count >= cap) {
    return false;
  }
  try {
    window.localStorage.setItem(key, String(count + 1));
  } catch {
    // ignore quota issues
  }
  return true;
}

export const growthExperiments = EXPERIMENTS;
