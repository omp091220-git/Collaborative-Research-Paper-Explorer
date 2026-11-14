import * as citationRepo from '../repositories/citation.repository.js';

/**
 * Predefined realistic citation clusters with distinct themes and visual accents.
 */
export const CITATION_CLUSTERS = [
  {
    id: 'cluster-foundations',
    name: 'Theoretical Foundations & Prior Art',
    color: '#3B82F6', // Blue
    description: 'Seminal works, mathematical formulations, and foundational architectures.',
  },
  {
    id: 'cluster-methods',
    name: 'Methodological Extensions',
    color: '#8B5CF6', // Purple
    description: 'Algorithmic variations, training objectives, and architectural refinements.',
  },
  {
    id: 'cluster-applications',
    name: 'Applied Systems & Domain Benchmarks',
    color: '#10B981', // Emerald Green
    description: 'Empirical evaluations, cross-domain deployments, and benchmarks.',
  },
  {
    id: 'cluster-scaling',
    name: 'Scaling, Efficiency & Optimization',
    color: '#F59E0B', // Amber
    description: 'Efficiency optimizations, quantization, and high-throughput execution.',
  },
];

/**
 * Deterministic pseudo-random generator seeded from string for consistent mock graphs.
 */
function seededRandom(seedStr) {
  let h = 0xdeadbeef;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 2654435761);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>> 0) / 4294967296);
  };
}

/**
 * Generate a realistic, rich citation graph around a focal root paper.
 * Satisfies FR-16 requirement: "Graph UI can use mock nodes/edges" when reference metadata is sparse.
 */
export function generateMockCitationGraph(rootPaper) {
  const seed = (rootPaper?.id || 'default-seed') + (rootPaper?.title || '');
  const rand = seededRandom(seed);

  const baseYear = rootPaper?.publication_year || 2021;
  const rootId = String(rootPaper?.id || 'root-paper-001');

  const rootNode = {
    id: rootId,
    title: rootPaper?.title || 'Focal Research Paper',
    authors: Array.isArray(rootPaper?.authors)
      ? rootPaper.authors
      : typeof rootPaper?.authors === 'string'
      ? [rootPaper.authors]
      : ['Primary Author et al.'],
    publication_year: baseYear,
    arxiv_id: rootPaper?.arxiv_id || null,
    citation_count: Math.floor(rand() * 1200) + 150,
    node_type: 'root',
    cluster_id: 'cluster-foundations',
    cluster_label: 'Theoretical Foundations & Prior Art',
    abstract: rootPaper?.abstract || 'Primary investigated research contribution.',
  };

  const backwardTemplates = [
    { title: 'Neural Machine Translation by Jointly Learning to Align and Translate', authors: ['D. Bahdanau', 'K. Cho', 'Y. Bengio'], delta: -3, cluster: 'cluster-foundations', citations: 32400 },
    { title: 'Sequence to Sequence Learning with Neural Networks', authors: ['I. Sutskever', 'O. Vinyals', 'Q. V. Le'], delta: -3, cluster: 'cluster-foundations', citations: 26800 },
    { title: 'Effective Approaches to Attention-based Neural Machine Translation', authors: ['M. T. Luong', 'H. Pham', 'C. D. Manning'], delta: -2, cluster: 'cluster-methods', citations: 14200 },
    { title: 'Deep Residual Learning for Image Recognition', authors: ['K. He', 'X. Zhang', 'S. Ren', 'J. Sun'], delta: -1, cluster: 'cluster-foundations', citations: 185000 },
    { title: 'Layer Normalization', authors: ['J. L. Ba', 'J. R. Kiros', 'G. E. Hinton'], delta: -1, cluster: 'cluster-scaling', citations: 19800 },
    { title: 'Adam: A Method for Stochastic Optimization', authors: ['D. P. Kingma', 'J. Ba'], delta: -2, cluster: 'cluster-scaling', citations: 145000 },
  ];

  const forwardTemplates = [
    { title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', authors: ['J. Devlin', 'M. W. Chang', 'K. Lee', 'K. Toutanova'], delta: 1, cluster: 'cluster-methods', citations: 74000 },
    { title: 'Language Models are Few-Shot Learners (GPT-3)', authors: ['T. Brown', 'B. Mann', 'N. Ryder', 'M. Subbiah'], delta: 3, cluster: 'cluster-scaling', citations: 34000 },
    { title: 'Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer (T5)', authors: ['C. Raffel', 'N. Shazeer', 'A. Roberts'], delta: 2, cluster: 'cluster-methods', citations: 18900 },
    { title: 'An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale (ViT)', authors: ['A. Dosovitskiy', 'L. Beyer', 'A. Kolesnikov'], delta: 3, cluster: 'cluster-applications', citations: 31000 },
    { title: 'FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness', authors: ['T. Dao', 'D. Fu', 'S. Ermon', 'A. Rudra', 'C. Ré'], delta: 4, cluster: 'cluster-scaling', citations: 4200 },
    { title: 'Llama: Open and Efficient Foundation Language Models', authors: ['H. Touvron', 'T. Lavril', 'G. Izacard'], delta: 5, cluster: 'cluster-applications', citations: 16700 },
    { title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', authors: ['P. Lewis', 'E. Perez', 'A. Piktus', 'F. Petroni'], delta: 3, cluster: 'cluster-applications', citations: 6500 },
  ];

  const coCitationTemplates = [
    { title: 'RoBERTa: A Robustly Optimized BERT Pretraining Approach', authors: ['Y. Liu', 'M. Ott', 'N. Goyal'], delta: 2, cluster: 'cluster-methods', citations: 21500 },
    { title: 'ELECTRA: Pre-training Text Encoders as Discriminators Rather Than Generators', authors: ['K. Clark', 'M. T. Luong', 'Q. V. Le', 'C. D. Manning'], delta: 3, cluster: 'cluster-methods', citations: 7200 },
    { title: 'Scaling Laws for Neural Language Models', authors: ['J. Kaplan', 'S. McCandlish', 'T. Henighan'], delta: 3, cluster: 'cluster-scaling', citations: 5800 },
    { title: 'DeBERTa: Decoding-enhanced BERT with Disentangled Attention', authors: ['P. He', 'X. Liu', 'J. Gao', 'W. Chen'], delta: 4, cluster: 'cluster-methods', citations: 3900 },
    { title: 'Chinchilla: Training Compute-Optimal Large Language Models', authors: ['J. Hoffmann', 'S. Borgeaud', 'A. Mensch'], delta: 5, cluster: 'cluster-scaling', citations: 4900 },
  ];

  const nodes = [rootNode];
  const links = [];

  // 1. Backward references: root cites these (root -> backward)
  backwardTemplates.forEach((item, index) => {
    const id = `mock-back-${index + 1}`;
    nodes.push({
      id,
      title: item.title,
      authors: item.authors,
      publication_year: Math.max(1990, baseYear + item.delta),
      citation_count: item.citations,
      node_type: 'backward',
      cluster_id: item.cluster,
      cluster_label: CITATION_CLUSTERS.find(c => c.id === item.cluster)?.name || 'Foundations',
      abstract: `Foundational prior literature cited by ${rootNode.title}.`,
    });

    links.push({
      id: `link-b-${index + 1}`,
      source: rootId,
      target: id,
      type: 'backward',
      label: 'References',
      weight: 1.0,
    });
  });

  // 2. Forward citations: these papers cite root (forward -> root)
  forwardTemplates.forEach((item, index) => {
    const id = `mock-fwd-${index + 1}`;
    nodes.push({
      id,
      title: item.title,
      authors: item.authors,
      publication_year: baseYear + Math.max(1, item.delta),
      citation_count: item.citations,
      node_type: 'forward',
      cluster_id: item.cluster,
      cluster_label: CITATION_CLUSTERS.find(c => c.id === item.cluster)?.name || 'Methods',
      abstract: `Downstream work citing the focal paper.`,
    });

    links.push({
      id: `link-f-${index + 1}`,
      source: id,
      target: rootId,
      type: 'forward',
      label: 'Cites',
      weight: 1.0,
    });
  });

  // 3. Co-citation clusters: papers co-cited with the forward/backward network
  coCitationTemplates.forEach((item, index) => {
    const id = `mock-cocite-${index + 1}`;
    nodes.push({
      id,
      title: item.title,
      authors: item.authors,
      publication_year: baseYear + Math.max(1, item.delta),
      citation_count: item.citations,
      node_type: 'co_citation',
      cluster_id: item.cluster,
      cluster_label: CITATION_CLUSTERS.find(c => c.id === item.cluster)?.name || 'Co-citation Cluster',
      abstract: `Co-cited publication sharing bibliographic coupling.`,
    });

    // Link co-citation nodes to related forward or backward papers in same cluster
    const partnerForward = `mock-fwd-${(index % forwardTemplates.length) + 1}`;
    links.push({
      id: `link-c-${index + 1}`,
      source: partnerForward,
      target: id,
      type: 'co_citation',
      label: 'Co-cited with',
      weight: 0.8,
    });
  });

  return {
    rootPaper: rootNode,
    nodes,
    links,
    clusters: CITATION_CLUSTERS,
    summary: {
      total_nodes: nodes.length,
      total_links: links.length,
      total_backward: backwardTemplates.length,
      total_forward: forwardTemplates.length,
      total_co_citations: coCitationTemplates.length,
      is_mock: true,
    },
  };
}

/**
 * Service: Retrieve the complete citation graph for a given paper.
 * Queries PostgreSQL if available; gracefully falls back to synthetic mock graph when citations table is sparse.
 */
export async function getCitationGraph(paperId) {
  let paper = null;

  try {
    paper = await citationRepo.findPaperById(paperId);
  } catch (err) {
    // Database read error or not connected — fallback safely
    console.warn(`[CitationService] Database query failed for paper ${paperId}: ${err.message}. Using fallback graph.`);
  }

  // If paper is found in database, check for real citations
  if (paper) {
    try {
      const [backwardRefs, forwardCits, coCitations] = await Promise.all([
        citationRepo.getBackwardReferences(paperId),
        citationRepo.getForwardCitations(paperId),
        citationRepo.getCoCitations(paperId),
      ]);

      const hasRealCitations = backwardRefs.length > 0 || forwardCits.length > 0 || coCitations.length > 0;

      if (hasRealCitations) {
        const rootId = String(paper.id);
        const rootNode = {
          id: rootId,
          title: paper.title,
          authors: Array.isArray(paper.authors) ? paper.authors : [paper.authors],
          publication_year: paper.publication_year || new Date(paper.uploaded_at).getFullYear(),
          arxiv_id: paper.arxiv_id || null,
          node_type: 'root',
          cluster_id: 'cluster-foundations',
          cluster_label: 'Theoretical Foundations & Prior Art',
          abstract: paper.abstract,
        };

        const nodesMap = new Map();
        nodesMap.set(rootId, rootNode);
        const links = [];

        // Backward references (paper -> cited)
        backwardRefs.forEach((ref) => {
          const id = String(ref.id);
          if (!nodesMap.has(id)) {
            nodesMap.set(id, {
              id,
              title: ref.title,
              authors: Array.isArray(ref.authors) ? ref.authors : [ref.authors],
              publication_year: ref.publication_year || null,
              node_type: 'backward',
              cluster_id: 'cluster-foundations',
              cluster_label: 'Prior Art',
              abstract: ref.abstract,
            });
          }
          links.push({
            id: `link-b-${id}`,
            source: rootId,
            target: id,
            type: 'backward',
            label: 'References',
            weight: 1.0,
          });
        });

        // Forward citations (citing -> paper)
        forwardCits.forEach((cit) => {
          const id = String(cit.id);
          if (!nodesMap.has(id)) {
            nodesMap.set(id, {
              id,
              title: cit.title,
              authors: Array.isArray(cit.authors) ? cit.authors : [cit.authors],
              publication_year: cit.publication_year || null,
              node_type: 'forward',
              cluster_id: 'cluster-methods',
              cluster_label: 'Downstream Works',
              abstract: cit.abstract,
            });
          }
          links.push({
            id: `link-f-${id}`,
            source: id,
            target: rootId,
            type: 'forward',
            label: 'Cites',
            weight: 1.0,
          });
        });

        // Co-citations
        coCitations.forEach((co) => {
          const id = String(co.id);
          if (!nodesMap.has(id)) {
            nodesMap.set(id, {
              id,
              title: co.title,
              authors: Array.isArray(co.authors) ? co.authors : [co.authors],
              publication_year: co.publication_year || null,
              node_type: 'co_citation',
              cluster_id: 'cluster-applications',
              cluster_label: 'Co-citation Cluster',
              abstract: co.abstract,
            });
          }
          links.push({
            id: `link-c-${id}`,
            source: rootId,
            target: id,
            type: 'co_citation',
            label: 'Co-cited with',
            weight: co.co_citation_strength ? co.co_citation_strength / 10 : 0.7,
          });
        });

        const nodes = Array.from(nodesMap.values());

        return {
          rootPaper: rootNode,
          nodes,
          links,
          clusters: CITATION_CLUSTERS,
          summary: {
            total_nodes: nodes.length,
            total_links: links.length,
            total_backward: backwardRefs.length,
            total_forward: forwardCits.length,
            total_co_citations: coCitations.length,
            is_mock: false,
          },
        };
      }
    } catch (err) {
      console.warn(`[CitationService] Failed building real citation graph: ${err.message}. Defaulting to mock.`);
    }
  }

  // Graceful fallback to rich mock graph
  const fallbackPaper = paper || {
    id: paperId,
    title: 'Collaborative Research Exploration Paper',
    authors: ['Research Author et al.'],
    publication_year: 2023,
    abstract: 'Exploration of interactive graph representations in academic literature.',
  };

  return generateMockCitationGraph(fallbackPaper);
}
