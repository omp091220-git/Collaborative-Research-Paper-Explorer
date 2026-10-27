import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cosineSimilarity,
  generateTextEmbedding,
} from '../utils/embedding.js';
import {
  compareTagPaths,
  calculateHierarchicalTagSimilarity,
  calculateSemanticSimilarity,
} from '../services/recommendation.service.js';

describe('FR-14: AI Literature Recommendations Engine', () => {
  describe('Vector Embedding Math & Cosine Similarity', () => {
    it('should return 1.0 for identical normalized vectors', () => {
      const v = [0.6, 0.8];
      const sim = cosineSimilarity(v, v);
      assert.strictEqual(sim, 1.0);
    });

    it('should return 0.0 for orthogonal vectors (zero shared components in text space)', () => {
      const v1 = [1, 0];
      const v2 = [0, 1];
      const sim = cosineSimilarity(v1, v2);
      assert.strictEqual(sim, 0.0);
    });

    it('should gracefully handle empty or invalid vectors', () => {
      assert.strictEqual(cosineSimilarity([], []), 0);
      assert.strictEqual(cosineSimilarity(null, [1, 2]), 0);
      assert.strictEqual(cosineSimilarity([0, 0], [0, 0]), 0);
    });

    it('should generate deterministic unit embeddings for academic text', () => {
      const emb1 = generateTextEmbedding('Quantum entanglement in superconducting qubits', 64);
      const emb2 = generateTextEmbedding('Quantum entanglement in superconducting qubits', 64);
      assert.strictEqual(emb1.length, 64);
      assert.deepStrictEqual(emb1, emb2);
    });

    it('should yield higher cosine similarity for related topics than unrelated topics', () => {
      const quantumA = generateTextEmbedding('Quantum computing error correction in superconducting circuits');
      const quantumB = generateTextEmbedding('Quantum error correcting codes for qubit processors');
      const agriculture = generateTextEmbedding('Photosynthetic chlorophyll mechanisms in maize and agricultural crops');

      const simRelated = cosineSimilarity(quantumA, quantumB);
      const simUnrelated = cosineSimilarity(quantumA, agriculture);

      assert.ok(
        simRelated > simUnrelated,
        `Expected related similarity (${simRelated}) to be greater than unrelated (${simUnrelated})`
      );
    });
  });

  describe('Hierarchical Topic Tag Similarity (FR-10 & FR-14)', () => {
    it('should return 1.0 for identical canonical paths', () => {
      const sim = compareTagPaths('cs::ai::nlp::transformers', 'cs::ai::nlp::transformers');
      assert.strictEqual(sim, 1.0);
    });

    it('should return partial similarity when sharing common parent categories', () => {
      const sim1 = compareTagPaths('cs::ai::nlp::transformers', 'cs::ai::nlp::bert');
      const sim2 = compareTagPaths('cs::ai::nlp::transformers', 'cs::ai::vision');
      assert.ok(sim1 > sim2, `Expected deeper shared hierarchy to score higher (${sim1} > ${sim2})`);
    });

    it('should return 0 for disjoint topic hierarchies', () => {
      const sim = compareTagPaths('cs::ai::nlp', 'energy::renewable::solar');
      assert.strictEqual(sim, 0);
    });

    it('should calculate set-level tag overlap between target and candidate papers', () => {
      const targetTags = [
        { canonicalPath: 'cs::ai::nlp::transformers', name: 'Transformers', confidence: 1.0 },
      ];
      const candidateMatching = [
        { canonicalPath: 'cs::ai::nlp::transformers', name: 'Transformers', confidence: 1.0 },
      ];
      const candidateUnrelated = [
        { canonicalPath: 'energy::renewable::solar', name: 'Solar', confidence: 1.0 },
      ];

      const matchRes = calculateHierarchicalTagSimilarity(targetTags, candidateMatching);
      const unmatchRes = calculateHierarchicalTagSimilarity(targetTags, candidateUnrelated);

      assert.strictEqual(matchRes.score, 1.0);
      assert.deepStrictEqual(matchRes.matchedTags, ['Transformers']);
      assert.strictEqual(unmatchRes.score, 0);
    });
  });

  describe('Section-Level Semantic Matching', () => {
    it('should identify the most semantically aligned section', () => {
      const targetSections = [
        {
          title: 'Methodology',
          content: 'We train a deep transformer model using self-attention mechanisms and cross-entropy loss.',
        },
      ];

      const candidateSections = [
        {
          section_title: 'Introduction',
          content: 'Overview of historical machine learning and rule-based NLP techniques.',
        },
        {
          section_title: 'Architecture & Training',
          content: 'Self-attention transformer layers trained on GPU clusters with cross-entropy loss optimization.',
        },
      ];

      const { score, topSection } = calculateSemanticSimilarity(targetSections, candidateSections);
      assert.ok(score > 0.6, `Expected high semantic alignment score (got ${score})`);
      assert.strictEqual(topSection, 'Architecture & Training');
    });
  });
});
