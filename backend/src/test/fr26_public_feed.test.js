import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import pool from '../config/database.js';
import { createPublicFeedRepository } from '../repositories/publicFeed.repository.js';
import {
  createPublicFeedService,
  validatePublicFeedQuery,
} from '../services/publicFeed.service.js';
import { prepareFr26Fixture, ids } from '../testSupport/fr26Fixture.js';

test('public feed query validation rejects malformed filters before querying storage', async () => {
  const invalid = [
    { limit: '0' },
    { limit: '101' },
    { limit: 'NaN' },
    { limit: '2x' },
    { offset: '-1' },
    { offset: '1.5' },
    { offset: '1000001' },
    { q: ['a', 'b'] },
    { q: 'x'.repeat(201) },
    { tag: 'x'.repeat(51) },
    { paperId: 'bad' },
    { sort: 'title; DROP TABLE posts' },
    { visibility: 'PRIVATE' },
    { includePrivate: 'true' },
  ];
  const service = createPublicFeedService({
    list: () => assert.fail('invalid input must not query the DB'),
  });
  for (const query of invalid)
    await assert.rejects(service.list(query), { statusCode: 400 });
  assert.deepEqual(
    validatePublicFeedQuery({
      tag: ' BIOLOGY ',
      q: '  evidence  ',
      sort: 'oldest',
      limit: '12',
      offset: '24',
    }),
    {
      q: 'evidence',
      tag: 'biology',
      paperId: null,
      sort: 'oldest',
      limit: 12,
      offset: 24,
    },
  );
});

test('FR-26 real PostgreSQL feed, search and detail preserve privacy for every viewer', async (t) => {
  const fixture = await prepareFr26Fixture();
  const original = pool.query;
  const originalConnect = pool.connect;
  pool.connect = (...args) => fixture.db.connect(...args);
  pool.query = (...args) => fixture.db.query(...args);
  const repo = createPublicFeedRepository(fixture.db),
    service = createPublicFeedService(repo);
  const token = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET);
  const auth = [
    null,
    token(ids.author, 'RESEARCHER'),
    token(ids.reader, 'STUDENT'),
    token(ids.privateAuthor, 'RESEARCHER'),
    token(ids.admin, 'SYSTEM_ADMIN'),
    'invalid-token',
  ];
  const get = (url, credential) => {
    const call = request(app).get(url);
    return credential
      ? call.set('Authorization', `Bearer ${credential}`)
      : call;
  };
  try {
    await t.test(
      'guests, owners, permitted readers and admins see public posts only, with no account emails or permission data',
      async () => {
        for (const credential of auth) {
          const response = await get('/api/posts?limit=100', credential);
          assert.equal(response.status, 200);
          assert.equal(response.body.total, 31);
          assert.equal(response.body.posts.length, 31);
          assert.equal(response.headers['cache-control'], 'no-store');
          const encoded = JSON.stringify(response.body);
          for (const secret of [
            'PRIVATE_CANARY',
            'LEGACY_PRIVATE_ACCOUNT_CANARY',
            'author_email',
            'password_hash',
            'permission_level',
            '@example.edu',
          ])
            assert.ok(!encoded.includes(secret), secret);
          assert.ok(
            response.body.posts.every((post) => post.visibility === 'PUBLIC'),
          );
        }
      },
    );
    await t.test(
      'text, tag and linked-paper searches use the same visibility boundaries and totals',
      async () => {
        for (const url of [
          '/api/posts?q=PRIVATE_CANARY',
          '/api/posts?q=LEGACY_PRIVATE_ACCOUNT_CANARY',
          '/api/posts?tag=secret-private',
          '/api/posts?q=secret&tag=secret-private',
        ]) {
          const r = await get(url, auth[4]);
          assert.equal(r.status, 200);
          assert.equal(r.body.total, 0);
          assert.deepEqual(r.body.posts, []);
        }
        for (const q of [
          'Public discovery',
          'photosynthesis',
          'Public Scholar',
          'open-science',
        ]) {
          const r = await get('/api/posts?q=' + encodeURIComponent(q));
          assert.equal(r.status, 200);
          assert.ok(r.body.total > 0);
        }
        const tags = await service.list({ tag: 'BIOLOGY', limit: '100' });
        assert.equal(tags.total, 15);
        assert.ok(tags.posts.every((p) => p.tags.includes('biology')));
        const linked = await service.list({ paperId: ids.paper });
        assert.equal(linked.total, 1);
        assert.equal(linked.posts[0].paper_title, 'Linked public research');
        assert.equal(
          (await service.list({ q: '%' })).total,
          1,
          'percent wildcards are literal search characters',
        );
        assert.equal(
          (await service.list({ q: '_' })).total,
          1,
          'underscore wildcards are literal search characters',
        );
        const literal = await service.list({ q: '100%_study' });
        assert.equal(literal.total, 1);
        assert.equal(literal.posts[0].id, ids.specialPost);
        const attack = await service.list({ q: "%' OR 1=1 --" });
        assert.equal(attack.total, 0);
      },
    );
    await t.test(
      'pagination is deterministic including timestamp ties, empty pages and both sort orders',
      async () => {
        await fixture.db.query(
          "UPDATE posts SET created_at='2026-11-01T12:00:00Z' WHERE visibility='PUBLIC'",
        );
        const all = [];
        for (const offset of ['0', '12', '24']) {
          const page = await service.list({ limit: '12', offset });
          assert.equal(page.total, 31);
          all.push(...page.posts.map((p) => p.id));
        }
        assert.equal(all.length, 31);
        assert.equal(new Set(all).size, 31);
        assert.deepEqual(
          (await service.list({ limit: '100', sort: 'oldest' })).posts.map(
            (p) => p.id,
          ),
          [...all].reverse(),
        );
        const empty = await service.list({ offset: '100' });
        assert.equal(empty.total, 31);
        assert.deepEqual(empty.posts, []);
      },
    );
    await t.test(
      'public detail routes return 404 for private, removed and private-author posts for every viewer',
      async () => {
        for (const credential of auth) {
          for (const id of [
            ids.privatePost,
            ids.legacyPost,
            '99999999-9999-4999-8999-999999999999',
          ])
            assert.equal(
              (await get(`/api/posts/public/${id}`, credential)).status,
              404,
            );
          const r = await get(
            `/api/posts/public/${fixture.posts[0]}`,
            credential,
          );
          assert.equal(r.status, 200);
          assert.equal(r.body.post.author_email, undefined);
        }
        assert.equal((await get('/api/posts/public/not-a-uuid')).status, 400);
      },
    );
    await t.test(
      'legacy public author and single-post reads respect current account visibility',
      async () => {
        for (const credential of [null, auth[2]]) {
          const result = await get(
            `/api/posts/author/${ids.privateAuthor}`,
            credential,
          );
          assert.equal(result.status, 200);
          assert.equal(result.body.total, 0);
          assert.deepEqual(result.body.posts, []);
          assert.ok(
            [401, 403, 404].includes(
              (await get(`/api/posts/${ids.legacyPost}`, credential)).status,
            ),
          );
          const visible = await get(
            `/api/posts/${fixture.posts[0]}`,
            credential,
          );
          assert.equal(visible.status, 200);
          assert.equal(visible.body.post.author_email, undefined);
          const author = await get(
            `/api/posts/author/${ids.author}`,
            credential,
          );
          assert.ok(
            author.body.posts.every((post) => !('author_email' in post)),
          );
        }
        assert.equal(
          (await get(`/api/posts/${ids.legacyPost}`, auth[3])).status,
          200,
          'private author retains their own authorized access',
        );
      },
    );
    await t.test(
      'post/account privacy changes remove results immediately without changing saved posts',
      async () => {
        const author = auth[1];
        const priv = await request(app)
          .patch(`/api/posts/${fixture.posts[0]}`)
          .set('Authorization', `Bearer ${author}`)
          .send({ visibility: 'PRIVATE' });
        assert.equal(priv.status, 200);
        assert.equal(
          (await get('/api/posts?q=Public%20discovery%2000')).body.total,
          0,
        );
        assert.equal(
          (await get(`/api/posts/public/${fixture.posts[0]}`)).status,
          404,
        );
        const account = await request(app)
          .patch('/api/users/me/account-type')
          .set('Authorization', `Bearer ${author}`)
          .send({ account_type: 'PRIVATE' });
        assert.equal(account.status, 200);
        assert.equal((await get('/api/posts')).body.total, 0);
        assert.equal(
          (await fixture.db.query('SELECT COUNT(*)::int n FROM posts')).rows[0]
            .n,
          33,
          'privacy filtering must not delete records',
        );
        await request(app)
          .patch('/api/users/me/account-type')
          .set('Authorization', `Bearer ${author}`)
          .send({ account_type: 'PUBLIC' })
          .expect(200);
        assert.equal(
          (await get('/api/posts')).body.total,
          30,
          'explicitly private posts stay private after account reopens',
        );
      },
    );
    await t.test(
      'missing migrations and database outages return safe noncached 503 responses',
      async () => {
        const normal = pool.query;
        try {
          for (const code of ['42P01', '42703', 'ECONNRESET']) {
            pool.query = async () => {
              throw Object.assign(new Error('internal database detail'), {
                code,
              });
            };
            for (const url of [
              '/api/posts',
              `/api/posts/public/${ids.specialPost}`,
            ]) {
              const response = await get(url);
              assert.equal(response.status, 503);
              assert.equal(response.headers['cache-control'], 'no-store');
              assert.ok(
                !JSON.stringify(response.body).includes(
                  'internal database detail',
                ),
              );
            }
          }
        } finally {
          pool.query = normal;
        }
      },
    );
    await t.test(
      'invalid API filters are 400 and SQL/XSS input is returned only as inert public text',
      async () => {
        for (const query of [
          'limit=bad',
          'offset=-1',
          'paperId=bad',
          'q=a&q=b',
          'q[x]=y',
          'sort=private',
          'visibility=PRIVATE',
        ])
          assert.equal((await get('/api/posts?' + query)).status, 400, query);
        const post = (await get(`/api/posts/public/${ids.specialPost}`)).body
          .post;
        assert.ok(post.content.includes('<img'));
      },
    );
  } finally {
    pool.query = original;
    pool.connect = originalConnect;
    await fixture.cleanup();
  }
});
