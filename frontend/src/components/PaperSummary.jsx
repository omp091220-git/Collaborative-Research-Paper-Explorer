import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const SECTION_ORDER = ['background', 'methodology', 'results', 'limitations'];
const SECTION_TITLES = {
  background: 'Background',
  methodology: 'Methodology',
  results: 'Results',
  limitations: 'Limitations',
};

function formatPercent(value) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function SourceReference({ source }) {
  const [expanded, setExpanded] = useState(false);
  const box = source.boundingBox;

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="font-semibold text-indigo-700 hover:text-indigo-900"
        aria-expanded={expanded}
      >
        Source: PDF page {source.pageNumber} {box ? '· normalized bounding box' : '· coordinates unavailable'}
      </button>
      {box && (
        <p className="mt-1 font-mono text-[11px] text-slate-500">
          x={formatPercent(box.x)}, y={formatPercent(box.y)}, width={formatPercent(box.width)}, height={formatPercent(box.height)}
        </p>
      )}
      {expanded && (
        <p className="mt-2 whitespace-pre-wrap break-words border-t border-slate-100 pt-2">
          {source.text || 'No source excerpt was returned.'}
        </p>
      )}
    </div>
  );
}

function SummaryView({ summary }) {
  if (!summary?.sections) return null;
  const sectionMap = new Map(summary.sections.map((section) => [section.key, section]));

  return (
    <div className="mt-4 space-y-3" aria-live="polite">
      {SECTION_ORDER.map((key) => {
        const section = sectionMap.get(key);
        if (!section) return null;
        return (
          <section key={key} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-slate-800">{SECTION_TITLES[key]}</h4>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                section.status === 'supported'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {section.status === 'supported' ? 'Source-supported' : 'Insufficient source evidence'}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {section.text || 'The extracted text did not provide enough evidence to summarize this section reliably.'}
            </p>
            {section.sources?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting source passages</p>
                {section.sources.map((source) => <SourceReference key={source.passageId} source={source} />)}
              </div>
            )}
          </section>
        );
      })}
      <p className="text-[11px] text-slate-400">
        Model: {summary.modelName || 'Gemini'} · Pages processed: {summary.pageCount ?? '—'} · Generated: {summary.createdAt ? new Date(summary.createdAt).toLocaleString() : 'just now'}
      </p>
    </div>
  );
}

export default function PaperSummary({ paperId }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loadingExisting, setLoadingExisting] = useState(false);

  const openExistingSummary = useCallback(async () => {
    setPanelOpen(true);
    setError('');
    setLoadingExisting(true);
    try {
      const response = await axios.get(`/api/summaries/papers/${paperId}`, { withCredentials: true });
      if (response.data.summary) {
        setSummary(response.data.summary);
        setStatus('completed');
        setJobId(null);
      } else {
        setSummary(null);
        setStatus('idle');
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not load the existing summary.');
    } finally {
      setLoadingExisting(false);
    }
  }, [paperId]);

  const generateSummary = async () => {
    setPanelOpen(true);
    setError('');
    setSummary(null);
    setJobId(null);
    setStatus('queued');
    try {
      const response = await axios.post(
        `/api/summaries/papers/${paperId}/generate`,
        {},
        { withCredentials: true },
      );
      setJobId(response.data.job?.id || null);
      setStatus(response.data.job?.status || 'queued');
    } catch (requestError) {
      setStatus('failed');
      setError(requestError.response?.data?.error || 'Could not start summary generation.');
    }
  };

  useEffect(() => {
    if (!jobId || !['queued', 'processing'].includes(status)) return undefined;
    let active = true;
    let timer;

    const poll = async () => {
      try {
        const response = await axios.get(`/api/summaries/jobs/${jobId}`, { withCredentials: true });
        if (!active) return;
        const job = response.data.job;
        setStatus(job.status);
        if (job.status === 'completed') {
          setSummary(response.data.summary);
          setError('');
        } else if (job.status === 'failed') {
          setError(job.error || 'Summary generation failed. Your uploaded paper is still available.');
        } else {
          timer = setTimeout(poll, 2000);
        }
      } catch (requestError) {
        if (!active) return;
        setError(requestError.response?.data?.error || 'Could not check summary progress.');
        timer = setTimeout(poll, 4000);
      }
    };

    timer = setTimeout(poll, 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId, status]);

  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generateSummary}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={status === 'queued' || status === 'processing'}
        >
          {status === 'queued' || status === 'processing' ? 'Summary processing…' : '🤖 Generate AI Summary'}
        </button>
        <button
          type="button"
          onClick={openExistingSummary}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          disabled={loadingExisting}
        >
          {loadingExisting ? 'Loading summary…' : 'View saved summary'}
        </button>
        {panelOpen && (
          <button type="button" onClick={() => setPanelOpen(false)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">
            Hide
          </button>
        )}
      </div>

      {panelOpen && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          {['queued', 'processing'].includes(status) && (
            <p className="flex items-center gap-2 text-sm text-indigo-700" role="status">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
              {status === 'queued' ? 'Summary job is queued…' : 'Reading the paper and generating structured summaries…'}
            </p>
          )}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
          {status === 'idle' && !loadingExisting && !error && (
            <p className="text-sm text-slate-600">No saved structured summary exists yet. Select Generate AI Summary to create one.</p>
          )}
          {status === 'completed' && summary && <SummaryView summary={summary} />}
        </div>
      )}
    </div>
  );
}
