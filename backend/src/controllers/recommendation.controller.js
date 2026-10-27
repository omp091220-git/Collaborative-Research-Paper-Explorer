import * as recService from '../services/recommendation.service.js';

/**
 * Controller: Get ranked AI recommendations for a specific paper (FR-14).
 * GET /api/recommendations/papers/:id
 */
export const getPaperRecommendations = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit, threshold, tagWeight, embeddingWeight } = req.query;

    const result = await recService.getRecommendationsForPaper(id, {
      limit: limit ? parseInt(limit, 10) : 5,
      threshold: threshold !== undefined ? parseFloat(threshold) : 0.15,
      tagWeight: tagWeight !== undefined ? parseFloat(tagWeight) : 0.5,
      embeddingWeight: embeddingWeight !== undefined ? parseFloat(embeddingWeight) : 0.5,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller: Get ranked recommendations for arbitrary text or section content.
 * POST /api/recommendations/section
 */
export const getSectionRecommendations = async (req, res, next) => {
  try {
    const { text, tagIds, limit } = req.body;

    const result = await recService.getRecommendationsForText({
      text,
      tagIds,
      limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller: Seed realistic research papers with sections, tags, and embeddings
 * for quick demonstration/testing.
 * POST /api/recommendations/seed-sample
 */
export const seedSampleData = async (req, res, next) => {
  try {
    const uploaderId = req.user?.id;
    if (!uploaderId) {
      return res.status(401).json({ error: 'Authenticated user required to seed data.' });
    }

    const result = await recService.seedSampleRecommendationsData(uploaderId);
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
};

export default {
  getPaperRecommendations,
  getSectionRecommendations,
  seedSampleData,
};
