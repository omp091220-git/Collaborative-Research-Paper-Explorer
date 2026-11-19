import pool from '../config/database.js';
import { generateSlug } from '../utils/tagValidation.js';
import { stemWord, cosineSimilarity, generateTextEmbedding } from '../utils/embedding.js';

/**
 * Common English connectives and noise words ignored during token set comparison.
 */
const TOKEN_STOP_WORDS = new Set([
  'of', 'and', 'the', 'for', 'in', 'on', 'at', 'to', 'a', 'an', 'by', 'with', 'using', 'based',
]);

/**
 * Domain-specific academic synonyms, abbreviations, and canonical expansions.
 */
const DOMAIN_SYNONYMS = new Map([
  ['cnn', 'convolutional_neural_network'],
  ['cnns', 'convolutional_neural_networks'],
  ['rnn', 'recurrent_neural_network'],
  ['rnns', 'recurrent_neural_networks'],
  ['vit', 'vision_transformer'],
  ['vits', 'vision_transformers'],
  ['llm', 'large_language_model'],
  ['llms', 'large_language_models'],
  ['gnn', 'graph_neural_network'],
  ['gnns', 'graph_neural_networks'],
  ['nlp', 'natural_language_processing'],
  ['cv', 'computer_vision'],
  ['rl', 'reinforcement_learning'],
  ['gan', 'generative_adversarial_network'],
  ['gans', 'generative_adversarial_networks'],
]);

/**
 * Robust morphological stem normalization that unifies plurals before suffix reduction.
 * e.g., "actions" -> "act", "action" -> "act"
 */
export const normalizeStem = (word) => {
  if (!word || typeof word !== 'string') return '';
  let current = word.toLowerCase().trim();
  if (current.length <= 3) return current;

  // Unify plurals first
  if (current.endsWith('ies') && current.length > 4) {
    current = current.slice(0, -3) + 'y';
  } else if (current.endsWith('es') && current.length > 4) {
    current = current.slice(0, -2);
  } else if (current.endsWith('s') && !current.endsWith('ss') && current.length > 3) {
    current = current.slice(0, -1);
  }

  // Then apply primary morphological stemmer
  let stemmed = stemWord(current);

  // If word had 'al' stripped (e.g. convolutional -> convolution), reduce once more
  if (current.endsWith('al') && stemmed.endsWith('tion')) {
    stemmed = stemWord(stemmed);
  }

  return stemmed;
};

/**
 * Normalizes and extracts unique stemmed content tokens from a tag name or slug.
 * e.g., "timeline_of_actions" -> ["act", "timeline"]
 *
 * @param {string} input
 * @returns {string[]} Sorted array of unique stemmed tokens
 */
export const extractStemTokens = (input) => {
  if (!input || typeof input !== 'string') return [];

  const rawTokens = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const stems = new Set();
  for (const token of rawTokens) {
    // Check known acronyms first
    const expanded = DOMAIN_SYNONYMS.get(token);
    if (expanded) {
      for (const part of expanded.split('_')) {
        stems.add(normalizeStem(part));
      }
      continue;
    }

    if (!TOKEN_STOP_WORDS.has(token) && token.length > 1) {
      stems.add(normalizeStem(token));
    }
  }

  return Array.from(stems).sort();
};

/**
 * Computes Jaccard token overlap similarity between two stemmed token arrays.
 * Jaccard = |A ∩ B| / |A ∪ B|
 *
 * @param {string[]} tokensA
 * @param {string[]} tokensB
 * @returns {number} Float between 0.0 and 1.0
 */
export const calculateTokenJaccard = (tokensA, tokensB) => {
  if (!tokensA.length || !tokensB.length) return 0.0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionSize++;
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  if (unionSize === 0) return 0.0;

  return Number((intersectionSize / unionSize).toFixed(4));
};

/**
 * Core Deduplication Engine:
 * Compares a candidate tag against existing tags in the database
 * strictly scoped to:
 * 1. All active Global tags (is_private = FALSE AND status = 'APPROVED')
 * 2. Current user's own Private tags (is_private = TRUE AND created_by = userId)
 *
 * @param {object} params
 * @param {string} params.name - Human-readable candidate tag name
 * @param {string} [params.slug] - Optional candidate slug
 * @param {string} [params.description] - Optional candidate description
 * @param {string|null} [params.parentId=null] - Proposed parent tag ID
 * @param {string|null} [params.userId=null] - Requesting user's ID
 * @param {object} [params.client=pool] - Database client or pool
 * @returns {Promise<object>} Deduplication report
 */
export const checkTagDeduplication = async ({
  name,
  slug,
  description = '',
  parentId = null,
  userId = null,
  client = pool,
} = {}) => {
  if (!name || typeof name !== 'string' || !name.trim()) {
    return {
      isDuplicate: false,
      matchType: 'CLEAN',
      matchedTag: null,
      similarityScore: 0,
      message: null,
      requiresDescription: false,
    };
  }

  const cleanName = name.trim();
  const effectiveSlug = slug ? slug.trim().toLowerCase() : generateSlug(cleanName);
  const candidateTokens = extractStemTokens(effectiveSlug || cleanName);
  const candidateEmbedding = generateTextEmbedding(`${cleanName} ${description || ''}`);

  // Query pool: Global tags OR requesting user's private tags
  const query = `
    SELECT id, name, slug, parent_id, is_private, created_by, description
    FROM topic_tags
    WHERE status = 'APPROVED'
      AND (is_private = FALSE OR (is_private = TRUE AND created_by = $1))
  `;
  const result = await client.query(query, [userId || null]);
  const existingTags = result.rows;

  let bestMatch = null;
  let highestScore = 0;
  let matchType = 'CLEAN';

  for (const tag of existingTags) {
    const existingSlug = tag.slug;
    const existingTokens = extractStemTokens(existingSlug || tag.name);

    // 1. Exact slug match (highest precedence)
    if (effectiveSlug && existingSlug === effectiveSlug) {
      return {
        isDuplicate: true,
        matchType: 'EXACT_MATCH',
        matchedTag: tag,
        similarityScore: 1.0,
        message: `Look at this, maybe what you want to make already exists and it might be this: '${tag.name}'.`,
        requiresDescription: true,
      };
    }

    // 2. Token-permutation match (e.g. timeline_of_actions vs action_timeline)
    const tokenSim = calculateTokenJaccard(candidateTokens, existingTokens);
    if (tokenSim >= 0.70 && candidateTokens.length > 1 && existingTokens.length > 1) {
      if (tokenSim >= highestScore || matchType !== 'TOKEN_PERMUTATION') {
        highestScore = tokenSim;
        bestMatch = tag;
        matchType = 'TOKEN_PERMUTATION';
        continue;
      }
    }

    // 3. Single-stem identical match (e.g. transformer vs transformers)
    if (
      candidateTokens.length === 1 &&
      existingTokens.length === 1 &&
      candidateTokens[0] === existingTokens[0]
    ) {
      return {
        isDuplicate: true,
        matchType: 'EXACT_MATCH',
        matchedTag: tag,
        similarityScore: 1.0,
        message: `Look at this, maybe what you want to make already exists and it might be this: '${tag.name}'.`,
        requiresDescription: true,
      };
    }

    // 4. Domain synonym match
    const candNorm = effectiveSlug.replace(/_/g, '');
    const existNorm = existingSlug.replace(/_/g, '');
    if (
      (DOMAIN_SYNONYMS.get(candNorm) && DOMAIN_SYNONYMS.get(candNorm) === existingSlug) ||
      (DOMAIN_SYNONYMS.get(existNorm) && DOMAIN_SYNONYMS.get(existNorm) === effectiveSlug)
    ) {
      return {
        isDuplicate: true,
        matchType: 'TOKEN_PERMUTATION',
        matchedTag: tag,
        similarityScore: 0.95,
        message: `Look at this, maybe what you want to make already exists and it might be this: '${tag.name}'.`,
        requiresDescription: true,
      };
    }

    // 5. Semantic Vector Cosine Similarity (only if not already a permutation match)
    if (matchType !== 'TOKEN_PERMUTATION') {
      const tagEmbedding = generateTextEmbedding(`${tag.name} ${tag.description || ''}`);
      const semSim = cosineSimilarity(candidateEmbedding, tagEmbedding);
      if (semSim >= 0.82 && semSim > highestScore) {
        highestScore = semSim;
        bestMatch = tag;
        matchType = 'SEMANTIC_SIMILARITY';
      }
    }
  }

  if (bestMatch && highestScore >= 0.70) {
    return {
      isDuplicate: true,
      matchType,
      matchedTag: bestMatch,
      similarityScore: Number(highestScore.toFixed(4)),
      message: `Look at this, maybe what you want to make already exists and it might be this: '${bestMatch.name}'.`,
      requiresDescription: true,
    };
  }

  return {
    isDuplicate: false,
    matchType: 'CLEAN',
    matchedTag: null,
    similarityScore: 0,
    message: null,
    requiresDescription: false,
  };
};

export default {
  normalizeStem,
  extractStemTokens,
  calculateTokenJaccard,
  checkTagDeduplication,
};
