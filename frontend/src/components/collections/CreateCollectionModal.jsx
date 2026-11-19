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
          <label className="block text-xs font-bold text-theme-main mb-1">
            Collection Name <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. LLM Reasoning & Verification"
            className="w-full px-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-theme-main mb-1">
            Description <span className="text-theme-muted font-normal">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is the objective or scope of this collection?"
            className="w-full px-3 py-2 text-xs bg-theme-elevated border border-theme-subtle rounded-xl text-theme-main placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 resize-y"
          />
        </div>

        <div className="pt-2">
          <span className="block text-xs font-bold text-theme-main mb-2">
            Visibility & Sharing
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div
              onClick={() => setIsPublic(false)}
              className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                !isPublic
                  ? 'border-violet-500 bg-violet-500/10 shadow-xs'
                  : 'border-theme-subtle hover:border-theme-strong hover:bg-theme-elevated'
              }`}
            >
              <Lock className="w-4 h-4 text-theme-secondary" />
              <div>
                <p className="text-xs font-bold text-theme-main">Private</p>
                <p className="text-[11px] text-theme-secondary font-medium">Only you</p>
              </div>
            </div>

            <div
              onClick={() => setIsPublic(true)}
              className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                isPublic
                  ? 'border-violet-500 bg-violet-500/10 shadow-xs'
                  : 'border-theme-subtle hover:border-theme-strong hover:bg-theme-elevated'
              }`}
            >
              <Globe className="w-4 h-4 text-violet-400" />
              <div>
                <p className="text-xs font-bold text-theme-main">Public</p>
                <p className="text-[11px] text-theme-secondary font-medium">Visible to team</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-3 border-t border-theme-subtle">
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
