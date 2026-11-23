import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database.js';
import { findPublicationCountsByUserId } from '../repositories/researcherProfile.repository.js';
import * as discoveryService from '../services/publicationDiscovery.service.js';
import { reviewPublication } from '../controllers/publicationDiscovery.controller.js';

const researcherId = 'a1000000-0000-4000-8000-000000000001';
const originalQuery = pool.query;

describe('FR41 publication verification', () => {
  let queries;

  beforeEach(() => {
    queries = [];
    pool.query = async (sql, params = []) => {
      const text = String(sql);
      queries.push({ text, params });

      if (text.includes('platform_verified_count')) {
        return { rows: [{ platform_count: 2, platform_verified_count: 1, platform_uncertain_count: 1 }] };
      }
      if (text.includes('verified_external_count')) {
        return { rows: [{ external_count: 2, verified_external_count: 1, uncertain_external_count: 1 }] };
      }
      if (text.includes('FROM users') && text.includes('WHERE id = $1')) {
        return { rows: [{ id: researcherId, full_name: 'Researcher Example', affiliation: null, research_interests: [] }] };
      }
      if (text.includes('FROM papers p')) {
        return { rows: [{ id: 'paper-1', external_id: 'paper-1', source: 'platform', review_status: 'uncertain' }] };
      }
      if (text.includes('INSERT INTO external_publications')) {
        return { rows: [{ id: 'external-row-1', user_id: researcherId, source: params[4], external_id: params[5] }] };
      }
      if (text.includes('FROM external_publications e')) return { rows: [] };
      if (text.includes('INSERT INTO researcher_publication_discovery_runs')) {
        return { rows: [{ checked_at: '2026-11-23T00:00:00.000Z' }] };
      }
      if (text.includes('INSERT INTO researcher_publication_reviews')) {
        return { rows: [{ user_id: params[0], source: params[1], publication_id: params[2], status: params[3] }] };
      }
      return { rows: [] };
    };
  });

  after(() => {
    pool.query = originalQuery;
  });

  it('separates confirmed, uncertain, and rejected candidates in profile counts', async () => {
    const counts = await findPublicationCountsByUserId(researcherId);

    assert.equal(counts.verified_count, 2);
    assert.equal(counts.uncertain_count, 2);
    assert.equal(counts.total_count, 4);
    assert.ok(queries.every(({ text }) => text.includes("COALESCE(r.status, 'uncertain') <> 'rejected'")));
  });

  it('records discovery failures and saturated result limits as provisional', async () => {
    const fetchers = {
      arxiv: async (_name, limit, { onStatus }) => {
        onStatus(true);
        return Array.from({ length: limit }, (_, index) => ({
          title: `Candidate ${index}`,
          authors: ['Researcher Example'],
          source: 'arxiv',
          externalId: `arxiv-${index}`,
        }));
      },
      crossref: async (_name, _limit, { onStatus }) => {
        onStatus(false);
        return [];
      },
    };

    const result = await discoveryService.discoverResearcherPublications({
      userId: researcherId,
      limit: 1,
      fetchers,
    });

    assert.deepEqual(result.discovery.sources, { arxiv: 'limited', crossref: 'unavailable' });
    assert.equal(result.discovery.complete, false);
  });

  it('lets only the profile owner confirm or reject a publication', async () => {
    const response = () => ({
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    });
    const ownerResponse = response();
    await reviewPublication({
      params: { id: researcherId },
      user: { id: researcherId },
      body: { source: 'platform', publicationId: 'paper-1', status: 'confirmed' },
    }, ownerResponse, (error) => { throw error; });
    assert.equal(ownerResponse.statusCode, 200);
    assert.equal(ownerResponse.body.review.status, 'confirmed');

    const rejectedResponse = response();
    await reviewPublication({
      params: { id: researcherId },
      user: { id: researcherId },
      body: { source: 'arxiv', publicationId: 'arxiv-1234', status: 'rejected' },
    }, rejectedResponse, (error) => { throw error; });
    assert.equal(rejectedResponse.statusCode, 200);
    assert.equal(rejectedResponse.body.review.status, 'rejected');

    const otherResponse = response();
    const beforeUnauthorized = queries.length;
    await reviewPublication({
      params: { id: researcherId },
      user: { id: 'a2000000-0000-4000-8000-000000000002' },
      body: { source: 'platform', publicationId: 'paper-1', status: 'confirmed' },
    }, otherResponse, (error) => { throw error; });
    assert.equal(otherResponse.statusCode, 403);
    assert.equal(queries.length, beforeUnauthorized);
  });

  it('rejects unsupported review states', async () => {
    const response = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    let nextError;
    await reviewPublication({
      params: { id: researcherId },
      user: { id: researcherId },
      body: { source: 'crossref', publicationId: 'doi:example', status: 'maybe' },
    }, response, (error) => { nextError = error; });
    assert.equal(nextError?.statusCode, 400);
  });
});
