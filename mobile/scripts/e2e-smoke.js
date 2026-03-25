async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Request failed: ${response.status} ${path}`);
  }
  return payload;
}

async function run() {
  const baseUrl = process.env.MOBILE_E2E_API_BASE_URL || "http://localhost:3000/api/v1";
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const email = `mobile-smoke-${suffix}@example.com`;
  const password = "Passw0rd!1234";

  const auth = await request(baseUrl, "/auth/register", {
    method: "POST",
    body: {
      email,
      username: `mobilesmoke${suffix}`,
      password,
      displayName: "Mobile Smoke"
    }
  });

  const token = auth.tokens?.accessToken;
  if (!token) {
    throw new Error("Missing access token after signup");
  }

  const secondUser = await request(baseUrl, "/auth/register", {
    method: "POST",
    body: {
      email: `mobile-smoke-second-${suffix}@example.com`,
      username: `mobilesmoke2${suffix}`,
      password,
      displayName: "Mobile Smoke Two"
    }
  });
  const secondToken = secondUser.tokens?.accessToken;
  if (!secondToken) {
    throw new Error("Missing second access token");
  }

  const prayerSettings = await request(baseUrl, "/notifications/prayer-settings", {
    method: "GET",
    token
  });
  if (!prayerSettings || typeof prayerSettings.quiet_mode !== "string") {
    throw new Error("Prayer settings payload missing");
  }

  await request(baseUrl, "/notifications/prayer-settings", {
    method: "PUT",
    token,
    body: {
      quiet_mode: "always",
      quiet_minutes_before: 5,
      quiet_minutes_after: 5
    }
  });

  const prayerStatus = await request(baseUrl, "/notifications/prayer-status", {
    method: "GET",
    token
  });
  if (typeof prayerStatus.isQuietWindow !== "boolean") {
    throw new Error("Prayer status missing isQuietWindow");
  }

  const post = await request(baseUrl, "/posts", {
    method: "POST",
    token,
    body: {
      postType: "community",
      content: "Mobile smoke post"
    }
  });

  const feed = await request(baseUrl, "/feed?limit=5", {
    method: "GET",
    token
  });

  const firstPostId = post.id || feed.items?.[0]?.id;
  if (!firstPostId) {
    throw new Error("No post found for interaction flow");
  }

  await request(baseUrl, "/interactions", {
    method: "POST",
    token,
    body: {
      postId: firstPostId,
      interactionType: "benefited"
    }
  });

  await request(baseUrl, `/follows/${auth.user.id}`, {
    method: "POST",
    token: secondToken
  });

  const meStats = await request(baseUrl, "/users/me", {
    method: "GET",
    token
  });
  if (typeof meStats.posts_count !== "number") {
    throw new Error("Missing profile posts_count on /users/me");
  }

  await request(baseUrl, "/reports", {
    method: "POST",
    token,
    body: {
      targetType: "post",
      targetId: String(firstPostId),
      reason: "smoke-report",
      category: "other"
    }
  });

  const mediaPost = await request(baseUrl, "/posts", {
    method: "POST",
    token,
    body: {
      postType: "community",
      content: "Mobile smoke media post"
    }
  });

  const videoSignature = await request(baseUrl, "/media/upload-signature", {
    method: "POST",
    token,
    body: {
      mediaType: "video",
      mimeType: "video/mp4",
      originalFilename: "smoke-video.mp4",
      fileSizeBytes: 2048
    }
  });
  await request(baseUrl, `/media/posts/${mediaPost.id}/attach`, {
    method: "POST",
    token,
    body: {
      mediaKey: videoSignature.key,
      mediaUrl: videoSignature.key,
      mimeType: "video/mp4",
      fileSizeBytes: 2048
    }
  });
  const videoDetail = await request(baseUrl, `/posts/${mediaPost.id}`, {
    method: "GET",
    token
  });
  if (!/^https?:\/\//i.test(String(videoDetail.media_url || ""))) {
    throw new Error("Video media_url is not resolvable");
  }
  if (videoDetail.media_mime_type !== "video/mp4") {
    throw new Error("Video media_mime_type mismatch");
  }

  const imageSignature = await request(baseUrl, "/media/upload-signature", {
    method: "POST",
    token,
    body: {
      mediaType: "image",
      mimeType: "image/jpeg",
      originalFilename: "smoke-image.jpg",
      fileSizeBytes: 1024
    }
  });
  await request(baseUrl, `/media/posts/${mediaPost.id}/attach`, {
    method: "POST",
    token,
    body: {
      mediaKey: imageSignature.key,
      mediaUrl: imageSignature.key,
      mimeType: "image/jpeg",
      fileSizeBytes: 1024
    }
  });

  const imageDetail = await request(baseUrl, `/posts/${mediaPost.id}`, {
    method: "GET",
    token
  });
  if (!/^https?:\/\//i.test(String(imageDetail.media_url || ""))) {
    throw new Error("Image media_url is not resolvable");
  }
  if (imageDetail.media_mime_type !== "image/jpeg") {
    throw new Error("Image media_mime_type mismatch");
  }

  const refreshedFeed = await request(baseUrl, "/feed?limit=20", {
    method: "GET",
    token
  });
  const mediaItem = (refreshedFeed.items || []).find((item) => item.id === mediaPost.id);
  if (!mediaItem) {
    throw new Error("Media post missing from feed");
  }
  if (!/^https?:\/\//i.test(String(mediaItem.media_url || ""))) {
    throw new Error("Feed media_url is not resolvable");
  }

  console.log("mobile e2e smoke passed");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
