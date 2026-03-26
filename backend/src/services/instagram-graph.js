const jwt = require("jsonwebtoken");
const { URL, URLSearchParams } = require("node:url");
const { httpError } = require("../utils/http-error");
const { encryptToken, decryptToken } = require("./instagram-token-crypto");

const OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish"
].join(",");

function graphBase(config) {
  const v = String(config?.instagramGraphApiVersion || "v21.0").trim();
  return `https://graph.facebook.com/${v}`;
}

function oauthStateSecret(config) {
  return (
    String(config.metaOauthStateSecret || "").trim() ||
    String(config.jwtRefreshSecret || "").trim() ||
    String(config.jwtAccessSecret || "").trim()
  );
}

function signOAuthState(config, userId) {
  const secret = oauthStateSecret(config);
  if (!secret) {
    throw httpError(500, "OAuth state signing is not configured");
  }
  return jwt.sign({ typ: "ig_oauth", sub: String(userId) }, secret, { expiresIn: "10m" });
}

function verifyOAuthState(config, token) {
  const secret = oauthStateSecret(config);
  if (!secret || !token) {
    throw httpError(400, "Invalid OAuth state");
  }
  try {
    const payload = jwt.verify(String(token), secret);
    if (payload.typ !== "ig_oauth" || !payload.sub) {
      throw new Error("bad payload");
    }
    const uid = Number(payload.sub);
    if (!uid) {
      throw new Error("bad uid");
    }
    return uid;
  } catch {
    throw httpError(400, "Invalid or expired OAuth state");
  }
}

function isMetaConfigured(config) {
  return Boolean(
    String(config.metaAppId || "").trim() &&
      String(config.metaAppSecret || "").trim() &&
      String(config.metaOauthRedirectUri || "").trim()
  );
}

function buildAuthorizeUrl(config, state) {
  const redirect = String(config.metaOauthRedirectUri || "").trim();
  const params = new URLSearchParams({
    client_id: config.metaAppId,
    redirect_uri: redirect,
    state: String(state),
    scope: OAUTH_SCOPES,
    response_type: "code"
  });
  const v = String(config?.instagramGraphApiVersion || "v21.0").trim();
  return `https://www.facebook.com/${v}/dialog/oauth?${params.toString()}`;
}

async function fetchJson(url) {
  const res = await globalThis.fetch(url, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || data.message || res.statusText || "Graph API error";
    const err = new Error(msg);
    err.statusCode = res.status;
    err.graph = data;
    throw err;
  }
  return data;
}

async function exchangeCodeForUserToken(config, code) {
  const redirect = encodeURIComponent(String(config.metaOauthRedirectUri || "").trim());
  const url = `${graphBase(config)}/oauth/access_token?client_id=${encodeURIComponent(
    config.metaAppId
  )}&redirect_uri=${redirect}&client_secret=${encodeURIComponent(
    config.metaAppSecret
  )}&code=${encodeURIComponent(String(code))}`;
  return fetchJson(url);
}

async function exchangeLongLivedUserToken(config, shortLivedToken) {
  const url = `${graphBase(config)}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(
    config.metaAppId
  )}&client_secret=${encodeURIComponent(
    config.metaAppSecret
  )}&fb_exchange_token=${encodeURIComponent(String(shortLivedToken))}`;
  return fetchJson(url);
}

async function fetchPagesWithIg(config, userAccessToken) {
  const fields = encodeURIComponent("id,name,access_token,instagram_business_account{id}");
  const url = `${graphBase(config)}/me/accounts?fields=${fields}&access_token=${encodeURIComponent(
    String(userAccessToken)
  )}`;
  return fetchJson(url);
}

async function fetchIgUsername(config, igUserId, pageAccessToken) {
  try {
    const url = `${graphBase(config)}/${encodeURIComponent(
      igUserId
    )}?fields=username&access_token=${encodeURIComponent(String(pageAccessToken))}`;
    const data = await fetchJson(url);
    return data.username ? String(data.username) : null;
  } catch {
    return null;
  }
}

async function persistConnectionFromOAuthCode({ db, config, userId, code }) {
  const shortTok = await exchangeCodeForUserToken(config, code);
  const shortUserToken = shortTok.access_token;
  if (!shortUserToken) {
    throw httpError(400, "Meta did not return an access token");
  }
  const longTok = await exchangeLongLivedUserToken(config, shortUserToken);
  const userToken = longTok.access_token || shortUserToken;
  const pagesData = await fetchPagesWithIg(config, userToken);
  const pages = pagesData.data || [];
  const match = pages.find((p) => p.instagram_business_account && p.instagram_business_account.id);
  if (!match || !match.access_token) {
    throw httpError(
      400,
      "No Facebook Page with a linked Instagram Business/Creator account was found for this login."
    );
  }
  const igUserId = String(match.instagram_business_account.id);
  const pageId = String(match.id);
  const pageToken = String(match.access_token);
  const igUsername = await fetchIgUsername(config, igUserId, pageToken);
  const enc = encryptToken(pageToken, config);
  const expiresIn = Number(longTok.expires_in || shortTok.expires_in || 0);
  const tokenExpiresAt =
    expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  await db.query(
    `INSERT INTO user_instagram_connections (
       user_id, ig_user_id, page_id, ig_username, page_access_token_enc, token_expires_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       ig_user_id = EXCLUDED.ig_user_id,
       page_id = EXCLUDED.page_id,
       ig_username = EXCLUDED.ig_username,
       page_access_token_enc = EXCLUDED.page_access_token_enc,
       token_expires_at = EXCLUDED.token_expires_at,
       updated_at = NOW()`,
    [userId, igUserId, pageId, igUsername, enc, tokenExpiresAt]
  );
}

function normalizeAppBase(config) {
  return String(config.appBaseUrl || "")
    .trim()
    .replace(/\/+$/, "");
}

function resolvePublicMediaUrl(mediaStorage, row) {
  if (!mediaStorage || !mediaStorage.resolveMediaUrl) {
    return String(row.media_url || "").trim();
  }
  return mediaStorage.resolveMediaUrl({
    mediaKey: row.media_upload_key || row.media_url,
    mediaUrl: row.media_url
  });
}

function isHttpsPublicUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function inferMimeFromUrl(url) {
  const lower = String(url).split("?")[0].toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".m4v")) {
    return "video/mp4";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "";
}

async function createMediaContainer(config, igUserId, pageToken, { publicUrl, caption, isVideo }) {
  const cap = String(caption || "").slice(0, 2200);
  const path = `${graphBase(config)}/${encodeURIComponent(igUserId)}/media`;
  const body = isVideo
    ? new URLSearchParams({
        media_type: "REELS",
        video_url: String(publicUrl),
        caption: cap,
        access_token: String(pageToken)
      })
    : new URLSearchParams({
        image_url: String(publicUrl),
        caption: cap,
        access_token: String(pageToken)
      });
  const res = await globalThis.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const msg = data.error?.message || "Failed to create Instagram media container";
    const err = new Error(msg);
    err.graph = data;
    throw err;
  }
  return String(data.id);
}

async function pollContainerStatus(config, containerId, pageToken, { maxAttempts = 45, delayMs = 2000 } = {}) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const url = `${graphBase(config)}/${encodeURIComponent(
      containerId
    )}?fields=status_code&access_token=${encodeURIComponent(String(pageToken))}`;
    const data = await fetchJson(url);
    const code = String(data.status_code || "");
    if (code === "FINISHED") {
      return;
    }
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`Instagram container ${code.toLowerCase()}`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Instagram media processing timed out");
}

async function publishContainer(config, igUserId, containerId, pageToken) {
  const url = `${graphBase(config)}/${encodeURIComponent(igUserId)}/media_publish`;
  const body = new URLSearchParams({
    creation_id: String(containerId),
    access_token: String(pageToken)
  });
  const res = await globalThis.fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const msg = data.error?.message || "Failed to publish Instagram media";
    const err = new Error(msg);
    err.graph = data;
    throw err;
  }
  return String(data.id);
}

async function loadConnection(db, config, userId) {
  const r = await db.query(
    `SELECT user_id, ig_user_id, page_id, ig_username, page_access_token_enc
     FROM user_instagram_connections
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  if (r.rowCount === 0) {
    return null;
  }
  const row = r.rows[0];
  const pageToken = decryptToken(row.page_access_token_enc, config);
  return {
    igUserId: String(row.ig_user_id),
    pageId: String(row.page_id),
    igUsername: row.ig_username ? String(row.ig_username) : null,
    pageAccessToken: pageToken
  };
}

function createInstagramCrossPostOrchestrator({ db, config, mediaStorage }) {
  async function enqueueInstagramCrossPost({ userId, postRow, caption, mediaMimeTypeHint }) {
    if (!isMetaConfigured(config)) {
      return;
    }
    const postId = Number(postRow.id);
    if (!postId) {
      return;
    }

    const claim = await db.query(
      `INSERT INTO instagram_cross_posts (post_id, user_id, status)
       VALUES ($1, $2, 'processing')
       ON CONFLICT (post_id) DO NOTHING
       RETURNING id`,
      [postId, userId]
    );
    if (claim.rowCount === 0) {
      return;
    }

    const updateRow = async (fields) => {
      const keys = Object.keys(fields);
      const set = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
      const vals = keys.map((k) => fields[k]);
      await db.query(
        `UPDATE instagram_cross_posts SET ${set}, updated_at = NOW() WHERE post_id = $1 AND user_id = $2`,
        [postId, userId, ...vals]
      );
    };

    try {
      const conn = await loadConnection(db, config, userId);
      if (!conn) {
        await updateRow({ status: "failed", error_message: "Instagram is not connected" });
        return;
      }

      const publicUrl = resolvePublicMediaUrl(mediaStorage, postRow);
      if (!publicUrl || !isHttpsPublicUrl(publicUrl)) {
        await updateRow({
          status: "failed",
          error_message:
            "Post media must use a stable public HTTPS URL (configure MEDIA_PUBLIC_BASE_URL / CloudFront) for Instagram."
        });
        return;
      }

      const mime =
        String(mediaMimeTypeHint || postRow.media_mime_type || inferMimeFromUrl(publicUrl) || "").toLowerCase();
      const isVideo = mime.startsWith("video/");
      const isImage = mime.startsWith("image/");
      if (!isVideo && !isImage) {
        await updateRow({
          status: "failed",
          error_message:
            "Instagram cross-post requires an image or video; set mediaMimeType on create or attach media first."
        });
        return;
      }

      const containerId = await createMediaContainer(config, conn.igUserId, conn.pageAccessToken, {
        publicUrl,
        caption,
        isVideo
      });
      await updateRow({ ig_container_id: containerId });
      await pollContainerStatus(config, containerId, conn.pageAccessToken);
      const igMediaId = await publishContainer(config, conn.igUserId, containerId, conn.pageAccessToken);
      await updateRow({ status: "succeeded", ig_media_id: igMediaId, error_message: null });
    } catch (err) {
      const msg = err.message || String(err);
      await updateRow({ status: "failed", error_message: msg.slice(0, 2000) });
    }
  }

  async function enqueueInstagramCrossPostByPostId(userId, postId) {
    const pid = Number(postId);
    if (!pid || !userId) {
      return { ok: false, reason: "invalid" };
    }
    const r = await db.query(
      `SELECT id, author_id, content, media_url, media_upload_key, media_mime_type, visibility_status
       FROM posts
       WHERE id = $1
         AND author_id = $2
         AND visibility_status = 'visible'
         AND removed_at IS NULL
       LIMIT 1`,
      [pid, userId]
    );
    if (r.rowCount === 0) {
      return { ok: false, reason: "not_found" };
    }
    void enqueueInstagramCrossPost({
      userId,
      postRow: r.rows[0],
      caption: r.rows[0].content,
      mediaMimeTypeHint: r.rows[0].media_mime_type
    }).catch(() => {});
    return { ok: true };
  }

  return {
    enqueueAfterCreatePost: enqueueInstagramCrossPost,
    enqueueByPostId: enqueueInstagramCrossPostByPostId
  };
}

function createInstagramCrossPostJob(deps) {
  const { enqueueAfterCreatePost } = createInstagramCrossPostOrchestrator(deps);
  return enqueueAfterCreatePost;
}

module.exports = {
  OAUTH_SCOPES,
  isMetaConfigured,
  buildAuthorizeUrl,
  signOAuthState,
  verifyOAuthState,
  persistConnectionFromOAuthCode,
  normalizeAppBase,
  createInstagramCrossPostOrchestrator,
  createInstagramCrossPostJob,
  loadConnection
};
