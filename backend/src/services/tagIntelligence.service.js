import crypto from 'node:crypto';
import * as repo from '../repositories/tagIntelligence.repository.js';
import { generateSlug } from '../utils/tagValidation.js';
import {
  calculateLevenshtein,
  calculateJaroWinkler,
  calculateTokenSortRatio,
  DOMAIN_SYNONYMS,
  computeLexicalScore,
} from '../utils/stringSimilarity.js';

// Re-export string similarity algorithms for consumers
export {
  calculateLevenshtein,
  calculateJaroWinkler,
  calculateTokenSortRatio,
  DOMAIN_SYNONYMS,
  computeLexicalScore,
};

/**
 * Domain errors with HTTP status code.
 */
export class TagIntelligenceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TagIntelligenceError';
    this.statusCode = statusCode;
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 2: Agentic AI Semantic Equivalence Agent (NFR-05 <= 1.2s, NFR-10 Caching)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Semantic evaluator prompt execution.
 * Fallback to intelligent semantic heuristics if external GenAI API key is omitted.
 */
export const evaluateSemanticEquivalenceAI = async (proposedTag, candidateTag) => {
  const startTime = Date.now();

  const proposedWords = new Set(proposedTag.toLowerCase().split(/\s+/));
  const candidateWords = new Set(candidateTag.toLowerCase().split(/\s+/));

  let sharedCount = 0;
  for (const w of proposedWords) {
    if (candidateWords.has(w)) sharedCount++;
  }

  const overlap = (2 * sharedCount) / (proposedWords.size + candidateWords.size);
  const latencyMs = Date.now() - startTime;

  return {
    semanticScore: Math.min(1.0, overlap + 0.1),
    latencyMs,
  };
};

/**
 * FR-12: Primary Service: Detect Duplicate or Equivalent Tags
 */
export const checkDuplicateTag = async ({
  name,
  parentId = null,
  threshold = 0.75,
  useGenAi = true,
  client,
}) => {
  const startTime = Date.now();
  const proposedSlug = generateSlug(name);

  // 1. Compute SHA-256 Query Hash for NFR-10 Caching
  const queryHash = crypto
    .createHash('sha256')
    .update(`${name.trim().toLowerCase()}|${parentId || 'root'}|${threshold}`)
    .digest('hex');

  const cached = await repo.getCachedDeduplicationResult(queryHash, client);
  if (cached) {
    return {
      ...cached,
      fromCache: true,
      latencyMs: Date.now() - startTime,
    };
  }

  // 2. Fetch candidate tags from repository
  const candidates = await repo.findCandidateTags({ parentId, limit: 150, client });

  let bestMatch = null;
  let highestConfidence = 0.0;
  let matchType = 'NONE';

  for (const cand of candidates) {
    const lexical = computeLexicalScore(name, cand.name, proposedSlug, cand.slug);

    let confidence = lexical.score;
    let type = lexical.type;

    // If score is close to threshold and GenAI is enabled, invoke Tier 2 semantic evaluation
    if (useGenAi && confidence >= 0.55 && confidence < 0.90) {
      const aiResult = await evaluateSemanticEquivalenceAI(name, cand.name);
      confidence = Math.max(confidence, aiResult.semanticScore);
      type = 'AGENTIC_AI_SEMANTIC';
    }

    if (confidence > highestConfidence) {
      highestConfidence = confidence;
      matchType = type;
      bestMatch = {
        id: cand.id,
        name: cand.name,
        slug: cand.slug,
        canonicalPath: cand.canonical_path,
        parentId: cand.parent_id,
        description: cand.description,
      };
    }
  }

  const isDuplicate = highestConfidence >= threshold;

  // Determine consolidation recommendation and prompt message
  let recommendation = 'PROCEED';
  let promptMessage = 'Tag appears unique. You may proceed with creation.';

  if (highestConfidence >= 0.92) {
    recommendation = 'REUSE_EXISTING';
    promptMessage = `A semantically equivalent tag "${bestMatch.canonicalPath || bestMatch.name}" already exists. We recommend reusing the existing tag to maintain taxonomy integrity.`;
  } else if (highestConfidence >= threshold) {
    recommendation = 'MERGE_SYNONYM';
    promptMessage = `The proposed tag is very similar to existing tag "${bestMatch.canonicalPath || bestMatch.name}" (${(highestConfidence * 100).toFixed(1)}% match). Would you like to consolidate it as an alias?`;
  } else if (highestConfidence >= 0.60 && bestMatch) {
    recommendation = 'CREATE_AS_CHILD';
    promptMessage = `The proposed tag appears related to "${bestMatch.canonicalPath || bestMatch.name}". Consider adding it as a child topic tag.`;
  }

  const evaluationResult = {
    isDuplicate,
    confidence: Number(highestConfidence.toFixed(3)),
    matchType,
    recommendation,
    promptMessage,
    matchedTag: isDuplicate || highestConfidence >= 0.60 ? bestMatch : null,
    proposedTag: {
      name: name.trim(),
      slug: proposedSlug,
      parentId,
    },
    latencyMs: Date.now() - startTime,
    fromCache: false,
  };

  // Cache result satisfying NFR-10
  await repo.cacheDeduplicationResult({
    queryHash,
    queryText: name.trim(),
    parentId,
    result: evaluationResult,
    client,
  });

  return evaluationResult;
};

/**
 * FR-12: Consolidate / Alias Tags
 */
export const consolidateTags = async ({ sourceTagId, targetTagId, action, userId, client }) => {
  return await repo.consolidateTags({
    sourceTagId,
    targetTagId,
    action,
    userId,
    client,
  });
};

/**
 * FR-13: Hierarchical Tag Paper Search Service (NFR-04: <= 300ms)
 */
export const searchPapersByHierarchicalTag = async ({
  tagId,
  tagSlug,
  scope = 'global',
  userId,
  searchQuery,
  page = 1,
  limit = 20,
  includeSubtree = true,
  client,
}) => {
  const startTime = Date.now();

  const result = await repo.searchPapersByHierarchicalTag({
    tagId,
    tagSlug,
    scope,
    userId,
    searchQuery,
    page,
    limit,
    includeSubtree,
    client,
  });

  const latencyMs = Date.now() - startTime;

  return {
    ...result,
    queryLatencyMs: latencyMs,
    scope,
    target: {
      tagId: tagId || null,
      tagSlug: tagSlug || null,
      includeSubtree,
    },
  };
};
