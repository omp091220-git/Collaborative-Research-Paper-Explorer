import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import * as d3 from 'd3';

// Color palette matching the backend cluster definitions
const NODE_COLORS = {
  root: '#0D9488', // Teal-600
  backward: '#2563EB', // Blue-600
  forward: '#7C3AED', // Violet-600
  co_citation: '#D97706', // Amber-600
};

const CLUSTER_COLORS = {
  'cluster-foundations': '#3B82F6',
  'cluster-methods': '#8B5CF6',
  'cluster-applications': '#10B981',
  'cluster-scaling': '#F59E0B',
};

export default function CitationGraph({ paperId, initialPaper, onClose, onSelectPaper }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const zoomBehaviorRef = useRef(null);

  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Interactivity state
  const [activePaperId, setActivePaperId] = useState(paperId);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState({
    backward: true,
    forward: true,
    co_citation: true,
  });
  const [selectedCluster, setSelectedCluster] = useState('ALL');

  // Fetch citation graph data from backend
  useEffect(() => {
    let isMounted = true;
    const fetchGraph = async () => {
      setLoading(true);
      setError(null);
      setSelectedNode(null);
      try {
        const res = await axios.get(`/api/papers/${activePaperId}/citation-graph`, {
          withCredentials: true,
        });
        if (isMounted) {
          setGraphData(res.data);
          // Set focal node as initially selected
          if (res.data.rootPaper) {
            setSelectedNode(res.data.rootPaper);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.error || 'Failed to load citation network.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchGraph();
    return () => {
      isMounted = false;
    };
  }, [activePaperId]);

  // Filter nodes & links based on user toggles and cluster filter
  const visibleData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };

    // Filter nodes
    const validNodes = graphData.nodes.filter((node) => {
      // Root is always visible
      if (node.node_type === 'root') return true;

      // Filter by relation type
      if (!filterType[node.node_type]) return false;

      // Filter by cluster
      if (selectedCluster !== 'ALL' && node.cluster_id !== selectedCluster) {
        return false;
      }

      return true;
    });

    const validNodeIds = new Set(validNodes.map((n) => n.id));

    // Filter links connecting valid nodes
    const validLinks = graphData.links.filter((link) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      if (!validNodeIds.has(sourceId) || !validNodeIds.has(targetId)) return false;

      // Filter link type
      if (link.type && !filterType[link.type]) return false;

      return true;
    });

    return { nodes: validNodes, links: validLinks };
  }, [graphData, filterType, selectedCluster]);

  // Main D3 Rendering Effect
  useEffect(() => {
    if (!svgRef.current || !visibleData.nodes.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous drawing

    const width = containerRef.current?.clientWidth || 900;
    const height = containerRef.current?.clientHeight || 600;

    svg.attr('viewBox', [0, 0, width, height]);

    // Definitions: Arrowheads and Glow Filters
    const defs = svg.append('defs');

    // Arrow markers
    const markerConfigs = [
      { id: 'arrow-backward', color: NODE_COLORS.backward },
      { id: 'arrow-forward', color: NODE_COLORS.forward },
      { id: 'arrow-cocitation', color: NODE_COLORS.co_citation },
    ];

    markerConfigs.forEach(({ id, color }) => {
      defs
        .append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 28)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    });

    // Root glow filter
    const filter = defs.append('filter').attr('id', 'root-glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Root graph container group for zoom/pan
    const g = svg.append('g').attr('class', 'graph-viewport');

    // Setup zoom
    const zoom = d3
      .zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = { zoom, svg, width, height };

    // Deep clone data for D3 mutation
    const nodes = visibleData.nodes.map((d) => ({ ...d }));
    const links = visibleData.links.map((d) => ({ ...d }));

    // Force simulation
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance((d) => (d.type === 'backward' ? 140 : d.type === 'forward' ? 160 : 110))
      )
      .force('charge', d3.forceManyBody().strength(-380))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collision',
        d3.forceCollide().radius((d) => (d.node_type === 'root' ? 44 : 32))
      );

    // Draw Links
    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) =>
        d.type === 'backward'
          ? NODE_COLORS.backward
          : d.type === 'forward'
          ? NODE_COLORS.forward
          : NODE_COLORS.co_citation
      )
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', (d) => (d.type === 'co_citation' ? 1.5 : 2))
      .attr('stroke-dasharray', (d) => (d.type === 'co_citation' ? '4,4' : 'none'))
      .attr('marker-end', (d) =>
        d.type === 'backward'
          ? 'url(#arrow-backward)'
          : d.type === 'forward'
          ? 'url(#arrow-forward)'
          : 'url(#arrow-cocitation)'
      );

    // Draw Node Groups
    const node = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node-item cursor-pointer')
      .call(
        d3
          .drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (_event, d) => {
        setSelectedNode(d);
      })
      .on('mouseenter', (_event, d) => {
        setHoveredNode(d);
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
      });

    // Outer Halo for Root Node
    node
      .filter((d) => d.node_type === 'root')
      .append('circle')
      .attr('r', 32)
      .attr('fill', 'none')
      .attr('stroke', NODE_COLORS.root)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,3')
      .attr('opacity', 0.8)
      .attr('class', 'animate-spin')
      .style('transform-origin', 'center');

    // Main Node Circle
    node
      .append('circle')
      .attr('r', (d) => (d.node_type === 'root' ? 24 : 16))
      .attr('fill', (d) => {
        if (d.node_type === 'root') return NODE_COLORS.root;
        return CLUSTER_COLORS[d.cluster_id] || NODE_COLORS[d.node_type] || '#64748B';
      })
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', (d) => (d.node_type === 'root' ? 3 : 2))
      .attr('filter', (d) => (d.node_type === 'root' ? 'url(#root-glow)' : 'none'))
      .attr('opacity', (d) => {
        if (!searchQuery.trim()) return 1;
        const q = searchQuery.toLowerCase();
        const matches =
          d.title?.toLowerCase().includes(q) ||
          d.authors?.some((a) => a.toLowerCase().includes(q));
        return matches ? 1 : 0.25;
      });

    // Icon or Initial in Circle
    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#FFFFFF')
      .attr('font-size', (d) => (d.node_type === 'root' ? '12px' : '9px'))
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .text((d) => {
        if (d.node_type === 'root') return '★';
        if (d.node_type === 'backward') return '←';
        if (d.node_type === 'forward') return '→';
        return '●';
      });

    // Node Text Label
    node
      .append('text')
      .attr('x', (d) => (d.node_type === 'root' ? 28 : 20))
      .attr('y', 4)
      .attr('fill', '#1E293B')
      .attr('font-size', (d) => (d.node_type === 'root' ? '13px' : '11px'))
      .attr('font-weight', (d) => (d.node_type === 'root' ? '700' : '500'))
      .attr('pointer-events', 'none')
      .text((d) => {
        const title = d.title || 'Untitled';
        return title.length > 28 ? title.slice(0, 26) + '…' : title;
      })
      .attr('opacity', (d) => {
        if (!searchQuery.trim()) return 1;
        const q = searchQuery.toLowerCase();
        const matches =
          d.title?.toLowerCase().includes(q) ||
          d.authors?.some((a) => a.toLowerCase().includes(q));
        return matches ? 1 : 0.2;
      });

    // Subtitle (Year & Authors snippet)
    node
      .append('text')
      .attr('x', (d) => (d.node_type === 'root' ? 28 : 20))
      .attr('y', 17)
      .attr('fill', '#64748B')
      .attr('font-size', '9px')
      .attr('pointer-events', 'none')
      .text((d) => {
        const yr = d.publication_year ? `${d.publication_year} • ` : '';
        const author = Array.isArray(d.authors) ? d.authors[0] : d.authors || '';
        return `${yr}${author}`;
      });

    // Simulation tick handler
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);

      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [visibleData, searchQuery]);

  // Zoom control helpers
  const handleResetZoom = () => {
    if (!zoomBehaviorRef.current) return;
    const { zoom, svg } = zoomBehaviorRef.current;
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
  };

  const handleZoomIn = () => {
    if (!zoomBehaviorRef.current) return;
    const { zoom, svg } = zoomBehaviorRef.current;
    svg.transition().duration(300).call(zoom.scaleBy, 1.3);
  };

  const handleZoomOut = () => {
    if (!zoomBehaviorRef.current) return;
    const { zoom, svg } = zoomBehaviorRef.current;
    svg.transition().duration(300).call(zoom.scaleBy, 0.7);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 animate-fade-in">
      <div className="bg-white w-full h-[92vh] max-w-7xl rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Top Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🕸️</span>
              <h2 className="text-lg font-bold text-slate-800">
                Interactive Citation Explorer
              </h2>
              {graphData?.summary?.is_mock && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  Simulated Citation Data
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
              Focal paper: <strong className="text-slate-700">{graphData?.rootPaper?.title || initialPaper?.title || activePaperId}</strong>
            </p>
          </div>

          {/* Controls: Search, Filters & Close */}
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search graph nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white w-44 sm:w-56"
              />
              <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
            </div>

            {/* Close Button */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
                title="Close Graph"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="px-6 py-2.5 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* Edge / Relation Filter Badges */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-500 mr-1">Show:</span>

            <button
              onClick={() => setFilterType((prev) => ({ ...prev, backward: !prev.backward }))}
              className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1.5 border transition ${
                filterType.backward
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              Backward References ({graphData?.summary?.total_backward || 0})
            </button>

            <button
              onClick={() => setFilterType((prev) => ({ ...prev, forward: !prev.forward }))}
              className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1.5 border transition ${
                filterType.forward
                  ? 'bg-purple-50 text-purple-700 border-purple-300'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-purple-600"></span>
              Forward Citations ({graphData?.summary?.total_forward || 0})
            </button>

            <button
              onClick={() => setFilterType((prev) => ({ ...prev, co_citation: !prev.co_citation }))}
              className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1.5 border transition ${
                filterType.co_citation
                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-600"></span>
              Co-Citation Clusters ({graphData?.summary?.total_co_citations || 0})
            </button>
          </div>

          {/* Cluster Selector */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-500">Research Cluster:</span>
            <select
              value={selectedCluster}
              onChange={(e) => setSelectedCluster(e.target.value)}
              className="py-1 px-2.5 rounded-md border border-slate-300 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="ALL">All Clusters</option>
              {graphData?.clusters?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Body: Graph Canvas + Side Inspector Panel */}
        <div className="flex-1 relative flex overflow-hidden bg-slate-900/5">
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs">
              <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-sm font-semibold text-slate-700">Computing citation physics & clusters…</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-white">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-sm font-medium text-rose-600 mb-3">{error}</p>
              <button
                onClick={() => setActivePaperId(paperId)}
                className="px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition"
              >
                Retry
              </button>
            </div>
          )}

          {/* SVG Viewport */}
          <div ref={containerRef} className="flex-1 w-full h-full relative overflow-hidden">
            <svg ref={svgRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />

            {/* Floating Zoom / Reset Controls */}
            <div className="absolute bottom-5 left-5 flex flex-col gap-1.5 bg-white/90 backdrop-blur-md p-1.5 rounded-xl shadow-md border border-slate-200">
              <button
                onClick={handleZoomIn}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700 font-bold transition"
                title="Zoom In"
              >
                +
              </button>
              <button
                onClick={handleZoomOut}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700 font-bold transition"
                title="Zoom Out"
              >
                −
              </button>
              <button
                onClick={handleResetZoom}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700 text-xs transition"
                title="Reset View"
              >
                ⟲
              </button>
            </div>

            {/* Hover Tooltip */}
            {hoveredNode && !selectedNode && (
              <div
                className="absolute pointer-events-none z-30 bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl border border-slate-700 max-w-xs transition-opacity duration-150"
                style={{
                  left: 20,
                  top: 20,
                }}
              >
                <p className="font-bold text-white mb-0.5">{hoveredNode.title}</p>
                <p className="text-slate-400 text-[10px]">
                  {hoveredNode.authors?.join(', ')} ({hoveredNode.publication_year || 'N/A'})
                </p>
                <div className="mt-1 flex items-center gap-2 text-[10px]">
                  <span className="text-teal-300 font-medium capitalize">
                    {hoveredNode.node_type?.replace('_', ' ')}
                  </span>
                  {hoveredNode.citation_count && (
                    <span className="text-slate-300">
                      ★ {hoveredNode.citation_count.toLocaleString()} citations
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Slide-out Details Inspector */}
          {selectedNode && (
            <div className="w-80 sm:w-96 bg-white border-l border-slate-200 p-5 flex flex-col justify-between shadow-lg overflow-y-auto z-10 animate-slide-left">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white"
                    style={{
                      backgroundColor:
                        NODE_COLORS[selectedNode.node_type] ||
                        CLUSTER_COLORS[selectedNode.cluster_id] ||
                        '#64748B',
                    }}
                  >
                    {selectedNode.node_type === 'root'
                      ? 'Focal Paper'
                      : selectedNode.node_type?.replace('_', ' ')}
                  </span>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-slate-400 hover:text-slate-700 text-sm p-1 rounded-md"
                  >
                    ✕
                  </button>
                </div>

                <h3 className="text-base font-bold text-slate-800 mb-2 leading-snug">
                  {selectedNode.title}
                </h3>

                <div className="space-y-2 text-xs text-slate-600 mb-4">
                  <p>
                    <strong className="text-slate-700">Authors:</strong>{' '}
                    {Array.isArray(selectedNode.authors)
                      ? selectedNode.authors.join(', ')
                      : selectedNode.authors || 'Unknown'}
                  </p>
                  <p>
                    <strong className="text-slate-700">Publication Year:</strong>{' '}
                    {selectedNode.publication_year || 'N/A'}
                  </p>
                  {selectedNode.cluster_label && (
                    <p>
                      <strong className="text-slate-700">Thematic Cluster:</strong>{' '}
                      <span className="text-teal-700 font-medium">
                        {selectedNode.cluster_label}
                      </span>
                    </p>
                  )}
                  {selectedNode.citation_count && (
                    <p>
                      <strong className="text-slate-700">Citations:</strong>{' '}
                      {selectedNode.citation_count.toLocaleString()}
                    </p>
                  )}
                  {selectedNode.arxiv_id && (
                    <p>
                      <strong className="text-slate-700">arXiv:</strong>{' '}
                      <a
                        href={`https://arxiv.org/abs/${selectedNode.arxiv_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {selectedNode.arxiv_id} ↗
                      </a>
                    </p>
                  )}
                </div>

                {selectedNode.abstract && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 mb-4">
                    <p className="font-bold text-slate-700 mb-1">Abstract Summary</p>
                    <p className="leading-relaxed line-clamp-6">{selectedNode.abstract}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                {selectedNode.id !== activePaperId && (
                  <button
                    onClick={() => {
                      setActivePaperId(selectedNode.id);
                    }}
                    className="w-full py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
                  >
                    <span>🎯</span> Center Graph on this Paper
                  </button>
                )}

                {onSelectPaper && (
                  <button
                    onClick={() => {
                      onSelectPaper(selectedNode);
                      if (onClose) onClose();
                    }}
                    className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                  >
                    Open Full Paper Details
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Legend Bar */}
        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-semibold text-slate-600">Legend:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-teal-600"></span> Focal Paper
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-600"></span> Backward Reference (Cited by focal)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-purple-600"></span> Forward Citation (Cites focal)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-600"></span> Co-citation Cluster
            </span>
          </div>

          <div className="text-[11px] text-slate-400">
            Tip: Drag nodes to rearrange • Scroll wheel to zoom • Click a node to view paper details
          </div>
        </div>
      </div>
    </div>
  );
}
