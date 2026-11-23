import * as repo from '../repositories/publicationDiscovery.repository.js';
import {
  fetchArxivPublicationsByAuthor,
  fetchCrossrefPublicationsByAuthor,
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
  const sourceLimit = Math.min(limit, 15);

  // 2. Fetch platform papers; authorship remains uncertain until researcher review.
  const platformPapers = await repo.findPlatformPapersByUserId(userId, client);

  // 3. Fetch from external open sources in parallel with safe error handlers
  const sourceStatuses = { arxiv: 'unavailable', crossref: 'unavailable' };
  const [arxivPubs, crossrefPubs] = await Promise.all([
    fetchArxivPublicationsByAuthor(queryName, sourceLimit, {
      onStatus: (ok) => { sourceStatuses.arxiv = ok ? 'available' : 'unavailable'; },
    }).catch(() => []),
    fetchCrossrefPublicationsByAuthor(queryName, sourceLimit, {
      onStatus: (ok) => { sourceStatuses.crossref = ok ? 'available' : 'unavailable'; },
    }).catch(() => []),
  ]);
  if (sourceStatuses.arxiv === 'available' && arxivPubs.length >= sourceLimit) sourceStatuses.arxiv = 'limited';
  if (sourceStatuses.crossref === 'available' && crossrefPubs.length >= sourceLimit) sourceStatuses.crossref = 'limited';

  // Combine external candidates
  const externalCandidates = [...arxivPubs, ...crossrefPubs];

  // 4. Upsert discovered external publications into database
  if (externalCandidates.length > 0) {
    await repo.upsertExternalPublications(userId, externalCandidates, client);
  }
  const discoveryRun = await repo.saveDiscoveryRun(userId, sourceStatuses, client);

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
      verified: combined.filter((publication) => publication.review_status === 'confirmed').length,
      uncertain: combined.filter((publication) => publication.review_status !== 'confirmed').length,
    },
    publications: combined,
    sourcesChecked: ['platform', 'arxiv', 'crossref'],
    discovery: {
      sources: sourceStatuses,
      checkedAt: discoveryRun?.checked_at || new Date().toISOString(),
      complete: Object.values(sourceStatuses).every((status) => status === 'available'),
    },
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
  const reviewStatuses = new Map();
  for (const publication of combined) {
    // Review state is attached by the profile repository; discovery responses use
    // external provider verification only as a legacy field and remain uncertain.
    reviewStatuses.set(publication.id || publication.external_id, publication.review_status || 'uncertain');
  }
  const discoveryRun = await repo.findLatestDiscoveryRun(userId, client);

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
      verified: combined.filter((publication) => reviewStatuses.get(publication.id || publication.external_id) === 'confirmed').length,
      uncertain: combined.filter((publication) => reviewStatuses.get(publication.id || publication.external_id) === 'uncertain').length,
    },
    publications: combined,
    discovery: discoveryRun ? {
      sources: { arxiv: discoveryRun.arxiv_status, crossref: discoveryRun.crossref_status },
      checkedAt: discoveryRun.checked_at,
      complete: discoveryRun.arxiv_status === 'available' && discoveryRun.crossref_status === 'available',
    } : {
      sources: { arxiv: 'not_checked', crossref: 'not_checked' },
      checkedAt: null,
      complete: false,
    },
  };
};

export const reviewResearcherPublication = async ({ userId, source, publicationId, status, client }) => {
  if (!['platform', 'arxiv', 'crossref'].includes(source)) {
    const error = new Error('Unsupported publication source.');
    error.statusCode = 400;
    throw error;
  }
  if (!['confirmed', 'rejected'].includes(status)) {
    const error = new Error('Review status must be confirmed or rejected.');
    error.statusCode = 400;
    throw error;
  }
  const result = await repo.setPublicationReview({ userId, source, publicationId, status }, client);
  if (!result) {
    const error = new Error('Publication not found for this researcher.');
    error.statusCode = 404;
    throw error;
  }
  return result;
};
