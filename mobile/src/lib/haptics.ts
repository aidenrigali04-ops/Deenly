import * as Haptics from "expo-haptics";

async function safely(run: () => Promise<void>) {
  try {
    await run();
  } catch {
    // Non-blocking UX enhancement.
  }
}

export function hapticTap() {
  return safely(() => Haptics.selectionAsync());
}

export function hapticPrimary() {
  return safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function hapticSuccess() {
  return safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
