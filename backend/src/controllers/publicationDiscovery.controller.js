import * as service from '../services/publicationDiscovery.service.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Controller: Trigger external publication discovery for a researcher (FR-39).
 * POST /api/researchers/:id/publications/discover
 */
export const discoverPublications = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Valid researcher UUID is required.' });
    }

    const { authorQuery, limit } = req.body || {};
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50) : 20;

    const result = await service.discoverResearcherPublications({
      userId: id,
      authorQuery: typeof authorQuery === 'string' ? authorQuery.trim() : null,
      limit: parsedLimit,
    });

    return res.status(200).json({
      message: 'External publications discovered and synced successfully.',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller: Get known publications for a researcher.
 * GET /api/researchers/:id/publications
 */
export const getPublications = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Valid researcher UUID is required.' });
    }

    const result = await service.getResearcherPublications({ userId: id });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};
