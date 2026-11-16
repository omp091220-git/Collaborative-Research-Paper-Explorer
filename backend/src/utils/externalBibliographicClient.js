import https from 'node:https';

/**
 * Normalizes title string for duplicate detection and comparison.
 */
export const normalizeTitle = (title) => {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Fetches author publications from arXiv API using open search query.
 * DR-05 rate limit compliant.
 */
export const fetchArxivPublicationsByAuthor = async (authorName, maxResults = 10) => {
  if (!authorName || typeof authorName !== 'string' || !authorName.trim()) {
    return [];
  }

  const query = encodeURIComponent(`au:"${authorName.trim()}"`);
  const url = `https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Academic-Explorer-Agent/1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const entries = [];
          const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
          let match;

          while ((match = entryRegex.exec(data)) !== null) {
            const entryText = match[1];

            const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(entryText);
            const idMatch = /<id>([\s\S]*?)<\/id>/i.exec(entryText);
            const summaryMatch = /<summary>([\s\S]*?)<\/summary>/i.exec(entryText);
            const publishedMatch = /<published>([\s\S]*?)<\/published>/i.exec(entryText);
            const doiMatch = /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i.exec(entryText);

            const authors = [];
            const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi;
            let aMatch;
            while ((aMatch = authorRegex.exec(entryText)) !== null) {
              authors.push(aMatch[1].trim());
            }

            const rawId = idMatch ? idMatch[1].trim() : '';
            const arxivId = rawId.replace(/^https?:\/\/arxiv\.org\/abs\//i, '').replace(/v\d+$/i, '');
            const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : 'Untitled Paper';
            const year = publishedMatch ? parseInt(publishedMatch[1].substring(0, 4), 10) : new Date().getFullYear();

            entries.push({
              title,
              authors: authors.length > 0 ? authors : [authorName.trim()],
              publicationYear: Number.isNaN(year) ? null : year,
              source: 'arxiv',
              externalId: arxivId || rawId,
              doi: doiMatch ? doiMatch[1].trim() : null,
              venue: 'arXiv Preprint',
              abstract: summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : null,
              sourceUrl: rawId || `https://arxiv.org/abs/${arxivId}`,
            });
          }

          resolve(entries);
        } catch {
          resolve([]);
        }
      });
    });

    req.on('error', () => {
      // Graceful fallback on external network timeout or failure
      resolve([]);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve([]);
    });
  });
};

/**
 * Fetches author publications from CrossRef REST API.
 */
export const fetchCrossrefPublicationsByAuthor = async (authorName, maxResults = 10) => {
  if (!authorName || typeof authorName !== 'string' || !authorName.trim()) {
    return [];
  }

  const query = encodeURIComponent(authorName.trim());
  const url = `https://api.crossref.org/works?query.author=${query}&rows=${maxResults}&sort=relevance`;

  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'CollaborativeResearchPaperExplorer/1.0 (mailto:team19@university.edu)' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const items = json.message?.items || [];

          const publications = items.map((item) => {
            const title = Array.isArray(item.title) ? item.title[0] : (item.title || 'Untitled');
            const authors = Array.isArray(item.author)
              ? item.author.map((a) => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean)
              : [authorName.trim()];

            const issued = item.issued?.['date-parts']?.[0];
            const year = issued ? issued[0] : null;
            const doi = item.DOI || null;
            const containerTitle = Array.isArray(item['container-title'])
              ? item['container-title'][0]
              : item['container-title'] || null;

            return {
              title: title.replace(/\s+/g, ' ').trim(),
              authors: authors.length > 0 ? authors : [authorName.trim()],
              publicationYear: typeof year === 'number' ? year : null,
              source: 'crossref',
              externalId: doi || item.URL || title,
              doi,
              venue: containerTitle || item.publisher || 'Academic Venue',
              abstract: item.abstract ? item.abstract.replace(/<[^>]+>/g, '').trim() : null,
              sourceUrl: item.URL || (doi ? `https://doi.org/${doi}` : null),
            };
          });

          resolve(publications);
        } catch {
          resolve([]);
        }
      });
    });

    req.on('error', () => {
      // Graceful fallback on external failure
      resolve([]);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve([]);
    });
  });
};
