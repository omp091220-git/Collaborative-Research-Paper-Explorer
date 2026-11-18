import {
  searchUsersByName,
  findPublicProfileById,
  findPublicationCountsByUserId,
  findRecentPublicationsByUserId,
} from '../repositories/researcherProfile.repository.js';

/**
 * FR-37 — Search researchers by name.
 * Returns public fields only. Never exposes email.
 */
export const searchResearchersByName = async ({ query, limit = 20 }) => {
  if (!query || query.trim().length < 2) {
    return { researchers: [], total: 0 };
  }

  const rows = await searchUsersByName(query.trim(), Math.min(limit, 50));
  return { researchers: rows, total: rows.length };
};

/**
 * FR-38 — Get a researcher's public profile + publication list.
 * Never exposes email or private posts.
 */
export const getResearcherPublicProfile = async ({ userId }) => {
  const profile = await findPublicProfileById(userId);
  if (!profile) return null;

  const [counts, publications] = await Promise.all([
    findPublicationCountsByUserId(userId),
    findRecentPublicationsByUserId(userId, 50),
  ]);

  return {
    id: profile.id,
    full_name: profile.full_name,
    role: profile.role,
    affiliation: profile.affiliation,
    research_interests: profile.research_interests ?? [],
    publication_counts: counts,
    publications,
  };
};
