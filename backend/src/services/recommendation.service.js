import * as recRepo from '../repositories/recommendation.repository.js';
import * as tagRepo from '../repositories/tag.repository.js';
import { cosineSimilarity, generateTextEmbedding } from '../utils/embedding.js';
import pool from '../config/database.js';

/**
 * Custom error class for recommendation operations.
 */
export class RecommendationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'RecommendationError';
    this.statusCode = statusCode;
  }
}

/**
 * Compares two hierarchical canonical tag paths (e.g. "cs::ai::nlp" and "cs::ai::nlp::transformers")
 * and returns a similarity score in [0, 1].
 */
export const compareTagPaths = (pathA, pathB) => {
  if (!pathA || !pathB) return 0;
  if (pathA === pathB) return 1.0;

  const partsA = pathA.split('::');
  const partsB = pathB.split('::');

  let common = 0;
  const minLen = Math.min(partsA.length, partsB.length);
  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < minLen; i++) {
    if (partsA[i] === partsB[i]) {
      common++;
    } else {
      break;
    }
  }

  if (common === 0) return 0;

  // Partial match score based on common depth ratio
  return Number((common / maxLen).toFixed(4));
};

/**
 * Computes the hierarchical tag similarity score between target paper tags and candidate paper tags.
 * Deduplicates tags across sections to ensure accurate normalized scoring.
 */
export const calculateHierarchicalTagSimilarity = (targetTags = [], candidateTags = []) => {
  if (!targetTags.length || !candidateTags.length) {
    return { score: 0, matchedTags: [] };
  }

  // Deduplicate by path
  const uniqueTarget = new Map();
  for (const t of targetTags) {
    const p = t.canonicalPath || t.slug || '';
    if (p && !uniqueTarget.has(p)) uniqueTarget.set(p, t);
  }

  const uniqueCandidate = new Map();
  for (const c of candidateTags) {
    const p = c.canonicalPath || c.slug || '';
    if (p && !uniqueCandidate.has(p)) uniqueCandidate.set(p, c);
  }

  if (uniqueTarget.size === 0 || uniqueCandidate.size === 0) {
    return { score: 0, matchedTags: [] };
  }

  const matchedTags = new Set();
  let totalMatchWeight = 0;

  for (const [tPath, tTag] of uniqueTarget.entries()) {
    let bestMatchForThisTag = 0;
    let bestCandidateName = null;

    for (const [cPath, cTag] of uniqueCandidate.entries()) {
      const sim = compareTagPaths(tPath, cPath);
      if (sim > bestMatchForThisTag) {
        bestMatchForThisTag = sim;
        bestCandidateName = cTag.name || cPath;
      }
    }

    if (bestMatchForThisTag > 0.3) {
      totalMatchWeight += bestMatchForThisTag * (tTag.confidence || 1.0);
      if (bestCandidateName) matchedTags.add(bestCandidateName);
    }
  }

  const normalizedScore = Math.min(1.0, totalMatchWeight / Math.max(1, uniqueTarget.size));
  return {
    score: Number(normalizedScore.toFixed(4)),
    matchedTags: Array.from(matchedTags),
  };
};

/**
 * Computes semantic similarity between target sections and candidate sections
 * using vector cosine similarity.
 */
export const calculateSemanticSimilarity = (targetSections = [], candidateSections = []) => {
  if (!targetSections.length || !candidateSections.length) {
    return { score: 0, topSection: null };
  }

  let maxSimilarity = 0;
  let topSectionTitle = null;

  for (const tSec of targetSections) {
    let tVec = Array.isArray(tSec.embedding)
      ? tSec.embedding
      : (typeof tSec.embedding === 'string' ? JSON.parse(tSec.embedding) : null);
    if (!tVec || tVec.length !== 1024) {
      tVec = generateTextEmbedding(tSec.content || tSec.title || '', 1024);
    }

    for (const cSec of candidateSections) {
      let cVec = Array.isArray(cSec.embedding)
        ? cSec.embedding
        : (typeof cSec.embedding === 'string' ? JSON.parse(cSec.embedding) : null);
      if (!cVec || cVec.length !== 1024) {
        cVec = generateTextEmbedding(cSec.content || cSec.title || '', 1024);
      }

      const sim = cosineSimilarity(tVec, cVec);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
        topSectionTitle = cSec.section_title || cSec.title || 'Overview';
      }
    }
  }

  return {
    score: Number(maxSimilarity.toFixed(4)),
    topSection: topSectionTitle,
  };
};

/**
 * Service: Generate ranked AI recommendations of related literature for a given paper (FR-14).
 * Combines section-level hierarchical topic tags and text embeddings.
 */
export const getRecommendationsForPaper = async (paperId, options = {}) => {
  const {
    limit = 5,
    threshold = 0.15,
    tagWeight = 0.5,
    embeddingWeight = 0.5,
  } = options;

  const targetPaper = await recRepo.getPaperWithSectionsAndTags(paperId);
  if (!targetPaper) {
    throw new RecommendationError('Target research paper not found.', 404);
  }

  // If paper has no sections, synthesize a fallback section from title + abstract
  let targetSections = targetPaper.sections;
  if (!targetSections || targetSections.length === 0) {
    const fallbackText = `${targetPaper.title}. ${targetPaper.abstract || ''}`;
    targetSections = [
      {
        title: 'Abstract',
        content: fallbackText,
        embedding: generateTextEmbedding(fallbackText, 1024),
      },
    ];
  }

  const candidates = await recRepo.getAllCandidatePapers(paperId);
  if (!candidates || candidates.length === 0) {
    return {
      paperId,
      paperTitle: targetPaper.title,
      totalCandidates: 0,
      recommendations: [],
    };
  }

  const scoredRecommendations = [];

  for (const candidate of candidates) {
    let candidateSections = candidate.sections;
    if (!candidateSections || candidateSections.length === 0) {
      const fallbackText = `${candidate.title}. ${candidate.abstract || ''}`;
      candidateSections = [
        {
          title: 'Abstract',
          content: fallbackText,
          embedding: generateTextEmbedding(fallbackText, 1024),
        },
      ];
    }

    // 1. Tag Similarity (FR-10 / FR-11 hierarchical paths)
    const { score: tagScore, matchedTags } = calculateHierarchicalTagSimilarity(
      targetPaper.tags,
      candidate.tags
    );

    // 2. Semantic Embedding Similarity (Cosine similarity)
    const { score: semanticScore, topSection } = calculateSemanticSimilarity(
      targetSections,
      candidateSections
    );

    // 3. Combined Hybrid AI Score
    // Disjoint domain gating: If two papers have zero shared topic tags,
    // they belong to completely separate disciplines, preventing false cross-domain recommendations.
    let hybridScore;
    if (tagScore === 0) {
      hybridScore = Number((semanticScore * 0.05).toFixed(4));
    } else {
      hybridScore = Number(
        (tagScore * tagWeight + semanticScore * embeddingWeight).toFixed(4)
      );
    }

    if (hybridScore >= threshold) {
      const matchPercentage = Math.round(hybridScore * 100);
      let explanation = 'Recommended based on contextual alignment.';
      if (matchedTags.length > 0 && semanticScore > 0.6) {
        explanation = `High semantic similarity in ${topSection || 'sections'} and matching topics (${matchedTags.slice(0, 2).join(', ')}).`;
      } else if (matchedTags.length > 0) {
        explanation = `Shares hierarchical topic tags: ${matchedTags.slice(0, 3).join(', ')}.`;
      } else if (semanticScore > 0.5) {
        explanation = `Strong conceptual text alignment in ${topSection || 'content'}.`;
      }

      scoredRecommendations.push({
        id: candidate.id,
        title: candidate.title,
        abstract: candidate.abstract,
        authors: candidate.authors,
        arxivId: candidate.arxiv_id,
        matchScore: hybridScore,
        matchPercentage,
        scoreBreakdown: {
          tagSimilarity: Number((tagScore * 100).toFixed(1)),
          semanticSimilarity: Number((semanticScore * 100).toFixed(1)),
        },
        matchedTags,
        topMatchingSection: topSection,
        explanation,
      });
    }
  }

  // Sort descending by match score
  scoredRecommendations.sort((a, b) => b.matchScore - a.matchScore);

  const parsedLimit = Math.max(1, Math.min(20, parseInt(limit, 10) || 5));
  const topRecommendations = scoredRecommendations.slice(0, parsedLimit);

  return {
    paperId,
    paperTitle: targetPaper.title,
    totalCandidates: candidates.length,
    recommendationsCount: topRecommendations.length,
    recommendations: topRecommendations,
  };
};

/**
 * Service: Generate recommendations from ad-hoc text and optional tag IDs.
 */
export const getRecommendationsForText = async ({ text, tagIds = [], limit = 5 }) => {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new RecommendationError('Text content is required for section recommendation.', 400);
  }

  const queryEmbedding = generateTextEmbedding(text, 1024);
  const targetSections = [{ title: 'Query', content: text, embedding: queryEmbedding }];

  // Fetch tag objects if tagIds provided
  const targetTags = [];
  if (Array.isArray(tagIds) && tagIds.length > 0) {
    for (const id of tagIds) {
      const tag = await tagRepo.findTagById(id);
      if (tag) {
        targetTags.push({
          canonicalPath: tag.canonical_path,
          name: tag.name,
          slug: tag.slug,
          confidence: 1.0,
        });
      }
    }
  }

  const candidates = await recRepo.getAllCandidatePapers(null);
  const scored = [];

  for (const candidate of candidates) {
    let candidateSections = candidate.sections;
    if (!candidateSections || candidateSections.length === 0) {
      const fallback = `${candidate.title}. ${candidate.abstract || ''}`;
      candidateSections = [{ title: 'Abstract', content: fallback, embedding: generateTextEmbedding(fallback, 1024) }];
    }

    const { score: tagScore, matchedTags } = calculateHierarchicalTagSimilarity(targetTags, candidate.tags);
    const { score: semanticScore, topSection } = calculateSemanticSimilarity(targetSections, candidateSections);

    let hybridScore;
    if (tagScore === 0 && targetTags.length > 0) {
      hybridScore = Number((semanticScore * 0.05).toFixed(4));
    } else {
      const tagWeight = targetTags.length > 0 ? 0.4 : 0.0;
      const semWeight = targetTags.length > 0 ? 0.6 : 1.0;
      hybridScore = Number((tagScore * tagWeight + semanticScore * semWeight).toFixed(4));
    }

    scored.push({
      id: candidate.id,
      title: candidate.title,
      abstract: candidate.abstract,
      authors: candidate.authors,
      arxivId: candidate.arxiv_id,
      matchScore: hybridScore,
      matchPercentage: Math.round(hybridScore * 100),
      scoreBreakdown: {
        tagSimilarity: Number((tagScore * 100).toFixed(1)),
        semanticSimilarity: Number((semanticScore * 100).toFixed(1)),
      },
      matchedTags,
      topMatchingSection: topSection,
    });
  }

  scored.sort((a, b) => b.matchScore - a.matchScore);
  return {
    recommendations: scored.slice(0, Math.min(20, parseInt(limit, 10) || 5)),
  };
};

/**
 * Service: Seeds sample research papers with sections, hierarchical tags, and embeddings
 * for effortless grading, presentation, and local testing.
 */
export const seedSampleRecommendationsData = async (uploaderId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Ensure sample hierarchical tags exist
    const tagDefs = [
      { name: 'Computer Science', slug: 'cs', parentId: null },
      { name: 'Artificial Intelligence', slug: 'ai', parentSlug: 'cs' },
      { name: 'Natural Language Processing', slug: 'nlp', parentSlug: 'ai' },
      { name: 'Transformers', slug: 'transformers', parentSlug: 'nlp' },
      { name: 'Computer Vision', slug: 'cv', parentSlug: 'ai' },
      { name: 'Energy', slug: 'energy', parentId: null },
      { name: 'Renewable Energy', slug: 'renewable', parentSlug: 'energy' },
      { name: 'Solar Panels', slug: 'solar', parentSlug: 'renewable' },
    ];

    const tagMap = new Map();

    for (const td of tagDefs) {
      let parentId = td.parentId || null;
      if (td.parentSlug && tagMap.has(td.parentSlug)) {
        parentId = tagMap.get(td.parentSlug);
      }

      const existing = await tagRepo.findTagBySlugAndParent(td.slug, parentId, client);
      if (existing) {
        tagMap.set(td.slug, existing.id);
      } else {
        const created = await tagRepo.createTag({
          name: td.name,
          slug: td.slug,
          parentId,
          description: `Research category for ${td.name}`,
          createdBy: uploaderId,
          client,
        });
        tagMap.set(td.slug, created.id);
      }
    }

    // 2. Sample papers to insert if they don't already exist
    const samplePapers = [
      {
        title: 'Attention Is All You Need: The Transformer Architecture',
        abstract: 'We propose the Transformer, a model architecture eschewing recurrence and instead relying entirely on an attention mechanism to draw global dependencies between input and output.',
        authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit'],
        arxivId: '1706.03762',
        tags: ['transformers', 'nlp'],
        sections: [
          { title: 'Abstract', content: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder.' },
          { title: 'Model Architecture', content: 'The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder.' },
          { title: 'Multi-Head Attention', content: 'Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions.' },
        ],
      },
      {
        title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
        abstract: 'We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers.',
        authors: ['Jacob Devlin', 'Ming-Wei Chang', 'Kenton Lee', 'Kristina Toutanova'],
        arxivId: '1810.04805',
        tags: ['transformers', 'nlp'],
        sections: [
          { title: 'Introduction', content: 'Language model pre-training has been shown to be effective for improving many natural language processing tasks.' },
          { title: 'BERT Architecture', content: 'BERT architecture is a multi-layer bidirectional Transformer encoder based on the original implementation described in Vaswani et al.' },
        ],
      },
      {
        title: 'Deep Residual Learning for Image Recognition',
        abstract: 'Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks that are substantially deeper.',
        authors: ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun'],
        arxivId: '1512.03385',
        tags: ['cv', 'ai'],
        sections: [
          { title: 'Residual Learning', content: 'Instead of hoping each few stacked layers directly fit a desired underlying mapping, we explicitly let these layers fit a residual mapping.' },
        ],
      },
      {
        title: 'Perovskite Solar Cells: Progress and High-Efficiency Photovoltaic Advances',
        abstract: 'Perovskite solar cells have rapidly emerged as front-runners for next-generation photovoltaics with certified power conversion efficiencies surpassing 25%.',
        authors: ['Michael Graetzel', 'Henry Snaith', 'Nam-Gyu Park'],
        arxivId: '2105.00123',
        tags: ['solar', 'renewable'],
        sections: [
          { title: 'Photovoltaic Efficiency', content: 'We analyze bandgap engineering, charge transport layers, and thin-film crystallization for maximum solar light harvesting.' },
        ],
      },
    ];

    let seededCount = 0;

    for (const sp of samplePapers) {
      // Check if paper title already exists
      const existingPaper = await client.query('SELECT id FROM papers WHERE title = $1', [sp.title]);
      let paperId;

      if (existingPaper.rows.length > 0) {
        paperId = existingPaper.rows[0].id;
      } else {
        const dummyPath = `uploads/seed-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
        const insertRes = await client.query(
          `INSERT INTO papers (title, abstract, authors, arxiv_id, file_path, file_size_bytes, mime_type, uploader_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [sp.title, sp.abstract, sp.authors, sp.arxivId, dummyPath, 1024000, 'application/pdf', uploaderId]
        );
        paperId = insertRes.rows[0].id;
        seededCount++;
      }

      // Check if sections exist
      const secCount = await recRepo.countSectionsForPaper(paperId, client);
      if (secCount === 0) {
        for (let i = 0; i < sp.sections.length; i++) {
          const s = sp.sections[i];
          const emb = generateTextEmbedding(`${s.title}. ${s.content}`, 1024);
          const sec = await recRepo.insertPaperSection({
            paperId,
            sectionTitle: s.title,
            sectionOrder: i,
            content: s.content,
            pageNumber: 1 + i,
            embedding: emb,
            client,
          });

          // Bind tags
          for (const tSlug of sp.tags) {
            if (tagMap.has(tSlug)) {
              await recRepo.tagSection({
                sectionId: sec.id,
                paperId,
                tagId: tagMap.get(tSlug),
                confidence: 0.95,
                assignedBy: uploaderId,
                client,
              });
            }
          }
        }
      }
    }

    await client.query('COMMIT');
    return {
      message: 'Sample research literature seeded successfully.',
      seededPapersCount: seededCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export default {
  compareTagPaths,
  calculateHierarchicalTagSimilarity,
  calculateSemanticSimilarity,
  getRecommendationsForPaper,
  getRecommendationsForText,
  seedSampleRecommendationsData,
};
