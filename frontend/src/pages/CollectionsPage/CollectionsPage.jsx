import { useState } from 'react';
import { FolderKanban, Plus } from 'lucide-react';
import { useLibrary } from '../../context/LibraryContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/layout/PageHeader';
import CollectionCard from '../../components/collections/CollectionCard';
import CreateCollectionModal from '../../components/collections/CreateCollectionModal';
import ConfirmationDialog from '../../components/common/ConfirmationDialog';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';

export default function CollectionsPage() {
  const { collections, createCollection, deleteCollection } = useLibrary();
  const { addToast } = useToast();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState(null);

  const handleCreateCollection = ({ name, description, isPrivate }) => {
    createCollection(name, description, isPrivate);
    addToast({
      type: 'success',
      title: 'Collection Created',
      message: `"${name}" is ready for research papers.`,
    });
  };

  const handleConfirmDelete = () => {
    if (!collectionToDelete) return;
    deleteCollection(collectionToDelete.id);
    addToast({
      type: 'info',
      title: 'Collection Deleted',
      message: `"${collectionToDelete.name}" was removed.`,
    });
    setCollectionToDelete(null);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Research Collections"
        description="Curate themed portfolios of scientific literature for literature reviews, lab seminars, and research grants."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Collection</span>
          </Button>
        }
      />

      {/* Collections Grid */}
      {collections.length === 0 ? (
        <EmptyState
          title="No research collections"
          description="Group related research papers into organized collections by project, topic, or seminar."
          icon={FolderKanban}
          actionLabel="Create First Collection"
          onAction={() => setCreateModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {collections.map((col) => (
            <CollectionCard
              key={col.id}
              collection={col}
              onDelete={(collection) => setCollectionToDelete(collection)}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      <CreateCollectionModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateCollection}
      />

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={Boolean(collectionToDelete)}
        title="Delete Collection"
        message={`Are you sure you want to delete "${collectionToDelete?.name}"? Papers within the explorer will remain intact.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setCollectionToDelete(null)}
      />
    </div>
  );
}
