import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const { user } = useAuth();
  const { success, info } = useToast();

  const storagePrefix = user?.id ? `crpe_lib_${user.id}_` : 'crpe_lib_guest_';

  // Bookmarked paper IDs
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}bookmarks`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Reading status: { [paperId]: 'want_to_read' | 'reading' | 'completed' }
  const [readingStatus, setReadingStatus] = useState(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}reading_status`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Collections: [ { id, name, description, isPublic, paperIds, createdAt } ]
  const [collections, setCollections] = useState(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}collections`);
      if (saved) return JSON.parse(saved);
      return [
        {
          id: 'default-foundations',
          name: 'Core Foundations',
          description: 'Fundamental milestone papers in Machine Learning & Systems.',
          isPublic: false,
          paperIds: [],
          createdAt: new Date().toISOString(),
        },
      ];
    } catch {
      return [];
    }
  });

  // Re-load state when user changes
  useEffect(() => {
    try {
      const b = localStorage.getItem(`${storagePrefix}bookmarks`);
      setBookmarks(b ? JSON.parse(b) : []);

      const r = localStorage.getItem(`${storagePrefix}reading_status`);
      setReadingStatus(r ? JSON.parse(r) : {});

      const c = localStorage.getItem(`${storagePrefix}collections`);
      if (c) {
        setCollections(JSON.parse(c));
      } else {
        setCollections([
          {
            id: 'default-foundations',
            name: 'Core Foundations',
            description: 'Fundamental milestone papers in Machine Learning & Systems.',
            isPublic: false,
            paperIds: [],
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      // Ignore storage error
    }
  }, [storagePrefix]);

  // Sync back to localStorage
  const syncBookmarks = useCallback((newB) => {
    setBookmarks(newB);
    try {
      localStorage.setItem(`${storagePrefix}bookmarks`, JSON.stringify(newB));
    } catch {
      // Storage error
    }
  }, [storagePrefix]);

  const syncReadingStatus = useCallback((newStatus) => {
    setReadingStatus(newStatus);
    try {
      localStorage.setItem(`${storagePrefix}reading_status`, JSON.stringify(newStatus));
    } catch {
      // Storage error
    }
  }, [storagePrefix]);

  const syncCollections = useCallback((newCols) => {
    setCollections(newCols);
    try {
      localStorage.setItem(`${storagePrefix}collections`, JSON.stringify(newCols));
    } catch {
      // Storage error
    }
  }, [storagePrefix]);

  const toggleBookmark = useCallback((paper) => {
    if (!paper?.id) return;
    const exists = bookmarks.some((p) => (typeof p === 'string' ? p === paper.id : p.id === paper.id));
    if (exists) {
      const next = bookmarks.filter((p) => (typeof p === 'string' ? p !== paper.id : p.id !== paper.id));
      syncBookmarks(next);
      info('Removed from Library', `"${paper.title?.slice(0, 40)}..." was removed from bookmarks.`);
    } else {
      const itemToSave = {
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        abstract: paper.abstract,
        arxiv_id: paper.arxiv_id,
        file_size_bytes: paper.file_size_bytes,
        uploaded_at: paper.uploaded_at,
        bookmarkedAt: new Date().toISOString(),
      };
      const next = [itemToSave, ...bookmarks];
      syncBookmarks(next);
      success('Saved to Library', `"${paper.title?.slice(0, 40)}..." was saved to your bookmarks.`);
    }
  }, [bookmarks, syncBookmarks, success, info]);

  const isBookmarked = useCallback((paperId) => {
    return bookmarks.some((p) => (typeof p === 'string' ? p === paperId : p.id === paperId));
  }, [bookmarks]);

  const setPaperStatus = useCallback((paperId, status) => {
    const next = { ...readingStatus, [paperId]: status };
    if (!status) delete next[paperId];
    syncReadingStatus(next);
  }, [readingStatus, syncReadingStatus]);

  const createCollection = useCallback((name, description = '', isPublic = false) => {
    const newCol = {
      id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      description: description.trim(),
      isPublic,
      paperIds: [],
      createdAt: new Date().toISOString(),
    };
    syncCollections([...collections, newCol]);
    success('Collection Created', `Collection "${name}" has been created.`);
    return newCol;
  }, [collections, syncCollections, success]);

  const deleteCollection = useCallback((colId) => {
    const next = collections.filter((c) => c.id !== colId);
    syncCollections(next);
    info('Collection Deleted', 'The collection was removed.');
  }, [collections, syncCollections, info]);

  const togglePaperInCollection = useCallback((colId, paperId) => {
    const next = collections.map((col) => {
      if (col.id !== colId) return col;
      const has = col.paperIds.includes(paperId);
      const updatedIds = has ? col.paperIds.filter((id) => id !== paperId) : [...col.paperIds, paperId];
      return { ...col, paperIds: updatedIds };
    });
    syncCollections(next);
  }, [collections, syncCollections]);

  return (
    <LibraryContext.Provider
      value={{
        bookmarks,
        readingStatus,
        collections,
        toggleBookmark,
        isBookmarked,
        setPaperStatus,
        createCollection,
        deleteCollection,
        togglePaperInCollection,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useLibrary = () => {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
};
