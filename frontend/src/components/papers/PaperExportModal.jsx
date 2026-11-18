import { useState } from 'react';
import { Download } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import api from '../../services/api';

const formats = [
  {id:'original_pdf', label:'Original Paper (PDF)', description:'Direct download of the original research publication PDF document.'},
  {id:'pdf', label:'Annotated Research Report (PDF)', description:'Original paper with highlights, followed by readable pages of saved summaries, annotations, section tags, and citations.'},
  {id:'markdown', label:'Markdown Document (.md)', description:'Complete research notes, saved summaries, section tags, citations, and source coordinates.'},
  {id:'bibtex', label:'BibTeX Citation (.bib)', description:'The paper and its recorded references, with summaries and annotations in the research notes field.'},
];

export default function PaperExportModal({paper, isOpen, onClose}) {
  const [format, setFormat] = useState('original_pdf');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const download = async () => {
    setBusy(true); setError(''); setSuccess(false);
    try {
      if (format === 'original_pdf') {
        const response = await api.get(`/papers/${paper.id}/pdf`, { responseType: 'blob', timeout: 90000 });
        const cleanTitle = (paper.title || 'research-paper').replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `${cleanTitle}.pdf`;
        const url = URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setSuccess(true);
        return;
      }

      const response = await api.get(`/papers/${paper.id}/export`, {params:{format}, responseType:'blob', timeout:90000});
      const filename = response.headers['content-disposition']?.match(/filename="([^"]+)"/)?.[1] || `research-export.${format === 'bibtex' ? 'bib' : format === 'markdown' ? 'md' : 'pdf'}`;
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setSuccess(true);
    } catch (err) {
      let message = 'Export failed. Please retry.';
      if (err.response?.status === 403) {
        message = 'You do not have permission to export or download this private research paper.';
      } else if (err.response?.data instanceof Blob) {
        try {message = JSON.parse(await err.response.data.text()).error || message;} catch { /* Non-JSON proxy error. */ }
      } else if (err.message) message = err.message;
      setError(message);
    } finally {setBusy(false);}
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Research Document" description={paper?.title || 'Research Paper'} footer={
      <Button onClick={download} loading={busy} iconLeft={Download} size="md" className="min-h-11 w-full sm:w-auto sm:min-w-44 whitespace-nowrap px-5">
        {busy ? 'Preparing download…' : 'Download document'}
      </Button>
    }>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="text-sm font-semibold text-theme-main mb-3">Choose a format</legend>
        {formats.map(option => (
          <label key={option.id} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${format === option.id ? 'border-violet-500 bg-violet-500/10' : 'border-theme-subtle bg-theme-elevated hover:border-theme-strong'}`}>
            <input type="radio" name="export-format" value={option.id} checked={format === option.id} onChange={() => {setFormat(option.id); setSuccess(false); setError('');}} className="mt-1 h-4 w-4 shrink-0 accent-violet-500" />
            <span className="min-w-0"><span className="block text-sm font-semibold text-theme-main">{option.label}</span><span className="block text-xs mt-1 text-theme-secondary">{option.description}</span></span>
          </label>
        ))}
      </fieldset>
      <p className="mt-4 text-xs text-theme-muted">Exports include saved content visible in this paper’s shared library. Generating an export does not call AI.</p>
      {error && <p role="alert" className="mt-4 text-sm text-rose-400">{error}</p>}
      {success && <p role="status" className="mt-4 text-sm text-emerald-400">{format === 'original_pdf' || format === 'pdf' ? 'PDF downloaded successfully.' : 'Export downloaded successfully.'}</p>}
    </Modal>
  );
}
