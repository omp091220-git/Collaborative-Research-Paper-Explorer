import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { useLibrary } from '../../context/LibraryContext';
import { FolderPlus, Globe, Lock } from 'lucide-react';

export default function CreateCollectionModal({ isOpen, onClose, onCreate }) {
  const { createCollection } = useLibrary();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (onCreate) {
      onCreate({ name: name.trim(), description: description.trim(), isPublic });
    } else {
      createCollection(name.trim(), description.trim(), isPublic);
    }
    setName('');
    setDescription('');
    setIsPublic(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Research Collection"
      description="Organize relevant papers into curated topic portfolios or lab reading lists."
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
            Collection Name <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. LLM Reasoning & Verification"
            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
            Description <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is the objective or scope of this collection?"
            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-y"
          />
        </div>

        <div className="pt-2">
          <span className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
            Visibility & Sharing
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div
              onClick={() => setIsPublic(false)}
              className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                !isPublic
                  ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-xs'
                  : 'border-slate-300 dark:border-slate-700 hover:border-slate-400'
              }`}
            >
              <Lock className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Private</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Only you</p>
              </div>
            </div>

            <div
              onClick={() => setIsPublic(true)}
              className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                isPublic
                  ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-xs'
                  : 'border-slate-300 dark:border-slate-700 hover:border-slate-400'
              }`}
            >
              <Globe className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Public</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Visible to team</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={!name.trim()} iconLeft={FolderPlus}>
            Create Collection
          </Button>
        </div>
      </form>
    </Modal>
  );
}
