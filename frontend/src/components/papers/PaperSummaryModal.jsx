import { useCallback, useEffect, useState } from 'react';
import api, { getApiErrorMessage } from '../../services/api';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { SUMMARY_TYPES } from '../../utils/constants';
import { Sparkles, Check, Copy, Bot } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export default function PaperSummaryModal(props) {
  return <SummaryModalContent key={`${props.paper?.id}:${props.isOpen}`} {...props} />;
}

function SummaryModalContent({ isOpen, onClose, paper }) {
  const { success } = useToast();
  const [selectedType, setSelectedType] = useState('comprehensive');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);
  const [observedAt, setObservedAt] = useState(0);
  const [refresh, setRefresh] = useState(0);

  const applyJob = useCallback((current) => {
    setJob(current);
    setObservedAt(Date.now());
    setIsGenerating(['pending', 'processing'].includes(current?.status));
    if (['pending', 'processing'].includes(current?.status)) setError('');
    if (current?.status === 'completed') {
      setSummary({
        type: current.summary_type,
        sections: current.sections,
        text: current.sections.map(s => `${s.heading}\n${s.text}`).join('\n\n'),
        generatedAt: new Date(current.updated_at).toLocaleTimeString(),
      });
      setError('');
    } else if (current?.status === 'failed') {
      const messages = {
        ORIGINAL_PDF_REQUIRED: 'Only a generated report is available locally. Upload the original paper PDF to summarize its evidence.',
        PDF_UNAVAILABLE: 'The original PDF is missing on this server.',
        PDF_TEXT_TOO_LONG: 'The previous attempt reached the extraction limit. The updated backend supports 500,000 characters or 50,000 passages. Retry once after updating; if it still fails, split the PDF into smaller files.',
        PDF_TOO_LONG: 'Summaries support up to 150 PDF pages. Split this document into smaller PDFs.',
        AI_INPUT_TOO_LONG: 'The extracted passages exceed the summary request budget. Split the PDF into smaller documents; the original text has not been truncated.',
        PDF_HAS_NO_TEXT: 'This PDF has no readable text. Scanned PDFs need OCR first.',
        SOURCE_DOWNLOAD_FAILED: 'Could not retrieve the original paper from arXiv. Please retry later.',
        AI_NOT_CONFIGURED: 'The worker that ran the previous attempt had no Gemini key. Retry from your configured backend.',
        DATABASE_BUSY: 'The database is busy or timed out. Please retry later.',
        DATABASE_CONNECTION_LOST: 'The database connection was interrupted. Please retry once it is available again.',
        AI_RATE_LIMITED: 'Gemini rate limit or quota reached (HTTP 429). Check your project quota before retrying.',
        AI_AUTH_FAILED: 'Gemini rejected this server’s API key. Check GEMINI_API_KEY on the running backend.',
        AI_ACCESS_DENIED: 'Gemini denied this key or project access (HTTP 403). Check model access and project restrictions.',
        AI_MODEL_UNAVAILABLE: 'This Gemini model is unavailable for the configured key (HTTP 404). Check GEMINI_SUMMARY_MODEL.',
        AI_INVALID_REQUEST: 'Gemini rejected the summary request (HTTP 400). The backend logs show its diagnostic code.',
        AI_PROVIDER_UNAVAILABLE: 'Gemini remained unavailable after automatic retries. Previously saved summaries are safe. Retry later or use another available model.',
        AI_TIMEOUT: 'Gemini did not respond in time. Please retry later.',
        AI_CONNECTION_FAILED: 'The backend could not connect to Gemini. Check its internet and DNS connection.',
      };
      setError(messages[current.error_code] || `Summary generation failed (${current.error_code || 'UNKNOWN_ERROR'}). Please retry.`);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !paper?.id) return undefined;
    let active = true;
    let timer;
    const controller = new AbortController();
    const load = async () => {
      try {
        const { data } = await api.get(`/papers/${paper.id}/summaries`, {
          params: { type: selectedType }, signal: controller.signal,
        });
        if (!active) return;
        applyJob(data.summary);
        if (['pending', 'processing'].includes(data.summary?.status)) timer = setTimeout(load, 2000);
      } catch (requestError) {
        if (active) { setIsGenerating(false); setError(getApiErrorMessage(requestError, 'Could not load summary.')); }
      }
    };
    void load();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [isOpen, paper?.id, selectedType, refresh, applyJob]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');
    try {
      const { data } = await api.post(`/papers/${paper.id}/summaries`, { type: selectedType });
      applyJob(data.summary);
      setRefresh(value => value + 1);
    } catch (requestError) {
      setIsGenerating(false);
      setError(getApiErrorMessage(requestError, 'Could not request summary.'));
    }
  };

  const handleCopy = async () => {
    if (!summary?.text) return;
    try {
      await navigator.clipboard.writeText(summary.text);
      setCopied(true);
      success('Copied to Clipboard', 'AI summary copied.');
    } catch { setError('Clipboard unavailable. Select the summary text to copy it.'); }
  };

  const providerRetry = job?.status === 'pending' && ['AI_PROVIDER_UNAVAILABLE', 'AI_RATE_LIMITED'].includes(job?.error_code);
  const retryAt = Date.parse(job?.available_at || '');
  const retrySeconds = Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - observedAt) / 1000)) : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI Research Summary"
      description={`Generate structured summaries for "${paper?.title?.slice(0, 50)}..."`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Summary Type Selector */}
        <div>
          <label className="block text-xs font-bold text-theme-secondary uppercase tracking-wider mb-2">
            Select Summary Perspective
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {SUMMARY_TYPES.map((type) => (
              <div
                key={type.id}
                onClick={() => { if (isGenerating) return; setSelectedType(type.id); setSummary(null); setJob(null); setError(''); setCopied(false); }}
                className={`p-3 rounded-xl border transition cursor-pointer ${
                  selectedType === type.id
                    ? 'border-violet-500 bg-violet-500/10 shadow-xs'
                    : 'border-theme-subtle hover:border-theme-strong bg-theme-elevated'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-theme-main">{type.label}</span>
                  {selectedType === type.id && (
                    <span className="w-2 h-2 rounded-full bg-violet-400" />
                  )}
                </div>
                <p className="text-xs text-theme-secondary mt-1 leading-snug font-medium">
                  {type.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
        {isGenerating && <p role="status" className="text-xs text-violet-300">{providerRetry
          ? `Gemini is temporarily unavailable or rate limited. Retrying ${retrySeconds ? `in ${retrySeconds} seconds` : 'shortly'} — next attempt ${Math.min(3, (job?.attempts || 0) + 1)} of 3.`
          : `${job?.status === 'processing' ? 'Generating structured summary' : 'Summary queued'} — attempt ${job?.attempts || 1} of 3.`}</p>}
        <p className="text-xs text-theme-muted">AI summaries use the original PDF. Verify claims using the source references below.</p>

        {/* Generate Trigger */}
        <div className="flex flex-wrap gap-3 justify-between items-center pt-2">
          <Badge variant="violet" size="xs">
            <Bot className="w-3 h-3 text-violet-400" />
            <span>Multi-Format AI Engine</span>
          </Badge>

          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerate}
            loading={isGenerating}
            disabled={!paper?.id}
            iconLeft={Sparkles}
          >
            {summary ? 'View Saved Summary' : job?.status === 'failed' ? 'Retry Summary' : 'Generate Summary'}
          </Button>
        </div>

        {/* Result Area */}
        {summary && (
          <div className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-violet-300 capitalize">
                {summary.type} Summary ({summary.generatedAt})
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleCopy}
                iconLeft={copied ? Check : Copy}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            {summary.sections.map(section => (
              <section key={section.heading} className="bg-theme-card p-4 rounded-xl border border-theme-subtle space-y-2">
                <h4 className="text-sm font-semibold text-theme-main">{section.heading}</h4>
                <p className="text-xs text-theme-secondary whitespace-pre-line leading-relaxed">{section.text}</p>
                <div className="flex flex-wrap gap-2">
                  {section.sources.map(source => (
                    <a key={source.id} href={paper.arxiv_id ? `https://arxiv.org/pdf/${paper.arxiv_id}.pdf#page=${source.page}` : `/api/papers/${paper.id}/pdf#page=${source.page}`}
                      target="_blank" rel="noreferrer" className="text-xs text-violet-400 hover:text-violet-300 underline"
                      title={`PDF coordinates: x=${source.x.toFixed(3)}, y=${source.y.toFixed(3)}, width=${source.width.toFixed(3)}, height=${source.height.toFixed(3)}`}>
                      Page {source.page} ({Math.round(source.x * 100)}%, {Math.round(source.y * 100)}%)
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
