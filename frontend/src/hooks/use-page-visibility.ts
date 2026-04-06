import { useEffect, useState } from "react";

export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    function handleChange() {
      setVisible(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", handleChange);
    return () => document.removeEventListener("visibilitychange", handleChange);
  }, []);

  return visible;
}
