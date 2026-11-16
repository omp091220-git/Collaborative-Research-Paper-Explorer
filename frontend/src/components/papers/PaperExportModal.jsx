import { useState } from 'react';
import { Download } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import api from '../../services/api';

const formats = [
  {id:'markdown', label:'Markdown (.md)', description:'Complete research notes, saved summaries, section tags, citations, and source coordinates.'},
  {id:'bibtex', label:'BibTeX (.bib)', description:'The paper and its recorded references, with summaries and annotations in the research notes field.'},
  {id:'pdf', label:'Annotated PDF (.pdf)', description:'Original pages with highlights and comments. Full notes and BibTeX are attached inside the PDF. Use a PDF reader with comments and attachments support.'},
];

export default function PaperExportModal({paper, isOpen, onClose}) {
  const [format, setFormat] = useState('markdown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const download = async () => {
    setBusy(true); setError(''); setSuccess(false);
    try {
      const response = await api.get(`/papers/${paper.id}/export`, {params:{format}, responseType:'blob', timeout:90000});
      const filename = response.headers['content-disposition']?.match(/filename="([^"]+)"/)?.[1] || `research-export.${format === 'bibtex' ? 'bib' : format === 'markdown' ? 'md' : 'pdf'}`;
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setSuccess(true);
    } catch (err) {
      let message = 'Export failed. Please retry.';
      if (err.response?.data instanceof Blob) {
        try {message = JSON.parse(await err.response.data.text()).error || message;} catch { /* Non-JSON proxy error. */ }
      } else if (err.message) message = err.message;
      setError(message);
    } finally {setBusy(false);}
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export research" description={paper.title} footer={
      <Button onClick={download} loading={busy} iconLeft={Download}>
        {busy ? 'Preparing download…' : 'Download export'}
      </Button>
    }>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Choose a format</legend>
        {formats.map(option => (
          <label key={option.id} className="flex gap-3 p-4 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer text-slate-900 dark:text-white">
            <input type="radio" name="export-format" value={option.id} checked={format === option.id} onChange={() => {setFormat(option.id); setSuccess(false); setError('');}} className="mt-1" />
            <span><span className="block text-sm font-semibold">{option.label}</span><span className="block text-xs mt-1 text-slate-600 dark:text-slate-300">{option.description}</span></span>
          </label>
        ))}
      </fieldset>
      <p className="mt-4 text-xs text-slate-600 dark:text-slate-300">Exports include saved content visible in this paper’s shared library. Generating an export does not call AI.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {success && <p role="status" className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">Export downloaded.</p>}
    </Modal>
  );
}
