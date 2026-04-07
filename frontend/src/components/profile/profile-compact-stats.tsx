"use client";

type ProfileCompactStatsProps = {
  postsCount: number;
  followersCount: number;
  followingCount: number;
  className?: string;
};

export function ProfileCompactStats({
  postsCount,
  followersCount,
  followingCount,
  className = ""
}: ProfileCompactStatsProps) {
  return (
    <p className={`text-sm text-text ${className}`.trim()}>
      <span className="font-semibold tabular-nums">{postsCount.toLocaleString()}</span>
      <span className="text-muted"> posts</span>
      <span className="mx-1.5 text-muted" aria-hidden>
        ·
      </span>
      <span className="font-semibold tabular-nums">{followersCount.toLocaleString()}</span>
      <span className="text-muted"> followers</span>
      <span className="mx-1.5 text-muted" aria-hidden>
        ·
      </span>
      <span className="font-semibold tabular-nums">{followingCount.toLocaleString()}</span>
      <span className="text-muted"> following</span>
    </p>
  );
}
