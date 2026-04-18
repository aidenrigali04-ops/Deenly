import { useMemo } from "react";
import { useAppearanceStore } from "../store/appearance-store";
import {
  resolveFigmaAtmosphere,
  resolveFigmaMobile,
  resolveFigmaMobileHome,
  resolveFigmaNav,
  resolveFigmaProfile
} from "../theme";

/** Signed-in shell tokens (dark / light). Auth stays white — not used on Welcome/Login/Signup. */
export function useAppChrome() {
  const mode = useAppearanceStore((s) => s.mode);
  return useMemo(
    () => ({
      mode,
      figma: resolveFigmaMobile(mode),
      figmaHome: resolveFigmaMobileHome(mode),
      atmosphere: resolveFigmaAtmosphere(mode),
      profile: resolveFigmaProfile(mode),
      nav: resolveFigmaNav(mode)
    }),
    [mode]
  );
}
