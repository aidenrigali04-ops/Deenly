import { test, expect, APIRequestContext } from "@playwright/test";

const backendBaseUrl =
  process.env.BACKEND_API_URL || "http://127.0.0.1:4000/api/v1";

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

  for (let i = 0; i < 12; i += 1) {
    const response = await request.post(`${backendBaseUrl}/posts`, {
      headers: { Authorization: `Bearer ${creatorToken}` },
      data: {
        postType: "community",
        content: `Seed post ${i} for pagination ${timestamp}`
      }
    });
    expect(response.ok()).toBeTruthy();
  }

  await page.goto(`${baseURL}/auth/signup`);
  await page.getByPlaceholder("Email").fill(`viewer-${timestamp}@example.com`);
  await page
    .getByPlaceholder("Username (lowercase, numbers, underscore)")
    .fill(`viewer_${timestamp}`);
  await page.getByPlaceholder("Display name").fill("Viewer");
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/feed$/);

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  await page.getByPlaceholder("Email").fill(`viewer-${timestamp}@example.com`);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/feed$/);

  await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("link", { name: "Open post" })).toHaveCount(20);

  await page.goto(`${baseURL}/users/${creator.user.id}`);
  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByText("Followed successfully.")).toBeVisible();

  await page.goto(`${baseURL}/create`);
  await page.getByPlaceholder("Share your message...").fill(`Uploaded post ${timestamp}`);
  await page.locator('input[name="mediaFile"]').setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("tiny-video-content")
  });
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/posts\/\d+$/);

  await page.getByRole("button", { name: "Benefited" }).click();
  await expect(page.getByText(/Benefited:\s*[1-9]/)).toBeVisible();

  await page.getByPlaceholder("Reason").fill("test report reason");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("Report submitted.")).toBeVisible();
});
