"use client";

const storySeeds = [
  { id: "my-story", label: "Your story", initials: "+", isOwn: true },
  { id: "s1", label: "QuranDaily", initials: "QD" },
  { id: "s2", label: "UpliftHub", initials: "UH" },
  { id: "s3", label: "SunnahPath", initials: "SP" },
  { id: "s4", label: "MercyNotes", initials: "MN" }
];

type HomeStoriesRowProps = {
  variant?: "default" | "social";
};

export function HomeStoriesRow({ variant = "default" }: HomeStoriesRowProps) {
  const isSocial = variant === "social";
  return (
    <section
      className={
        isSocial
          ? "rounded-2xl border border-white/10 bg-transparent py-1"
          : "surface-card p-2.5 md:p-3"
      }
      aria-label="Stories"
    >
      <div className={`flex items-center gap-2 overflow-x-auto pb-1 ${isSocial ? "px-0.5" : ""}`}>
        {storySeeds.map((story) => (
          <button
            key={story.id}
            type="button"
            className="story-chip group"
            aria-label={story.label}
            title={story.label}
          >
            <span
              className={`inline-flex rounded-full border p-[2px] ${
                story.isOwn
                  ? isSocial
                    ? "border-white/25"
                    : "story-ring-own"
                  : isSocial
                    ? "border-white/15"
                    : "story-ring"
              }`}
            >
              <span
                className={`grid h-[70px] w-[70px] place-items-center rounded-full border text-xs font-semibold ${
                  isSocial
                    ? story.isOwn
                      ? "border-white/12 bg-white/[0.08] text-white"
                      : "border-white/10 bg-white text-black"
                    : "story-avatar h-14 w-14 border-black/10 bg-surface text-black"
                }`}
              >
                {story.initials}
              </span>
            </span>
            <span className={`max-w-[70px] truncate text-center text-xs font-medium ${isSocial ? "text-white" : "text-muted"}`}>
              {story.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
