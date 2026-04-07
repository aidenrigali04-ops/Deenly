"use client";

type ProfilePillTabsProps<T extends string> = {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
};

export function ProfilePillTabs<T extends string>({ tabs, active, onChange }: ProfilePillTabsProps<T>) {
  return (
    <div
      className="profile-tab-strip mt-6 flex flex-wrap gap-2 border-t border-black/10 pt-4"
      role="tablist"
      aria-label="Profile sections"
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`profile-tab ${isActive ? "profile-tab-active" : ""}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
