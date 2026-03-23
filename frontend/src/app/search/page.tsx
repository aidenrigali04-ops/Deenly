"use client";

import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";

type UserResult = {
  user_id: number;
  username: string;
  display_name: string;
  bio: string | null;
};

type PostResult = {
  id: number;
  post_type: string;
  content: string;
  author_id: number;
  author_display_name: string;
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const usersQuery = useQuery({
    queryKey: ["search-users", submittedQuery],
    queryFn: () =>
      apiRequest<{ items: UserResult[] }>(
        `/search/users?q=${encodeURIComponent(submittedQuery)}&limit=10`,
        {
          auth: true
        }
      ),
    enabled: submittedQuery.length > 0
  });

  const postsQuery = useQuery({
    queryKey: ["search-posts", submittedQuery],
    queryFn: () =>
      apiRequest<{ items: PostResult[] }>(
        `/search/posts?q=${encodeURIComponent(submittedQuery)}&limit=10`,
        {
          auth: true
        }
      ),
    enabled: submittedQuery.length > 0
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedQuery(query.trim());
  };

  return (
    <section className="space-y-4">
      <form className="surface-card flex gap-3" onSubmit={onSubmit}>
        <input
          className="input flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search users or posts..."
        />
        <button className="btn-primary" type="submit">
          Search
        </button>
      </form>

      {!submittedQuery ? (
        <EmptyState title="Search the platform" subtitle="Find users and beneficial posts." />
      ) : null}
      {usersQuery.isLoading || postsQuery.isLoading ? <LoadingState label="Searching..." /> : null}
      {usersQuery.error ? <ErrorState message={(usersQuery.error as Error).message} /> : null}
      {postsQuery.error ? <ErrorState message={(postsQuery.error as Error).message} /> : null}

      {submittedQuery && !usersQuery.isLoading && !postsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="surface-card space-y-3">
            <h2 className="text-lg font-semibold">Users</h2>
            {(usersQuery.data?.items || []).map((user) => (
              <Link key={user.user_id} href={`/users/${user.user_id}`} className="block rounded-lg border border-white/10 p-3">
                <p className="font-medium">{user.display_name}</p>
                <p className="text-sm text-muted">@{user.username}</p>
              </Link>
            ))}
            {(usersQuery.data?.items || []).length === 0 ? (
              <EmptyState title="No users found" />
            ) : null}
          </div>
          <div className="surface-card space-y-3">
            <h2 className="text-lg font-semibold">Posts</h2>
            {(postsQuery.data?.items || []).map((post) => (
              <Link key={post.id} href={`/posts/${post.id}`} className="block rounded-lg border border-white/10 p-3">
                <p className="text-xs uppercase text-accent">{post.post_type}</p>
                <p className="font-medium">{post.content}</p>
                <p className="text-sm text-muted">by {post.author_display_name}</p>
              </Link>
            ))}
            {(postsQuery.data?.items || []).length === 0 ? (
              <EmptyState title="No posts found" />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
