import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:5056";
let fixture;
test.beforeAll(async ({ request }) => {
  fixture = await (await request.get(api + "/__fr26/fixture")).json();
});
test.beforeEach(async ({ request, page }, testInfo) => {
  await request.post(api + "/__fr26/reset");
  await page.addInitScript(
    (theme) => localStorage.setItem("crpe_theme", theme),
    testInfo.project.name.endsWith("light") ? "light" : "dark",
  );
});
const login = async (context, kind) =>
  context.addCookies([
    {
      name: "token",
      value: fixture.tokens[kind],
      url: "http://127.0.0.1:5176",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
const email = (kind) => fixture.ids[kind] + "@example.edu";
const auth = (kind) => ({ Authorization: "Bearer " + fixture.tokens[kind] });
const open = async (page) => {
  await page.goto("/posts/" + fixture.ids.privatePost);
  await expect(
    page.getByRole("heading", {
      name: "PRIVATE_CANARY unique secret",
      exact: true,
    }),
  ).toBeVisible();
};
const share = async (page, target, level = "READ") => {
  await page.getByLabel("Registered user's email").fill(email(target));
  await page
    .getByRole("combobox", { name: "Permission", exact: true })
    .selectOption(level);
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Access saved." }),
  ).toBeVisible();
};

test("owner can discover private posts, open sharing controls and grant registered users read access", async ({
  page,
  context,
  request,
}, testInfo) => {
  await login(context, "author");
  await page.goto("/posts");
  await expect(
    page.getByRole("heading", { name: "My & shared posts", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "PRIVATE_CANARY unique secret", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  await share(page, "outsider");
  const row = page.getByRole("listitem").filter({ hasText: email("outsider") });
  await expect(row.getByText("Read only", { exact: true })).toBeVisible();
  expect(
    (
      await request.get(
        api + "/api/posts/workspace/" + fixture.ids.privatePost,
        { headers: auth("outsider") },
      )
    ).status(),
  ).toBe(200);
  await page.screenshot({
    path: testInfo.outputPath("private-post-sharing.png"),
    fullPage: true,
  });
});

test("reader sees shared post and full content with no edit, roster or management controls", async ({
  page,
  context,
}) => {
  await login(context, "reader");
  await page.goto("/posts");
  await expect(
    page.getByRole("status").filter({ hasText: "1 accessible posts" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open post", exact: true }).click();
  await expect(
    page.getByText("This private content must never reach public discovery.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Read-only access/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit post", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Manage access", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.patch(api + "/api/posts/" + fixture.ids.privatePost, {
        headers: auth("reader"),
        data: { content: "Reader malicious overwrite" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get(
        api + "/api/posts/" + fixture.ids.privatePost + "/permissions",
        { headers: auth("reader") },
      )
    ).status(),
  ).toBe(403);
});

test("writer edits content and tags, persists after reload and cannot change privacy or sharing", async ({
  page,
  context,
}) => {
  await login(context, "writer");
  await open(page);
  await page.getByRole("button", { name: "Edit post", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Post title", exact: true })
    .fill("Collaborative Unicode αβ research");
  await page
    .getByRole("textbox", { name: "Post content", exact: true })
    .fill(
      "Technical notes from the collaborating writer. <img src=x onerror=window.FR30=true>",
    );
  await page
    .getByLabel("Topic tags, separated by commas")
    .fill("physics, research");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Collaborative Unicode αβ research",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(/Technical notes from the collaborating writer/),
  ).toBeVisible();
  expect(await page.evaluate(() => window.FR30)).toBeUndefined();
  await expect(
    page.getByRole("button", { name: "Manage access", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.patch(api + "/api/posts/" + fixture.ids.privatePost, {
        headers: auth("writer"),
        data: { visibility: "PUBLIC" },
      })
    ).status(),
  ).toBe(400);
});

test("owner upgrades and downgrades access without duplicate entries then revokes access", async ({
  page,
  context,
  request,
}) => {
  await login(context, "author");
  await open(page);
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  await share(page, "outsider", "WRITE");
  let row = page.getByRole("listitem").filter({ hasText: email("outsider") });
  await expect(row.getByText("Read and write", { exact: true })).toBeVisible();
  await share(page, "outsider", "READ");
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Read only", { exact: true })).toBeVisible();
  expect(
    (
      await request.patch(
        api + "/api/posts/workspace/" + fixture.ids.privatePost,
        {
          headers: auth("outsider"),
          data: { content: "Should fail after downgrade" },
        },
      )
    ).status(),
  ).toBe(403);
  await row
    .getByRole("button", {
      name: "Remove access for " + email("outsider"),
      exact: true,
    })
    .click();
  await expect(row).toHaveCount(0);
  expect(
    (
      await request.get(
        api + "/api/posts/workspace/" + fixture.ids.privatePost,
        { headers: auth("outsider") },
      )
    ).status(),
  ).toBe(404);
});

test("revoked writer loses stale edit controls and private content when attempting to save", async ({
  page,
  context,
  request,
}) => {
  await login(context, "writer");
  await open(page);
  await page.getByRole("button", { name: "Edit post", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Post content", exact: true })
    .fill("Stale write must never persist");
  expect(
    (
      await request.delete(
        api +
          "/api/posts/" +
          fixture.ids.privatePost +
          "/permissions/" +
          fixture.ids.writer,
        { headers: auth("author") },
      )
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Post unavailable", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "PRIVATE_CANARY unique secret",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Post content", exact: true }),
  ).toHaveCount(0);
  const post = (
    await (
      await request.get(
        api + "/api/posts/workspace/" + fixture.ids.privatePost,
        { headers: auth("author") },
      )
    ).json()
  ).post;
  expect(post.content).not.toBe("Stale write must never persist");
});

test("uninvited users see no private posts and guessed direct links do not reveal content", async ({
  page,
  context,
}) => {
  await login(context, "outsider");
  await page.goto("/posts");
  await expect(
    page.getByRole("status").filter({ hasText: "0 accessible posts" }),
  ).toBeVisible();
  await page.goto("/posts/" + fixture.ids.privatePost);
  await expect(
    page.getByRole("heading", { name: "Post unavailable", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("PRIVATE_CANARY unique secret", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/feed");
  await expect(
    page.getByRole("heading", { name: "Public feed", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("PRIVATE_CANARY unique secret", { exact: true }),
  ).toHaveCount(0);
});

test("anonymous private post navigation requests sign in without fetching protected post content", async ({
  page,
}) => {
  const leaked = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/posts/workspace")) leaked.push(await r.text());
  });
  await page.goto("/posts/" + fixture.ids.privatePost);
  await expect(page).toHaveURL(/\/login/);
  expect(leaked.join("")).not.toContain("PRIVATE_CANARY");
});

test("owner creates a private post and can share it immediately, while canceling an edit preserves text", async ({
  page,
  context,
}) => {
  await login(context, "author");
  await page.goto("/posts");
  await page
    .getByRole("button", { name: "New private post", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Post title", exact: true })
    .fill("New permission-controlled research");
  await page
    .getByRole("textbox", { name: "Post content", exact: true })
    .fill("Private collaborative research notes.");
  await page
    .getByRole("button", { name: "Create private post", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "New permission-controlled research",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit post", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Post title", exact: true })
    .fill("Discarded edit");
  await page
    .getByRole("button", { name: "Cancel editing", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "New permission-controlled research",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  await share(page, "reader");
});

test("invalid recipients and rejected grants show clear errors while preserving the permission roster", async ({
  page,
  context,
}) => {
  await login(context, "author");
  await open(page);
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  await page
    .getByLabel("Registered user's email")
    .fill("unknown-user@example.edu");
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No registered user");
  await expect(
    page.getByRole("listitem").filter({ hasText: email("reader") }),
  ).toBeVisible();
  await page.getByLabel("Registered user's email").fill(email("author"));
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "owner already has full access",
  );
});

test("current administrator can moderate and share the private post", async ({
  page,
  context,
}) => {
  await login(context, "admin");
  await open(page);
  await expect(
    page.getByRole("button", { name: "Edit post", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  await share(page, "outsider");
});

test("server errors are recoverable without displaying stale private content", async ({
  page,
  context,
}) => {
  await login(context, "reader");
  let fail = true;
  await page.route(
    "**/api/posts/workspace/" + fixture.ids.privatePost,
    (route) =>
      fail
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Temporarily unavailable." }),
          })
        : route.continue(),
  );
  await page.goto("/posts/" + fixture.ids.privatePost);
  await expect(page.getByRole("alert")).toContainText(
    "Temporarily unavailable.",
  );
  await expect(
    page.getByText("PRIVATE_CANARY unique secret", { exact: true }),
  ).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "PRIVATE_CANARY unique secret",
      exact: true,
    }),
  ).toBeVisible();
});

test("permission form supports keyboard input and fits narrow screens with readable controls", async ({
  page,
  context,
}) => {
  await login(context, "author");
  await open(page);
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  const field = page.getByLabel("Registered user's email");
  await field.focus();
  await page.keyboard.type(email("outsider"));
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("combobox", { name: "Permission", exact: true }),
  ).toBeFocused();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(1);
    for (const control of [
      field,
      page.getByRole("combobox", { name: "Permission", exact: true }),
      page.getByRole("button", { name: "Save access", exact: true }),
    ]) {
      const box = await control.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  const contrast = await field.evaluate((el) => {
    const rgb = (value) => {
      const c = document.createElement("canvas").getContext("2d");
      c.fillStyle = value;
      c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = (rgb) =>
      rgb
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const style = getComputedStyle(el),
      fg = lum(rgb(style.color)),
      bg = lum(rgb(style.backgroundColor));
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
});

test("workspace pagination, out-of-range pages and invalid offsets recover without an endless loading state", async ({
  page,
  context,
}) => {
  await login(context, "author");
  await page.goto("/posts");
  await expect(page.locator(".private-posts article")).toHaveCount(12);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(/offset=12/);
  await page.reload();
  await expect(page.locator(".private-posts article")).toHaveCount(12);
  await page.goto("/posts?offset=1000");
  await expect(page.getByText(/No posts on this page/)).toBeVisible();
  await page.goto("/posts?offset=invalid");
  await expect(page.getByRole("alert")).toContainText("Invalid pagination");
  await page.goto("/posts");
  await expect(page.locator(".private-posts article")).toHaveCount(12);
});
