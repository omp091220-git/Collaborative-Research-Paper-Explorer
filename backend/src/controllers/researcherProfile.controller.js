import {
  searchResearchersByName,
  getResearcherPublicProfile,
} from '../services/researcherProfile.service.js';

/**
 * GET /api/researchers/search?q=<name>&limit=20
 * FR-37 — Researcher Search
 */
export const searchResearchers = async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || String(q).trim().length < 2) {
      return res.status(400).json({
        error: 'Search query must be at least 2 characters.',
      });
    }

    const result = await searchResearchersByName({
      query: String(q).trim(),
      limit: parseInt(limit, 10) || 20,
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/researchers/:id/profile
 * FR-38 — Researcher Profile
 */
export const getResearcherProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Basic UUID format check
    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Invalid researcher ID format.' });
    }

    const profile = await getResearcherPublicProfile({ userId: id });

    if (!profile) {
      return res.status(404).json({ error: 'Researcher not found.' });
    }

    return res.status(200).json({ researcher: profile });
  } catch (err) {
    next(err);
  }
};
