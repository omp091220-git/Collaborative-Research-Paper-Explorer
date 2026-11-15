import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import tagsService from '../../services/tags.service';
import { getApiErrorMessage } from '../../services/api';
import { FolderPlus, Save, AlertCircle } from 'lucide-react';

export default function TagFormModal({
  isOpen,
  onClose,
  onSaved,
  mode = 'create', // 'create' | 'edit'
  parentTag = null,
  tagToEdit = null,
  allTags = [], // flat list or tree of tags for parent selector
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [parentId, setParentId] = useState(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper to auto-generate a valid slug from name
  const slugify = (text) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (mode === 'edit' && tagToEdit) {
      setName(tagToEdit.name || '');
      setSlug(tagToEdit.slug || '');
      setSlugManuallyEdited(true);
      setParentId(tagToEdit.parentId || tagToEdit.parent_id || null);
      setDescription(tagToEdit.description || '');
    } else {
      setName('');
      setSlug('');
      setSlugManuallyEdited(false);
      setParentId(parentTag?.id || null);
      setDescription('');
    }
  }, [isOpen, mode, tagToEdit, parentTag]);

  const handleNameChange = (val) => {
    setName(val);
    if (!slugManuallyEdited && mode === 'create') {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (val) => {
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    setSlugManuallyEdited(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Tag name is required.');
      return;
    }

    const effectiveSlug = (slug || slugify(trimmedName)).trim();
    if (!effectiveSlug) {
      setError('A valid slug is required.');
      return;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(effectiveSlug)) {
      setError('Slug must contain only lowercase alphanumeric characters and single hyphens.');
      return;
    }

    // Check circular reference in edit mode
    if (mode === 'edit' && tagToEdit && parentId === tagToEdit.id) {
      setError('A tag cannot be its own parent.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'edit' && tagToEdit) {
        const payload = {
          name: trimmedName,
          slug: effectiveSlug,
          parentId: parentId || null,
          description: description.trim() || null,
        };
        const updated = await tagsService.updateTag(tagToEdit.id, payload);
        onSaved && onSaved(updated, 'updated');
      } else {
        const payload = {
          name: trimmedName,
          slug: effectiveSlug,
          parentId: parentId || null,
          description: description.trim() || null,
        };
        const created = await tagsService.createTag(payload);
        onSaved && onSaved(created, 'created');
      }
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save topic tag.'));
    } finally {
      setLoading(false);
    }
  };

  // Build a flat list of eligible parent tags (excluding the tag itself and its descendants when editing)
  const flattenTags = (nodes, depth = 0, acc = []) => {
    for (const node of nodes) {
      if (mode === 'edit' && tagToEdit && node.id === tagToEdit.id) {
        // Skip current tag and its branch to avoid circular hierarchy
        continue;
      }
      acc.push({
        id: node.id,
        name: node.name,
        canonicalPath: node.canonicalPath || node.slug,
        depth: depth,
      });
      if (node.children && node.children.length > 0) {
        flattenTags(node.children, depth + 1, acc);
      }
    }
    return acc;
  };

  const eligibleParents = flattenTags(allTags);

  const title =
    mode === 'edit'
      ? `Edit Tag: ${tagToEdit?.name || ''}`
      : parentTag
      ? `Create Child Tag under "${parentTag.name}"`
      : 'Create Root Topic Tag';

  const descriptionText =
    mode === 'edit'
      ? 'Update tag naming, slug, description, or reparent within the taxonomy.'
      : parentTag
      ? `This tag will be nested under ${parentTag.canonicalPath || parentTag.name}.`
      : 'Root tags represent top-level scientific domains and taxonomy categories.';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={descriptionText}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* Tag Name */}
        <div>
          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
            Tag Name <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Perovskite Solar Cells"
            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            required
            autoFocus
          />
        </div>

        {/* Slug */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
              Identifier Slug <span className="text-rose-600">*</span>
            </label>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Lowercase, hyphens only
            </span>
          </div>
          <input
            type="text"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="perovskite-solar-cells"
            className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            required
          />
        </div>

        {/* Parent Tag Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
            Parent Taxonomy Category
          </label>
          <select
            value={parentId || ''}
            onChange={(e) => setParentId(e.target.value || null)}
            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-sans"
          >
            <option value="">(None - Root Topic Domain)</option>
            {eligibleParents.map((p) => (
              <option key={p.id} value={p.id}>
                {'\u00A0'.repeat(p.depth * 3)}↳ {p.name} ({p.canonicalPath})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Moving a tag reparents it and recalculates all canonical descendant paths.
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
            Description <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Scientific scope, methodologies, or relevance of this topic..."
            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-y"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={loading}
            iconLeft={mode === 'edit' ? Save : FolderPlus}
          >
            {mode === 'edit' ? 'Save Changes' : 'Create Tag'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
