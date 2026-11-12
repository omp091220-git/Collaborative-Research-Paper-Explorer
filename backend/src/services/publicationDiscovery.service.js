import * as repo from '../repositories/publicationDiscovery.repository.js';
import {
  fetchArxivPublicationsByAuthor,
  fetchCrossrefPublicationsByAuthor,
  normalizeTitle,
} from '../utils/externalBibliographicClient.js';

/**
 * Service: Discover external publications for a researcher across arXiv and CrossRef,
 * merging with internal platform papers and persisting records.
 */
export const discoverResearcherPublications = async ({
  userId,
  authorQuery = null,
  limit = 20,
  client,
}) => {
  // 1. Fetch user profile
  const user = await repo.findUserProfileForDiscovery(userId, client);
  if (!user) {
    const error = new Error(`Researcher with id '${userId}' not found.`);
    error.statusCode = 404;
    throw error;
  }

  const queryName = (authorQuery && authorQuery.trim()) ? authorQuery.trim() : user.full_name;

  // 2. Fetch platform papers (verified by default)
  const platformPapers = await repo.findPlatformPapersByUserId(userId, client);

  // 3. Fetch from external open sources in parallel with safe error handlers
  const [arxivPubs, crossrefPubs] = await Promise.all([
    fetchArxivPublicationsByAuthor(queryName, Math.min(limit, 15)).catch(() => []),
    fetchCrossrefPublicationsByAuthor(queryName, Math.min(limit, 15)).catch(() => []),
  ]);

  // Combine external candidates
  const externalCandidates = [...arxivPubs, ...crossrefPubs];

  // 4. Upsert discovered external publications into database
  if (externalCandidates.length > 0) {
    await repo.upsertExternalPublications(userId, externalCandidates, client);
  }

  // 5. Fetch all stored publications for user to provide cohesive view
  const storedExternal = await repo.findExternalPublicationsByUserId(userId, client);

  // Combine platform papers and stored external papers
  const combined = [
    ...platformPapers,
    ...storedExternal,
  ];

  return {
    researcher: {
      id: user.id,
      fullName: user.full_name,
      queryUsed: queryName,
      affiliation: user.affiliation,
      researchInterests: user.research_interests,
    },
    counts: {
      total: combined.length,
      platform: platformPapers.length,
      external: storedExternal.length,
    },
    publications: combined,
    sourcesChecked: ['platform', 'arxiv', 'crossref'],
  };
};

/**
 * Service: Get cached/known publications for a researcher without forcing external network discovery.
 */
export const getResearcherPublications = async ({ userId, client }) => {
  const user = await repo.findUserProfileForDiscovery(userId, client);
  if (!user) {
    const error = new Error(`Researcher with id '${userId}' not found.`);
    error.statusCode = 404;
    throw error;
  }

  const [platformPapers, externalPubs] = await Promise.all([
    repo.findPlatformPapersByUserId(userId, client),
    repo.findExternalPublicationsByUserId(userId, client),
  ]);

  const combined = [...platformPapers, ...externalPubs];

  return {
    researcher: {
      id: user.id,
      fullName: user.full_name,
      affiliation: user.affiliation,
      researchInterests: user.research_interests,
    },
    counts: {
      total: combined.length,
      platform: platformPapers.length,
      external: externalPubs.length,
    },
    publications: combined,
  };
};
