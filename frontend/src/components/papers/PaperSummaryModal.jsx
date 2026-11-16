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
  const [refresh, setRefresh] = useState(0);

  const applyJob = useCallback((current) => {
    setJob(current);
    setIsGenerating(['pending', 'processing'].includes(current?.status));
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
        PDF_HAS_NO_TEXT: 'This PDF has no readable text. Scanned PDFs need OCR first.',
        SOURCE_DOWNLOAD_FAILED: 'Could not retrieve the original paper from arXiv. Please retry later.',
        AI_NOT_CONFIGURED: 'AI summaries are not configured on this server.',
        DATABASE_BUSY: 'The database is busy or timed out. Please retry later.',
        DATABASE_CONNECTION_LOST: 'The database connection was interrupted. Please retry once it is available again.',
        AI_RATE_LIMITED: 'The AI provider is busy. Please retry later.',
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
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
            Select Summary Perspective
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {SUMMARY_TYPES.map((type) => (
              <div
                key={type.id}
                onClick={() => { if (isGenerating) return; setSelectedType(type.id); setSummary(null); setJob(null); setError(''); setCopied(false); }}
                className={`p-3 rounded-xl border transition cursor-pointer ${
                  selectedType === type.id
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                    : 'border-slate-300 hover:border-slate-400 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">{type.label}</span>
                  {selectedType === type.id && (
                    <span className="w-2 h-2 rounded-full bg-indigo-600" />
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-snug font-medium">
                  {type.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {isGenerating && <p role="status" className="text-sm text-indigo-600">{job?.status === 'processing' ? 'Generating structured summary' : 'Summary queued'} — attempt {job?.attempts || 1} of 3.</p>}
        <p className="text-xs text-slate-500">AI summaries use the original PDF. Verify claims using the source references below.</p>

        {/* Generate Trigger */}
        <div className="flex flex-wrap gap-3 justify-between items-center pt-2">
          <Badge variant="purple" size="xs">
            <Bot className="w-3 h-3 text-purple-600" />
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
          <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/20 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-900 capitalize">
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
              <section key={section.heading} className="bg-white p-4 rounded-lg border border-slate-300 space-y-2">
                <h4 className="text-sm font-semibold text-slate-900">{section.heading}</h4>
                <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">{section.text}</p>
                <div className="flex flex-wrap gap-2">
                  {section.sources.map(source => (
                    <a key={source.id} href={paper.arxiv_id ? `https://arxiv.org/pdf/${paper.arxiv_id}.pdf#page=${source.page}` : `/api/papers/${paper.id}/pdf#page=${source.page}`}
                      target="_blank" rel="noreferrer" className="text-xs text-indigo-700 underline"
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
