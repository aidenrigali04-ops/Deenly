"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

type UserResult = {
  user_id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type Props = {
  onSelectUser: (userId: number) => void;
  isPending?: boolean;
};

export function UserSearchInput({ onSelectUser, isPending }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery) setOpen(true);
  }, [debouncedQuery]);

  const searchQuery = useQuery({
    queryKey: ["user-search", debouncedQuery],
    queryFn: () =>
      apiRequest<{ items: UserResult[] }>(
        `/search/users?q=${encodeURIComponent(debouncedQuery)}&limit=8`
      ),
    enabled: debouncedQuery.length >= 1,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = searchQuery.data?.items || [];

  return (
    <div ref={wrapperRef} className="relative">
      <input
        className="messages-search"
        placeholder="Search people to message..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (debouncedQuery) setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        aria-label="Search users"
      />
      {open && debouncedQuery && (
        <div className="messages-user-search-dropdown">
          {searchQuery.isLoading && (
            <div className="px-3 py-2 text-xs text-muted">Searching...</div>
          )}
          {!searchQuery.isLoading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted">No users found</div>
          )}
          {results.map((user) => {
            const initials = user.display_name
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase())
              .join("") || "U";
            return (
              <button
                key={user.user_id}
                type="button"
                className="messages-user-search-item"
                disabled={isPending}
                onClick={() => {
                  onSelectUser(user.user_id);
                  setQuery("");
                  setDebouncedQuery("");
                  setOpen(false);
                }}
              >
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="messages-avatar"
                  />
                ) : (
                  <span className="messages-avatar">{initials}</span>
                )}
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium text-text">
                    {user.display_name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    @{user.username}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
