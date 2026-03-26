"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPrayerSettings, updatePrayerSettings } from "@/lib/prayer";

export function SalahSettingsPanel() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const prayerSettingsQuery = useQuery({
    queryKey: ["account-prayer-settings"],
    queryFn: () => fetchPrayerSettings()
  });

  return (
    <div id="salah-settings" className="mt-6 border-t border-black/10 pt-5">
      <h2 className="section-title text-sm">Salah notification settings</h2>
      <p className="mt-1 text-xs text-muted">Used for prayer reminders and quiet mode on this account.</p>
      {prayerSettingsQuery.isLoading ? (
        <p className="mt-2 text-sm text-muted">Loading Salah settings...</p>
      ) : prayerSettingsQuery.error ? (
        <p className="mt-2 text-sm text-muted">Unable to load Salah settings.</p>
      ) : prayerSettingsQuery.data ? (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setSaving(true);
            try {
              await updatePrayerSettings({
                quiet_mode: String(formData.get("quiet_mode") || "prayer_windows") as
                  | "off"
                  | "always"
                  | "prayer_windows",
                calculation_method: String(formData.get("calculation_method") || "muslim_world_league"),
                timezone: String(formData.get("timezone") || "UTC"),
                quiet_minutes_before: Number(formData.get("quiet_minutes_before") || 10),
                quiet_minutes_after: Number(formData.get("quiet_minutes_after") || 20),
                latitude: Number(formData.get("latitude") || 21.4225),
                longitude: Number(formData.get("longitude") || 39.8262)
              });
              await queryClient.invalidateQueries({ queryKey: ["account-prayer-settings"] });
              await prayerSettingsQuery.refetch();
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="space-y-1 text-sm">
            <span className="text-muted">Quiet mode</span>
            <select name="quiet_mode" className="input" defaultValue={prayerSettingsQuery.data.quiet_mode}>
              <option value="prayer_windows">Prayer windows</option>
              <option value="always">Always pause</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Calculation method</span>
            <select
              name="calculation_method"
              className="input"
              defaultValue={prayerSettingsQuery.data.calculation_method}
            >
              <option value="muslim_world_league">Muslim World League</option>
              <option value="umm_al_qura">Umm al-Qura</option>
              <option value="north_america">North America</option>
              <option value="egyptian">Egyptian</option>
              <option value="karachi">Karachi</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Timezone</span>
            <input name="timezone" className="input" defaultValue={prayerSettingsQuery.data.timezone} placeholder="UTC" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Quiet mins before</span>
            <input
              name="quiet_minutes_before"
              type="number"
              className="input"
              defaultValue={prayerSettingsQuery.data.quiet_minutes_before}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Quiet mins after</span>
            <input
              name="quiet_minutes_after"
              type="number"
              className="input"
              defaultValue={prayerSettingsQuery.data.quiet_minutes_after}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Latitude</span>
            <input
              name="latitude"
              type="number"
              step="0.00001"
              className="input"
              defaultValue={prayerSettingsQuery.data.latitude}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Longitude</span>
            <input
              name="longitude"
              type="number"
              step="0.00001"
              className="input"
              defaultValue={prayerSettingsQuery.data.longitude}
            />
          </label>
          <div className="sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Salah settings"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
