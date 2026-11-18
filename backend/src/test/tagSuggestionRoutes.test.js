/**
 * tagSuggestionRoutes.test.js
 * Unit and integration tests for FR-23: Tag Suggestions routes and authentication.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';

describe('FR-23 Tag Suggestion Routes Authorization', () => {
  const dummyPaperId = '00000000-0000-0000-0000-000000000000';
  const dummySuggestionId = '00000000-0000-0000-0000-000000000001';

  it('rejects unauthenticated requests to generate suggestions with 401', async () => {
    const res = await request(app)
      .post(`/api/papers/${dummyPaperId}/tag-suggestions/generate`)
      .send({ title: 'Test Paper' });

    assert.equal(res.status, 401);
  });

  it('rejects unauthenticated requests to list suggestions with 401', async () => {
    const res = await request(app)
      .get(`/api/papers/${dummyPaperId}/tag-suggestions`);

    assert.equal(res.status, 401);
  });

  it('rejects unauthenticated requests to accept suggestion with 401', async () => {
    const res = await request(app)
      .post(`/api/papers/tag-suggestions/${dummySuggestionId}/accept`)
      .send({ visibility: 'PRIVATE' });

    assert.equal(res.status, 401);
  });

  it('rejects unauthenticated requests to reject suggestion with 401', async () => {
    const res = await request(app)
      .post(`/api/papers/tag-suggestions/${dummySuggestionId}/reject`)
      .send({ reason: 'Not relevant' });

    assert.equal(res.status, 401);
  });
});
