import { test, expect } from '@playwright/test';
const api = 'http://127.0.0.1:5056';
let fixture;
test.beforeAll(async ({ request }) => {
  fixture = await (await request.get(api + '/__fr26/fixture')).json();
});
test.beforeEach(async ({ request }) => {
  await request.post(api + '/__fr26/reset');
});
const login = async (context, kind) =>
  context.addCookies([
    {
      name: 'token',
      value: fixture.tokens[kind],
      url: 'http://127.0.0.1:5176',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
const feed = async (page) => {
  await page.goto('/feed');
  await expect(
    page.getByRole('heading', { name: 'Public feed', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: '31 public posts' }),
  ).toBeVisible();
};
const search = async (page, q, tag = '') => {
  await page
    .getByRole('searchbox', { name: 'Search public posts', exact: true })
    .fill(q);
  await page.getByLabel('Topic tag', { exact: true }).fill(tag);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
};

test('anonymous public discovery shows actual API posts and excludes private text from responses and DOM', async ({
  page,
}, testInfo) => {
  const payloads = [];
  page.on('response', async (response) => {
    if (response.url().includes('/api/posts'))
      payloads.push(await response.text());
  });
  await feed(page);
  await expect(page.getByRole('article')).toHaveCount(12);
  await expect(
    page.getByRole('link', {
      name: 'Read post: Literal 100%_study',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/PRIVATE_CANARY|LEGACY_PRIVATE_ACCOUNT_CANARY/),
  ).toHaveCount(0);
  expect(payloads.join('')).not.toContain('author_email');
  expect(payloads.join('')).not.toContain('PRIVATE_CANARY');
  expect(await page.evaluate(() => window.__fr26_xss)).toBeUndefined();
  const publicDetail = await (
    await page.request.get(`/api/posts/${fixture.ids.specialPost}`)
  ).json();
  expect(publicDetail.post.author_email).toBeUndefined();
  const privateAuthor = await (
    await page.request.get(`/api/posts/author/${fixture.ids.privateAuthor}`)
  ).json();
  expect(privateAuthor.total).toBe(0);
  expect(
    (await page.request.get(`/api/posts/${fixture.ids.legacyPost}`)).status(),
  ).toBe(401);

  const contrast = await page.evaluate(() => {
    const rgba = (value) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const c = canvas.getContext('2d');
      c.fillStyle = value;
      c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data];
    };
    const luminance = (c) =>
      c
        .slice(0, 3)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    return [
      ...document.querySelectorAll('form label, form input, form select'),
    ].map((element) => {
      let parent = element,
        bg;
      while (parent) {
        bg = rgba(getComputedStyle(parent).backgroundColor);
        if (bg[3] === 255) break;
        parent = parent.parentElement;
      }
      const fg = luminance(rgba(getComputedStyle(element).color)),
        back = luminance(bg);
      return {
        element: element.tagName + ' ' + (element.id || element.textContent),
        ratio: (Math.max(fg, back) + 0.05) / (Math.min(fg, back) + 0.05),
      };
    });
  });
  expect(
    contrast.filter((sample) => sample.ratio < 4.5),
    JSON.stringify(contrast),
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('public-feed.png'),
    fullPage: true,
  });
});

test('search matches body text, author names and exact tags without revealing private results', async ({
  page,
}) => {
  await feed(page);
  await search(page, 'photosynthesis');
  await expect(
    page.getByRole('status').filter({ hasText: '1 public post matching' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Public discovery 25', exact: true }),
  ).toBeVisible();
  await search(page, '', 'BIOLOGY');
  await expect(
    page.getByRole('status').filter({ hasText: '15 public posts' }),
  ).toBeVisible();
  await search(page, 'Public Scholar', '');
  await expect(
    page.getByRole('status').filter({ hasText: '31 public posts matching' }),
  ).toBeVisible();
  await search(page, 'PRIVATE_CANARY');
  await expect(
    page.getByRole('heading', { name: 'No public posts match your search' }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('article')).toHaveCount(12);
});

test('pagination, sorting, refresh and browser history preserve the search URL', async ({
  page,
}) => {
  await feed(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/offset=12/);
  await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('article')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page).toHaveURL(/offset=12/);
  await page.getByLabel('Sort posts').selectOption('oldest');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).not.toHaveURL(/offset=/);
  await expect(
    page.getByRole('heading', { name: 'Public discovery 00', exact: true }),
  ).toBeVisible();
  await search(page, 'photosynthesis');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole('searchbox', { name: 'Search public posts', exact: true }),
  ).toHaveValue('photosynthesis');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.goBack();
  await expect(
    page.getByRole('searchbox', { name: 'Search public posts', exact: true }),
  ).toHaveValue('');
});

test('public detail, topic and paper filters work with original public content', async ({
  page,
}) => {
  await page.goto('/feed?sort=oldest');
  await page
    .getByRole('link', { name: 'Read post: Public discovery 00', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Public discovery 00', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Visible research evidence 0.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Sign in to read linked paper/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: '#biology', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '15 public posts' }),
  ).toBeVisible();
  await page.goto(`/feed?paperId=${fixture.ids.paper}`);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Public discovery 00', exact: true }),
  ).toBeVisible();
});

test('owners, permitted readers and admins never see private posts in the public surface', async ({
  page,
  context,
}) => {
  for (const kind of ['author', 'reader', 'admin']) {
    await login(context, kind);
    await feed(page);
    await page.goto(`/feed/${fixture.ids.privatePost}`);
    await expect(
      page.getByRole('heading', { name: 'Public post unavailable' }),
    ).toBeVisible();
    await expect(
      page.getByText('PRIVATE_CANARY', { exact: false }),
    ).toHaveCount(0);
  }
});

test('changing post/account privacy through FR25 removes discovery results and direct public views', async ({
  page,
  request,
}) => {
  await feed(page);
  const headers = { Authorization: `Bearer ${fixture.tokens.author}` };
  expect(
    (
      await request.patch(api + `/api/posts/${fixture.ids.specialPost}`, {
        headers,
        data: { visibility: 'PRIVATE' },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Refresh feed' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '30 public posts' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Literal 100%_study', exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await request.patch(api + '/api/users/me/account-type', {
        headers,
        data: { account_type: 'PRIVATE' },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Refresh feed' }).click();
  await expect(
    page.getByRole('heading', { name: 'No public posts yet' }),
  ).toBeVisible();
  await page.goto(`/feed/${fixture.posts[0]}`);
  await expect(
    page.getByRole('heading', { name: 'Public post unavailable' }),
  ).toBeVisible();
});

test('new posts created through FR25 appear only when the account and post are public', async ({
  page,
  request,
}) => {
  const headers = { Authorization: `Bearer ${fixture.tokens.author}` };
  const pub = await request.post(api + '/api/posts', {
    headers,
    data: {
      title: 'Fresh public discovery',
      content: 'Created through the existing FR25 API.',
      visibility: 'PUBLIC',
      tags: ['fresh'],
    },
  });
  expect(pub.status()).toBe(201);
  const privatePost = await request.post(api + '/api/posts', {
    headers,
    data: {
      title: 'NEW_PRIVATE_CANARY',
      content: 'Private post must never appear.',
      visibility: 'PRIVATE',
    },
  });
  expect(privatePost.status()).toBe(201);
  await page.goto('/feed?tag=fresh');
  await expect(
    page.getByRole('heading', { name: 'Fresh public discovery', exact: true }),
  ).toBeVisible();
  const id = (await pub.json()).post.id;
  expect(
    (await request.delete(api + `/api/posts/${id}`, { headers })).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Refresh feed' }).click();
  await expect(
    page.getByRole('heading', { name: 'No public posts match your search' }),
  ).toBeVisible();
  await page.goto(`/feed/${id}`);
  await expect(
    page.getByRole('heading', { name: 'Public post unavailable' }),
  ).toBeVisible();
});

test('empty results, invalid filters and unavailable post URLs have clear recovery', async ({
  page,
}) => {
  await page.goto('/feed?q=nonexistent-query');
  await expect(
    page.getByRole('heading', { name: 'No public posts match your search' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('article')).toHaveCount(12);
  await page.goto('/feed?offset=999');
  await expect(
    page.getByRole('heading', { name: 'No posts on this page' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'First page' }).click();
  await expect(page.getByRole('article')).toHaveCount(12);
  await page.goto('/feed?limit=invalid&visibility=PRIVATE');
  await expect(
    page.getByRole('heading', { name: 'Could not load public feed' }),
  ).toBeVisible();
  await page.goto('/feed/not-a-valid-id');
  await expect(
    page.getByRole('heading', { name: 'Public post unavailable' }),
  ).toBeVisible();
});

test('loading, server errors and retry are visible without retaining stale results', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/api/posts?**', async (route) => {
    if (fail) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Feed temporarily unavailable. Please retry.',
        }),
      });
    } else await route.continue();
  });
  await page.goto('/feed');
  await expect(
    page.getByRole('status').filter({ hasText: 'Loading public posts' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Could not load public feed' }),
  ).toBeVisible();
  expect(await page.getByRole('article').count()).toBe(0);
  fail = false;
  await page.getByRole('button', { name: 'Try Again' }).click();
  await expect(page.getByRole('article')).toHaveCount(12);
});

test('slow old search responses cannot overwrite the latest results', async ({
  page,
}) => {
  await page.route('**/api/posts?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') === 'old-slow')
      await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue().catch(() => {});
  });
  await feed(page);
  await search(page, 'old-slow');
  await search(page, 'photosynthesis');
  await expect(
    page.getByRole('heading', { name: 'Public discovery 25', exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(800);
  await expect(
    page.getByRole('heading', { name: 'Public discovery 25', exact: true }),
  ).toBeVisible();
});

test('keyboard search, readable labels and responsive navigation work at narrow widths', async ({
  page,
  context,
}) => {
  await feed(page);
  await page
    .getByRole('searchbox', { name: 'Search public posts', exact: true })
    .fill('photosynthesis');
  await page
    .getByRole('searchbox', { name: 'Search public posts', exact: true })
    .press('Enter');
  await expect(page.getByRole('article')).toHaveCount(1);
  await search(page, 'x'.repeat(200));
  await expect(
    page.getByRole('heading', { name: 'No public posts match your search' }),
  ).toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const box = await page
      .getByRole('button', { name: 'Search', exact: true })
      .boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await login(context, 'reader');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/feed');
  await page.getByRole('link', { name: 'Feed', exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByRole('article')).toHaveCount(12);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('the public landing page links to discovery without signing in', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('link', { name: 'Browse public posts', exact: true })
    .click();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByRole('article')).toHaveCount(12);
});
