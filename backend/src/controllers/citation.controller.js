import * as citationService from '../services/citation.service.js';

/**
 * Controller: Retrieve citation graph for a paper.
 * GET /api/papers/:id/citation-graph
 */
export async function getCitationGraph(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({
        error: 'A valid paper ID is required in route parameter.',
      });
    }

    const graphData = await citationService.getCitationGraph(id.trim());

    return res.status(200).json({
      status: 'success',
      rootPaper: graphData.rootPaper,
      nodes: graphData.nodes,
      links: graphData.links,
      clusters: graphData.clusters,
      summary: graphData.summary,
    });
  } catch (error) {
    return next(error);
  }
}
