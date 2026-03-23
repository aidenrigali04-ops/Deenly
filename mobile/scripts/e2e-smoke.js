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

  console.log("mobile e2e smoke passed");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
