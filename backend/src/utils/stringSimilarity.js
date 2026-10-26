/**
 * String similarity and lexical distance algorithms for Tag Intelligence (FR-12 Fast-Path).
 */

/**
 * Calculates Levenshtein edit distance between two strings.
 */
export const calculateLevenshtein = (a, b) => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // deletion
        d[i][j - 1] + 1,       // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return d[m][n];
};

/**
 * Calculates Jaro-Winkler similarity (score between 0 and 1).
 */
export const calculateJaroWinkler = (s1, s2) => {
  if (s1 === s2) return 1.0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0.0;

  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;

  // Winkler prefix adjustment (max 4 characters)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
};

/**
 * Token sort ratio (normalizes word ordering, e.g. "quantum machine learning" vs "machine learning quantum").
 */
export const calculateTokenSortRatio = (s1, s2) => {
  const norm1 = s1.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  const norm2 = s2.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  return calculateJaroWinkler(norm1, norm2);
};

/**
 * Common scientific domain abbreviations & synonyms dictionary.
 */
export const DOMAIN_SYNONYMS = new Map([
  ['nlp', 'natural language processing'],
  ['ml', 'machine learning'],
  ['ai', 'artificial intelligence'],
  ['cv', 'computer vision'],
  ['dl', 'deep learning'],
  ['rl', 'reinforcement learning'],
  ['llm', 'large language model'],
  ['llms', 'large language models'],
  ['pv', 'photovoltaics'],
  ['solar pv', 'solar photovoltaics'],
  ['ann', 'artificial neural network'],
  ['cnn', 'convolutional neural network'],
  ['rnn', 'recurrent neural network'],
  ['iot', 'internet of things'],
  ['hci', 'human computer interaction'],
  ['crypto', 'cryptography'],
  ['db', 'database'],
]);

/**
 * Computes deterministic lexical similarity between proposed tag and existing candidate.
 */
export const computeLexicalScore = (proposedName, candidateName, proposedSlug, candidateSlug) => {
  const pNorm = proposedName.trim().toLowerCase();
  const cNorm = candidateName.trim().toLowerCase();

  // 1. Exact match on normalized name or slug
  if (pNorm === cNorm || proposedSlug === candidateSlug) {
    return { score: 1.0, type: 'EXACT_MATCH' };
  }

  // 2. Domain synonym lookup
  const pSynonym = DOMAIN_SYNONYMS.get(pNorm) || DOMAIN_SYNONYMS.get(proposedSlug);
  const cSynonym = DOMAIN_SYNONYMS.get(cNorm) || DOMAIN_SYNONYMS.get(candidateSlug);

  if ((pSynonym && (pSynonym === cNorm || pSynonym === candidateSlug)) ||
      (cSynonym && (cSynonym === pNorm || cSynonym === proposedSlug)) ||
      (pSynonym && cSynonym && pSynonym === cSynonym)) {
    return { score: 0.96, type: 'DOMAIN_SYNONYM' };
  }

  // 3. Simple plural/singular stemming match
  const stripSuffix = (s) => s.replace(/(s|es|ing|ed)$/, '');
  if (stripSuffix(pNorm) === stripSuffix(cNorm)) {
    return { score: 0.94, type: 'STEM_EQUIVALENCE' };
  }

  // 4. Token-sort & Jaro-Winkler
  const jw = calculateJaroWinkler(pNorm, cNorm);
  const tokenSort = calculateTokenSortRatio(pNorm, cNorm);
  const maxLexical = Math.max(jw, tokenSort);

  // 5. Short string Levenshtein penalty check
  const lev = calculateLevenshtein(pNorm, cNorm);
  const maxLen = Math.max(pNorm.length, cNorm.length);
  const levScore = 1 - lev / maxLen;

  const combinedScore = maxLexical * 0.7 + levScore * 0.3;
  return { score: Math.min(1.0, combinedScore), type: 'LEXICAL_SIMILARITY' };
};
