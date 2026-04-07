import { test, expect, APIRequestContext, Page } from "@playwright/test";

const backendBaseUrl =
  process.env.BACKEND_API_URL || "http://127.0.0.1:8080/api/v1";

async function register(
  request: APIRequestContext,
  payload: { email: string; username: string; password: string; displayName: string }
) {
  const response = await request.post(`${backendBaseUrl}/auth/register`, {
    data: payload
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function ensureUser(
  request: APIRequestContext,
  payload: { email: string; username: string; password: string; displayName: string }
) {
  const registerResponse = await request.post(`${backendBaseUrl}/auth/register`, {
    data: payload
  });

  if (registerResponse.ok()) {
    return registerResponse.json();
  }

  const loginResponse = await request.post(`${backendBaseUrl}/auth/login`, {
    data: {
      email: payload.email,
      password: payload.password
    }
  });
  expect(loginResponse.ok()).toBeTruthy();
  return loginResponse.json();
}

async function loginViaUi(page: Page, baseURL: string, email: string, password: string) {
  await page.goto(`${baseURL}/auth/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

/** Dismiss “Personalize your experience” overlay without relying on UI (buttons navigate away). */
async function dismissBusinessOnboardingViaApi(request: APIRequestContext, accessToken: string) {
  const res = await request.patch(`${backendBaseUrl}/users/me/preferences`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { businessOnboardingDismissed: true, preferenceSource: "e2e" }
  });
  expect(res.ok()).toBeTruthy();
}

async function dismissBizOverlayFromBrowserSession(request: APIRequestContext, page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("deenly_access_token") || "");
  if (!token) {
    return;
  }
  await dismissBusinessOnboardingViaApi(request, token);
  // PATCH updates the DB but the SPA keeps stale React Query data for /users/me; reload refetches so the overlay unmounts.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[role="dialog"][aria-labelledby="biz-personalizer-title"]')).toHaveCount(0, {
    timeout: 20_000
  });
}

test("core loop: signup/login, create+upload, feed pagination, interact/follow/report", async ({
  page,
  request,
  baseURL
}) => {
  const timestamp = Date.now();
  const password = "StrongPass123";

  const creator = await register(request, {
    email: `creator-${timestamp}@example.com`,
    username: `creator_${timestamp}`,
    password,
    displayName: "Creator"
  });
  const creatorToken = creator.tokens.accessToken as string;

  const proRes = await request.patch(`${backendBaseUrl}/users/me/preferences`, {
    headers: { Authorization: `Bearer ${creatorToken}` },
    data: { usagePersona: "professional", preferenceSource: "e2e_core_loop" }
  });
  expect(proRes.ok()).toBeTruthy();

  for (let i = 0; i < 12; i += 1) {
    const response = await request.post(`${backendBaseUrl}/posts`, {
      headers: { Authorization: `Bearer ${creatorToken}` },
      data: {
        postType: "post",
        content: `Seed post ${i} for pagination ${timestamp}`
      }
    });
    expect(response.ok()).toBeTruthy();
  }

  const productRes = await request.post(`${backendBaseUrl}/monetization/products`, {
    headers: { Authorization: `Bearer ${creatorToken}` },
    data: {
      title: `E2E Product ${timestamp}`,
      description: "E2E catalog product for public page and profile tab.",
      productType: "digital",
      priceMinor: 499,
      currency: "usd",
      deliveryMediaKey: "uploads/e2e-delivery.bin"
    }
  });
  expect(productRes.ok()).toBeTruthy();
  const productJson = (await productRes.json()) as { id: number };
  const publishProductRes = await request.post(
    `${backendBaseUrl}/monetization/products/${productJson.id}/publish`,
    {
      headers: { Authorization: `Bearer ${creatorToken}` }
    }
  );
  expect(publishProductRes.ok()).toBeTruthy();
  const e2eProductId = productJson.id;

  await page.goto(`${baseURL}/auth/signup`);
  await page.getByLabel("First Name").fill("Viewer");
  await page.getByLabel("Last Name").fill("User");
  await page.getByLabel("Username").fill(`viewer_${timestamp}`);
  await page.getByLabel("Email").fill(`viewer-${timestamp}@example.com`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await dismissBizOverlayFromBrowserSession(request, page);

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/auth\/login(\?.*)?$/);

  await page.getByLabel("Email").fill(`viewer-${timestamp}@example.com`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await dismissBizOverlayFromBrowserSession(request, page);
  await page.getByRole("link", { name: "Search" }).first().click();
  await expect(page).toHaveURL(/\/search/);
  await page.goto(`${baseURL}/home`);

  await page.goto(`${baseURL}/account`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "avatar.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("tiny-avatar-content")
  });
  await expect(page.getByText("Unable to upload photo.")).toHaveCount(0);
  const avatarImage = page.locator('img[alt="Profile avatar"]').first();
  const avatarFallback = page.locator(".profile-avatar").first();
  await expect
    .poll(
      async () => {
        const imageVisible =
          (await avatarImage.count()) > 0 && (await avatarImage.isVisible().catch(() => false));
        const fallbackVisible =
          (await avatarFallback.count()) > 0 && (await avatarFallback.isVisible().catch(() => false));
        return imageVisible || fallbackVisible;
      },
      { timeout: 10000 }
    )
    .toBe(true);

  // Load more lives on the home feed (FeedView), not the account profile grid.
  await page.goto(`${baseURL}/home`);
  await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
  const postLinks = page.getByRole("link", { name: "Open post" });
  const initialPostCount = await postLinks.count();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect
    .poll(async () => postLinks.count(), { timeout: 10000 })
    .toBeGreaterThan(initialPostCount);

  await page.goto(`${baseURL}/users/${creator.user.id}`);
  await expect(page.getByText(/Likes received:/)).toBeVisible();
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(page.getByText(/now following/i)).toBeVisible();

  await page.goto(`${baseURL}/products/${e2eProductId}`);
  await expect(page.getByRole("heading", { name: `E2E Product ${timestamp}` })).toBeVisible();

  await page.goto(`${baseURL}/users/${creator.user.id}`);
  await page.getByRole("button", { name: "Products" }).click();
  await expect(page.getByText(`E2E Product ${timestamp}`)).toBeVisible();
  await page.getByRole("link", { name: "See more" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/products/${e2eProductId}`));

  await page.goto(`${baseURL}/create`);
  await page.getByLabel("Post caption").fill(`Uploaded post ${timestamp}`);
  await page.locator('input[name="mediaFile"]').setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("tiny-video-content")
  });
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/posts\/\d+$/);
  await expect(page.locator("video")).toBeVisible();

  await page.goto(`${baseURL}/home`);
  const videoCard = page.locator("article", { hasText: `Uploaded post ${timestamp}` }).first();
  await expect(videoCard).toBeVisible();
  await expect(videoCard.locator("video")).toBeVisible();
  await videoCard.getByRole("link", { name: "View discussion" }).click();
  await expect(page).toHaveURL(/\/posts\/\d+$/);

  const benefitedRequest = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/interactions") &&
      !response.url().includes("/interactions/view")
  );
  const likeButton = page.getByRole("button", { name: /Like|Unlike/i }).first();
  await expect(likeButton).toBeVisible();
  await likeButton.click();
  const benefitedResponse = await benefitedRequest;
  expect(benefitedResponse.ok()).toBeTruthy();

  await page.getByPlaceholder("Reason").fill("test report reason");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("Report submitted.")).toBeVisible();

  await page.goto(`${baseURL}/create`);
  await page.getByLabel("Post caption").fill(`Image post ${timestamp}`);
  await page.locator('input[name="mediaFile"]').setInputFiles({
    name: "cover.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("tiny-image-content")
  });
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/posts\/\d+$/);
  await expect(page.locator('img[alt*="post media"]')).toBeVisible();

  await page.goto(`${baseURL}/home`);
  const imageCard = page.locator("article", { hasText: `Image post ${timestamp}` }).first();
  await expect(imageCard).toBeVisible();
  await expect(imageCard.locator("img")).toBeVisible();
});

test("admin feedback loop: owner access, tables, and operations form", async ({
  page,
  request,
  baseURL
}) => {
  const timestamp = Date.now();
  const password = "StrongPass123";
  const adminEmail = process.env.E2E_ADMIN_OWNER_EMAIL || "aidenrigali04@gmail.com";
  const target = await ensureUser(request, {
    email: `target-e2e-${timestamp}@example.com`,
    username: `target_e2e_${timestamp}`,
    password,
    displayName: "Target User"
  });

  const adminSession = await ensureUser(request, {
    email: adminEmail,
    username: `admin_e2e_${timestamp}`,
    password,
    displayName: "Admin Owner"
  });
  const adminToken = adminSession.tokens.accessToken as string;
  await dismissBusinessOnboardingViaApi(request, adminToken);

  await loginViaUi(page, String(baseURL), adminEmail, password);
  await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();

  await page.goto(`${baseURL}/admin`);
  await expect(page.getByText("Admin Console")).toBeVisible();

  await page.goto(`${baseURL}/admin/tables/users`);
  await expect(page.getByText("Table: users")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();

  await page.goto(`${baseURL}/admin/operations`);
  await page.getByRole("button", { name: "Create invite" }).click();
  await expect(page.getByText(/Invite created:/)).toBeVisible();

  await page.goto(`${baseURL}/admin/moderation`);
  await page.getByPlaceholder("User ID").first().fill(String(target.user.id));
  await page.getByPlaceholder("Reason").first().fill("e2e warning verification");
  await page.getByRole("button", { name: "Send warning" }).click();
  await expect(page.getByText("Warning issued.")).toBeVisible();
});
