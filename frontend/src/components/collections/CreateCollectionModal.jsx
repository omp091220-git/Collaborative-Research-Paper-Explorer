import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { useLibrary } from '../../context/LibraryContext';
import { FolderPlus, Globe, Lock } from 'lucide-react';

export default function CreateCollectionModal({ isOpen, onClose }) {
  const { createCollection } = useLibrary();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    createCollection(name, description, isPublic);
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
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Collection Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. LLM Reasoning & Verification"
            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Description <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is the objective or scope of this collection?"
            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-y"
          />
        </div>

        <div className="pt-2">
          <span className="block text-xs font-semibold text-slate-700 mb-2">
            Visibility & Sharing
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div
              onClick={() => setIsPublic(false)}
              className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                !isPublic
                  ? 'border-indigo-600 bg-indigo-50/40 shadow-2xs'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <Lock className="w-4 h-4 text-slate-500" />
              <div>
                <p className="text-xs font-semibold text-slate-900">Private</p>
                <p className="text-[10px] text-slate-400">Only you</p>
              </div>
            </div>

            <div
              onClick={() => setIsPublic(true)}
              className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                isPublic
                  ? 'border-indigo-600 bg-indigo-50/40 shadow-2xs'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <Globe className="w-4 h-4 text-indigo-500" />
              <div>
                <p className="text-xs font-semibold text-slate-900">Public</p>
                <p className="text-[10px] text-slate-400">Visible to team</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
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
