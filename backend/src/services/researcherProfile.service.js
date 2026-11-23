import {
  searchUsersByName,
  findPublicProfileById,
  findPublicationCountsByUserId,
  findRecentPublicationsByUserId,
} from '../repositories/researcherProfile.repository.js';
import { findLatestDiscoveryRun } from '../repositories/publicationDiscovery.repository.js';

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
export const getResearcherPublicProfile = async ({ userId, viewerId }) => {
  const profile = await findPublicProfileById(userId);
  if (!profile) return null;

  const [counts, publications, discoveryRun] = await Promise.all([
    findPublicationCountsByUserId(userId),
    findRecentPublicationsByUserId(userId, 50),
    findLatestDiscoveryRun(userId),
  ]);

  return {
    id: profile.id,
    full_name: profile.full_name,
    role: profile.role,
    affiliation: profile.affiliation,
    research_interests: profile.research_interests ?? [],
    publication_counts: counts,
    publications,
    publication_discovery: discoveryRun ? {
      sources: { arxiv: discoveryRun.arxiv_status, crossref: discoveryRun.crossref_status },
      checked_at: discoveryRun.checked_at,
      complete: discoveryRun.arxiv_status === 'available' && discoveryRun.crossref_status === 'available',
    } : {
      sources: { arxiv: 'not_checked', crossref: 'not_checked' },
      checked_at: null,
      complete: false,
    },
    can_review_publications: viewerId === userId,
  };
};
