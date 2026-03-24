"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { ErrorState } from "@/components/states";

type CreatePostResponse = {
  id: number;
};

type UploadSignatureResponse = {
  uploadUrl: string;
  headers: Record<string, string>;
  key: string;
};

export default function CreatePage() {
  const router = useRouter();
  const [postType, setPostType] = useState("community");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const file = form.get("mediaFile") as File | null;

    try {
      const post = await apiRequest<CreatePostResponse>("/posts", {
        method: "POST",
        auth: true,
        body: {
          postType,
          content
        }
      });

      if (file && file.size > 0) {
        const signature = await apiRequest<UploadSignatureResponse>("/media/upload-signature", {
          method: "POST",
          auth: true,
          body: {
            mediaType: "video",
            mimeType: file.type || "video/mp4",
            originalFilename: file.name,
            fileSizeBytes: file.size
          }
        });

        await fetch(signature.uploadUrl, {
          method: "PUT",
          headers: signature.headers,
          body: file
        });

        await apiRequest(`/media/posts/${post.id}/attach`, {
          method: "POST",
          auth: true,
          body: {
            mediaKey: signature.key,
            mediaUrl: signature.key,
            mimeType: file.type || "video/mp4",
            fileSizeBytes: file.size
          }
        });
      }

      router.push(`/posts/${post.id}`);
    } catch (err) {
      setError((err as Error).message || "Unable to create post");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="section-title">Create post</h1>
        <p className="mt-1 text-sm text-muted">Share beneficial recitations and reminders.</p>
      </header>
      <form className="surface-card space-y-3" onSubmit={onSubmit}>
        <label className="text-xs uppercase tracking-wide text-muted">Post type</label>
        <select
          className="input"
          value={postType}
          onChange={(event) => setPostType(event.target.value)}
          aria-label="Post type"
        >
          <option value="community">Community</option>
          <option value="recitation">Recitation</option>
          <option value="short_video">Short video</option>
        </select>
        <label className="text-xs uppercase tracking-wide text-muted">Message</label>
        <textarea
          className="input min-h-32"
          placeholder="Share your message..."
          value={content}
          onChange={(event) => setContent(event.target.value)}
          required
        />
        <label className="text-xs uppercase tracking-wide text-muted">Optional media</label>
        <input name="mediaFile" type="file" accept="video/*,audio/*" className="input" />
        <p className="text-xs text-muted">
          Uploads are attached after post creation. Keep files concise for faster publishing.
        </p>
        {error ? <ErrorState message={error} /> : null}
        <button className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? "Publishing..." : "Publish"}
        </button>
      </form>
    </section>
  );
}
