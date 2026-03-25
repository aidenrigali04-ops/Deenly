"use client";

const storySeeds = [
  { id: "my-story", label: "Your story", initials: "+", isOwn: true },
  { id: "s1", label: "QuranDaily", initials: "QD" },
  { id: "s2", label: "UpliftHub", initials: "UH" },
  { id: "s3", label: "SunnahPath", initials: "SP" },
  { id: "s4", label: "MercyNotes", initials: "MN" }
];

export function HomeStoriesRow() {
  return (
    <section className="surface-card p-3 md:p-4" aria-label="Stories">
      <div className="flex items-center gap-4 overflow-x-auto pb-1">
        {storySeeds.map((story) => (
          <button
            key={story.id}
            type="button"
            className="story-chip group"
            aria-label={story.label}
            title={story.label}
          >
            <span className={`story-ring ${story.isOwn ? "story-ring-own" : ""}`}>
              <span className="story-avatar">{story.initials}</span>
            </span>
            <span className="max-w-16 truncate text-[11px] text-muted">{story.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
