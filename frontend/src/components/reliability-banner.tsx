"use client";

import { useEffect, useState } from "react";

export function ReliabilityBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  if (online) {
    return null;
  }

  return (
    <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      You are offline. Some actions are temporarily unavailable.
    </div>
  );
}
