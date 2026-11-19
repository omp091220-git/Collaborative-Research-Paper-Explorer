import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStem,
  extractStemTokens,
  calculateTokenJaccard,
  checkTagDeduplication,
} from '../services/tagDeduplication.service.js';

describe('FR-12 & FR-23: Tag Deduplication & Equivalence Engine', () => {
  describe('Token Set Extraction & Stemming', () => {
    it('extracts unique stemmed content tokens while discarding stop words', () => {
      const tokens = extractStemTokens('timeline_of_actions');
      assert.deepStrictEqual(tokens, ['act', 'timeline']);
    });

    it('handles inverted token orders and delimiters identically', () => {
      const tokensA = extractStemTokens('action_timeline');
      const tokensB = extractStemTokens('timeline_of_actions');
      assert.deepStrictEqual(tokensA, tokensB);
    });

    it('expands common academic acronyms', () => {
      const tokens = extractStemTokens('cnn');
      assert.ok(tokens.includes('convoluti'));
      assert.ok(tokens.includes('neur'));
      assert.ok(tokens.includes('network'));
    });

    it('returns empty array for invalid or empty inputs', () => {
      assert.deepStrictEqual(extractStemTokens(''), []);
      assert.deepStrictEqual(extractStemTokens(null), []);
      assert.deepStrictEqual(extractStemTokens(undefined), []);
    });
  });

  describe('Token Jaccard Similarity', () => {
    it('returns 1.0 for reordered equivalent token sets', () => {
      const tokensA = extractStemTokens('timeline_of_actions');
      const tokensB = extractStemTokens('action_timeline');
      const sim = calculateTokenJaccard(tokensA, tokensB);
      assert.strictEqual(sim, 1.0);
    });

    it('returns partial similarity for subset token sets', () => {
      const tokensA = extractStemTokens('deep_neural_networks');
      const tokensB = extractStemTokens('neural_networks');
      const sim = calculateTokenJaccard(tokensA, tokensB);
      assert.ok(sim >= 0.60 && sim <= 0.70);
    });

    it('returns 0.0 for completely disjoint concepts', () => {
      const tokensA = extractStemTokens('quantum_cryptography');
      const tokensB = extractStemTokens('crop_yield_prediction');
      const sim = calculateTokenJaccard(tokensA, tokensB);
      assert.strictEqual(sim, 0.0);
    });
  });

  describe('checkTagDeduplication with Mock Database Pool', () => {
    const globalTags = [
      {
        id: '10000000-0000-0000-0000-000000000001',
        name: 'Action Timeline',
        slug: 'action_timeline',
        parent_id: null,
        is_private: false,
        created_by: null,
        description: 'Sequence and chronological log of user or agent actions.',
      },
      {
        id: '10000000-0000-0000-0000-000000000002',
        name: 'Transformers',
        slug: 'transformers',
        parent_id: null,
        is_private: false,
        created_by: null,
        description: 'Self-attention based neural network architectures.',
      },
      {
        id: '10000000-0000-0000-0000-000000000003',
        name: 'Convolutional Neural Networks',
        slug: 'convolutional_neural_networks',
        parent_id: null,
        is_private: false,
        created_by: null,
        description: 'Grid-structured image and signal processing neural network models.',
      },
    ];

    const userPrivateTags = [
      {
        id: '20000000-0000-0000-0000-000000000001',
        name: 'My Custom Optimizer',
        slug: 'my_custom_optimizer',
        parent_id: null,
        is_private: true,
        created_by: 'user-aaa-111',
        description: 'Private gradient descent variant benchmark.',
      },
    ];

    const createMockClient = (activeUserId = null) => ({
      query: async (sql, params) => {
        const queryUserId = params ? params[0] : null;
        let pool = [...globalTags];
        if (queryUserId && queryUserId === 'user-aaa-111') {
          pool = pool.concat(userPrivateTags);
        }
        return { rows: pool };
      },
    });

    it('detects token permutation: "timeline_of_actions" vs "action_timeline"', async () => {
      const client = createMockClient('user-aaa-111');
      const res = await checkTagDeduplication({
        name: 'Timeline of Actions',
        client,
      });

      assert.strictEqual(res.isDuplicate, true);
      assert.strictEqual(res.matchType, 'TOKEN_PERMUTATION');
      assert.strictEqual(res.matchedTag.slug, 'action_timeline');
      assert.ok(
        res.message.includes("Look at this, maybe what you want to make already exists and it might be this: 'Action Timeline'")
      );
      assert.strictEqual(res.requiresDescription, true);
    });

    it('detects singular/plural stem equivalence: "Transformer" vs "Transformers"', async () => {
      const client = createMockClient();
      const res = await checkTagDeduplication({
        name: 'Transformer',
        client,
      });

      assert.strictEqual(res.isDuplicate, true);
      assert.strictEqual(res.matchType, 'EXACT_MATCH');
      assert.strictEqual(res.matchedTag.name, 'Transformers');
      assert.ok(res.message.includes('Transformers'));
    });

    it('detects domain acronym match: "CNN" vs "Convolutional Neural Networks"', async () => {
      const client = createMockClient();
      const res = await checkTagDeduplication({
        name: 'CNN',
        client,
      });

      assert.strictEqual(res.isDuplicate, true);
      assert.strictEqual(res.matchedTag.slug, 'convolutional_neural_networks');
    });

    it('detects duplicate against the requesting user\'s own private tags', async () => {
      const client = createMockClient('user-aaa-111');
      const res = await checkTagDeduplication({
        name: 'My Custom Optimizer',
        userId: 'user-aaa-111',
        client,
      });

      assert.strictEqual(res.isDuplicate, true);
      assert.strictEqual(res.matchedTag.slug, 'my_custom_optimizer');
    });

    it('does NOT match against another user\'s private tags (privacy isolated)', async () => {
      const client = createMockClient('user-bbb-222');
      const res = await checkTagDeduplication({
        name: 'My Custom Optimizer',
        userId: 'user-bbb-222',
        client,
      });

      assert.strictEqual(res.isDuplicate, false);
      assert.strictEqual(res.matchType, 'CLEAN');
    });

    it('returns CLEAN for novel topics without duplicates', async () => {
      const client = createMockClient();
      const res = await checkTagDeduplication({
        name: 'Perovskite Photovoltaics',
        client,
      });

      assert.strictEqual(res.isDuplicate, false);
      assert.strictEqual(res.matchType, 'CLEAN');
      assert.strictEqual(res.matchedTag, null);
    });
  });
});
