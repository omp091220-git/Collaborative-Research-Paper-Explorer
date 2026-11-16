import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api, { getApiErrorMessage } from '../../services/api';
import papersService from '../../services/papers.service';
import annotationsService from '../../services/annotations.service';
import tagsService from '../../services/tags.service';
import paperTagsService from '../../services/paperTags.service';

import LeftSidebar from './LeftSidebar';
import PdfReader from './PdfReader';
import PdfToolbar from './PdfToolbar';
import RightSidebar from './RightSidebar';
import CreateAnnotationModal from './CreateAnnotationModal';
import TagSelectorModal from './TagSelectorModal';
import TagFormModal from '../tags/TagFormModal';
import ErrorBoundary from '../common/ErrorBoundary';

export default function ResearchWorkspace({
  paperId: initialPaperId,
  paper: initialPaper,
  pdfUrl,
  className = '',
  onSelectPaper: onSelectPaperProp,
}) {
  const { user, isAdmin, isResearcher } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const urlPageParam = parseInt(searchParams.get('page'), 10);
  const urlAnnotationIdParam = searchParams.get('annotationId');

  const canManageTaxonomy = isAdmin || isResearcher;

  // ── 0. Active Paper State ──────────────────────────────────────────────────
  const [currentPaperId, setCurrentPaperId] = useState(initialPaperId || initialPaper?.id || null);
  const [currentPaper, setCurrentPaper] = useState(initialPaper || null);

  // Synchronize when parent prop paperId or initialPaper changes
  useEffect(() => {
    if (initialPaperId && initialPaperId !== currentPaperId) {
      setCurrentPaperId(initialPaperId);
    }
  }, [initialPaperId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialPaper && initialPaper.id === currentPaperId) {
      setCurrentPaper(initialPaper);
    }
  }, [initialPaper, currentPaperId]);

  // If we only have paperId but no full paper object, fetch paper details
  useEffect(() => {
    let active = true;
    if (currentPaperId && (!currentPaper || currentPaper.id !== currentPaperId)) {
      papersService
        .getPaperById(currentPaperId)
        .then((p) => {
          if (active && p) setCurrentPaper(p);
        })
        .catch((err) => {
          console.warn('Failed to load active paper metadata:', err);
        });
    }
    return () => {
      active = false;
    };
  }, [currentPaperId, currentPaper]);

  // ── Library Papers for Fast Switching in Left Sidebar ──────────────────────
  const [libraryPapers, setLibraryPapers] = useState([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  const fetchLibraryPapers = useCallback(async () => {
    setLoadingLibrary(true);
    try {
      const res = await papersService.getPapers({ limit: 100 });
      const list = res.papers || res.data || (Array.isArray(res) ? res : []);
      setLibraryPapers(list);
    } catch (err) {
      console.warn('Failed to load library papers:', err);
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    fetchLibraryPapers();
  }, [fetchLibraryPapers]);

  // ── 1. PDF Document Stream & Loading State ────────────────────────────────
  const [blobUrl, setBlobUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState(null);

  // ── 2. PDF Viewer Controls State ──────────────────────────────────────────
  const [activePage, setActivePage] = useState(
    !isNaN(urlPageParam) && urlPageParam >= 1 ? urlPageParam : 1
  );
  const [numPages, setNumPages] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [continuousMode, setContinuousMode] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // ── 3. Annotations & Highlights State ─────────────────────────────────────
  const [annotations, setAnnotations] = useState([]);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = useState(urlAnnotationIdParam || null);

  // Sync state when URL params change (e.g. clicking a paragraph in Paragraph Explorer)
  useEffect(() => {
    if (urlAnnotationIdParam) {
      setActiveAnnotationId(urlAnnotationIdParam);
    }
    if (!isNaN(urlPageParam) && urlPageParam >= 1) {
      setActivePage(urlPageParam);
    }
  }, [urlAnnotationIdParam, urlPageParam]);

  // ── 4. FR-10 Topic Hierarchy & FR-11 Tag Assignments State ─────────────────
  const [tagTree, setTagTree] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [paperAssignments, setPaperAssignments] = useState([]);
  const [selectedTagId, setSelectedTagId] = useState(null);

  // ── 5. Sidebar Layout & Collapsible State ──────────────────────────────────
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [rightSidebarTab, setRightSidebarTab] = useState('paragraphs'); // 'annotations' | 'topics' | 'paragraphs'

  // ── FR-15: Split-Pane Resizable Width State ──────────────────────────────
  const [splitWidth, setSplitWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('crpe_reader_split_width');
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 280 && parsed <= 1200) return parsed;
    } catch (_) {}
    return 420; // default comfortable split width
  });
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const handleSetSplitRatio = useCallback((ratio) => {
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const newWidth = Math.round(windowWidth * ratio);
    const minWidth = 280;
    const maxWidth = Math.floor(windowWidth * 0.65);
    const clamped = Math.min(maxWidth, Math.max(minWidth, newWidth));
    setSplitWidth(clamped);
    try {
      localStorage.setItem('crpe_reader_split_width', String(clamped));
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!isDraggingSplit) return;

    const handleMouseMove = (e) => {
      const windowWidth = window.innerWidth;
      const newWidth = windowWidth - e.clientX;
      const minWidth = 280;
      const maxWidth = Math.floor(windowWidth * 0.65);
      const clamped = Math.min(maxWidth, Math.max(minWidth, newWidth));
      setSplitWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsDraggingSplit(false);
      try {
        localStorage.setItem('crpe_reader_split_width', String(splitWidth));
      } catch (_) {}
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSplit, splitWidth]);

  // ── 6. Modals & Dialogs State ─────────────────────────────────────────────
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [activeSelectionForModal, setActiveSelectionForModal] = useState(null);
  const [annotationToEdit, setAnnotationToEdit] = useState(null);

  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const [tagSelectorTarget, setTagSelectorTarget] = useState(null); // { type: 'paper' | 'annotation' | 'selection', item?: any }

  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [topicModalMode, setTopicModalMode] = useState('create');
  const [topicModalParent, setTopicModalParent] = useState(null);
  const [topicModalTagToEdit, setTopicModalTagToEdit] = useState(null);

  // Keep ref to current blob URL to avoid memory leaks on workspace unmount
  const blobUrlRef = useRef(null);
  useEffect(() => {
    blobUrlRef.current = blobUrl;
  }, [blobUrl]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  // ── 7. Fetch PDF Blob via Authenticated Streaming ─────────────────────────
  const activeFetchPaperIdRef = useRef(null);

  const loadPdfDocument = useCallback(async () => {
    if (!currentPaperId) return;

    activeFetchPaperIdRef.current = currentPaperId;
    setPdfLoading(true);
    setPdfError(null);

    const targetEndpoint = `/papers/${currentPaperId}/pdf`;

    try {
      const response = await api.get(targetEndpoint, {
        responseType: 'blob',
      });

      // Guard against stale requests if paperId switched mid-flight
      if (activeFetchPaperIdRef.current !== currentPaperId) return;

      if (response.data && response.data.size > 0) {
        const objectUrl = URL.createObjectURL(response.data);
        setBlobUrl((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return objectUrl;
        });
        setPdfLoading(false);
        return;
      }
      throw new Error('Received empty PDF stream from server.');
    } catch (err) {
      if (activeFetchPaperIdRef.current !== currentPaperId) return;

      console.error('PDF stream load error:', err);
      const status = err.response?.status;
      if (status === 401) {
        setPdfError('Authentication required to view this research paper. Please log in.');
      } else if (status === 403) {
        setPdfError('You do not have permission to view this research paper.');
      } else if (status === 404) {
        setPdfError('PDF document file is not found on server.');
      } else {
        setPdfError(getApiErrorMessage(err, 'Failed to stream and render research PDF.'));
      }
      setPdfLoading(false);
    }
  }, [currentPaperId]);

  useEffect(() => {
    loadPdfDocument();
  }, [loadPdfDocument]);

  // ── 8. Fetch Annotations for this Paper ───────────────────────────────────
  const fetchAnnotations = useCallback(async () => {
    if (!currentPaperId) return;
    setLoadingAnnotations(true);
    try {
      const list = await annotationsService.getAnnotations(currentPaperId);
      setAnnotations(list || []);
    } catch (err) {
      console.error('Failed to load annotations:', err);
    } finally {
      setLoadingAnnotations(false);
    }
  }, [currentPaperId]);

  useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations]);

  // ── 9. Fetch FR-10 Topic Tree and FR-11 Tag Assignments ────────────────────
  const fetchTaxonomyAndAssignments = useCallback(async () => {
    if (!currentPaperId) return;
    try {
      const [treeRes, assignRes] = await Promise.allSettled([
        tagsService.getTagTree(),
        paperTagsService.getAssignmentsForPaper(currentPaperId),
      ]);

      if (treeRes.status === 'fulfilled') {
        const tree = treeRes.value || [];
        setTagTree(tree);

        // Flatten tree into allTags list with depth and canonical paths
        const flat = [];
        const walk = (nodes, currentPath = '', depth = 0) => {
          for (const node of nodes) {
            const fullPath =
              node.canonicalPath ||
              node.canonical_path ||
              (currentPath ? `${currentPath}::${node.slug}` : node.slug);
            flat.push({
              ...node,
              canonicalPath: fullPath,
              depth,
            });
            if (node.children && node.children.length > 0) {
              walk(node.children, fullPath, depth + 1);
            }
          }
        };
        walk(tree);
        setAllTags(flat);
      }

      if (assignRes.status === 'fulfilled') {
        setPaperAssignments(assignRes.value.assignments || []);
      }
    } catch (err) {
      console.error('Failed to load taxonomy/assignments:', err);
    }
  }, [currentPaperId]);

  useEffect(() => {
    fetchTaxonomyAndAssignments();
  }, [fetchTaxonomyAndAssignments]);

  // ── 10. Fast Paper Switching Handler ───────────────────────────────────────
  const handleSwitchPaper = useCallback((newPaper) => {
    if (!newPaper?.id || newPaper.id === currentPaperId) return;

    // Reset paper-specific state cleanly
    setActivePage(1);
    setAnnotations([]);
    setPaperAssignments([]);
    setActiveAnnotationId(null);
    setSearchQuery('');
    setSearchResults([]);
    setCurrentMatchIndex(0);
    setActiveSelectionForModal(null);

    // Revoke old blob URL
    setBlobUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
    setPdfLoading(true);
    setPdfError(null);

    setCurrentPaperId(newPaper.id);
    setCurrentPaper(newPaper);

    if (onSelectPaperProp) {
      onSelectPaperProp(newPaper);
    } else {
      navigate(`/papers/${newPaper.id}?tab=pdf`, { replace: true });
    }
  }, [currentPaperId, onSelectPaperProp, navigate]);

  // ── 11. Annotation & Highlight Handlers ───────────────────────────────────
  const handleQuickHighlight = useCallback(async (selectionData) => {
    try {
      const payload = {
        paper_id: currentPaperId,
        page_number: selectionData.pageNumber,
        content: `Highlight: "${selectionData.text}"`,
        position_x: selectionData.position_x,
        position_y: selectionData.position_y,
        region_width: selectionData.region_width,
        region_height: selectionData.region_height,
      };

      const res = await annotationsService.createAnnotation(payload);
      addToast({
        type: 'success',
        title: 'Highlight Created',
        message: `Saved text highlight on page ${selectionData.pageNumber}.`,
      });
      await fetchAnnotations();
      if (res.annotation?.id) {
        setActiveAnnotationId(res.annotation.id);
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Highlight Failed',
        message: getApiErrorMessage(err, 'Failed to save highlight.'),
      });
    }
  }, [currentPaperId, addToast, fetchAnnotations]);

  const handleAnnotateSelection = useCallback((selectionData) => {
    setActiveSelectionForModal(selectionData);
    setAnnotationToEdit(null);
    setAnnotationModalOpen(true);
  }, []);

  const handleAssignTagSelection = useCallback((selectionData) => {
    setTagSelectorTarget({
      type: 'selection',
      item: selectionData,
    });
    setTagSelectorOpen(true);
  }, []);

  // Save Annotation (Create or Update)
  const handleSaveAnnotation = useCallback(async (payload) => {
    try {
      if (annotationToEdit) {
        await annotationsService.updateAnnotation(annotationToEdit.id, {
          page_number: payload.page_number,
          content: payload.content,
        });
        addToast({
          type: 'success',
          title: 'Annotation Updated',
          message: 'Your research note was saved.',
        });
      } else {
        const createPayload = {
          paper_id: currentPaperId,
          page_number: payload.page_number,
          content: payload.content,
          position_x: payload.position_x,
          position_y: payload.position_y,
          region_width: payload.region_width,
          region_height: payload.region_height,
        };

        const res = await annotationsService.createAnnotation(createPayload);
        const newAnnotation = res.annotation || res;

        // If an FR-10 topic tag was selected, immediately assign it
        if (payload.tag_id && newAnnotation?.id) {
          try {
            await paperTagsService.createAssignment({
              paper_id: currentPaperId,
              tag_id: payload.tag_id,
              annotation_id: newAnnotation.id,
            });
            await fetchTaxonomyAndAssignments();
          } catch (tagErr) {
            console.error('Failed to link topic tag:', tagErr);
          }
        }

        addToast({
          type: 'success',
          title: 'Annotation Created',
          message: `Saved research annotation on page ${payload.page_number}.`,
        });

        if (newAnnotation?.id) {
          setActiveAnnotationId(newAnnotation.id);
        }
      }

      setAnnotationModalOpen(false);
      setAnnotationToEdit(null);
      setActiveSelectionForModal(null);
      await fetchAnnotations();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: getApiErrorMessage(err, 'Failed to save annotation.'),
      });
    }
  }, [annotationToEdit, currentPaperId, addToast, fetchTaxonomyAndAssignments, fetchAnnotations]);

  const handleDeleteAnnotation = useCallback(async (annotationId) => {
    try {
      await annotationsService.deleteAnnotation(annotationId);
      addToast({
        type: 'info',
        title: 'Annotation Removed',
        message: 'The annotation was deleted from the paper.',
      });
      setActiveAnnotationId((prev) => (prev === annotationId ? null : prev));
      await fetchAnnotations();
      await fetchTaxonomyAndAssignments();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        message: getApiErrorMessage(err, 'Failed to delete annotation.'),
      });
    }
  }, [addToast, fetchAnnotations, fetchTaxonomyAndAssignments]);

  const handleEditAnnotation = useCallback((ann) => {
    setAnnotationToEdit(ann);
    setActiveSelectionForModal(null);
    setAnnotationModalOpen(true);
  }, []);

  // Jump to Annotation
  const handleSelectAnnotation = useCallback((ann) => {
    setActiveAnnotationId(ann.id);
    if (ann.page_number) {
      setActivePage(ann.page_number);
    }
    // If the annotation has tags, open Paragraphs tab, else Notes tab
    const hasTags = paperAssignments.some((a) => a.annotation_id === ann.id);
    setRightSidebarTab(hasTags ? 'paragraphs' : 'annotations');
    setRightSidebarCollapsed(false);
  }, [paperAssignments]);

  // ── 12. FR-11 Multi-Tag Assignment Operations ──────────────────────────────
  const handleOpenTagPickerForPaper = useCallback(() => {
    setTagSelectorTarget({ type: 'paper' });
    setTagSelectorOpen(true);
  }, []);

  const handleOpenTagPickerForAnnotation = useCallback((ann) => {
    setTagSelectorTarget({ type: 'annotation', item: ann });
    setTagSelectorOpen(true);
  }, []);

  // Assign Tags selected from Picker (supports multi-tag array or single tag)
  const handleSelectTagFromPicker = useCallback(async (selectedTagsInput) => {
    try {
      const tags = Array.isArray(selectedTagsInput) ? selectedTagsInput : [selectedTagsInput];
      if (tags.length === 0) return;

      if (tagSelectorTarget?.type === 'paper') {
        for (const tag of tags) {
          await paperTagsService.createAssignment({
            paper_id: currentPaperId,
            tag_id: tag.id,
            annotation_id: null,
          });
        }
        addToast({
          type: 'success',
          title: 'Topic Tags Assigned',
          message: `Assigned ${tags.length} topic tag(s) to paper.`,
        });
        setRightSidebarTab('topics');
      } else if (tagSelectorTarget?.type === 'annotation') {
        const ann = tagSelectorTarget.item;
        for (const tag of tags) {
          await paperTagsService.createAssignment({
            paper_id: currentPaperId,
            tag_id: tag.id,
            annotation_id: ann.id,
          });
        }
        addToast({
          type: 'success',
          title: 'Paragraph Tags Assigned',
          message: `Assigned ${tags.length} topic tag(s) to paragraph on page ${ann.page_number}.`,
        });
        setRightSidebarTab('paragraphs');
      } else if (tagSelectorTarget?.type === 'selection') {
        const sel = tagSelectorTarget.item;
        // 1. Automatically create annotation if one does not exist
        const res = await annotationsService.createAnnotation({
          paper_id: currentPaperId,
          page_number: sel.pageNumber,
          content: sel.text,
          position_x: sel.position_x,
          position_y: sel.position_y,
          region_width: sel.region_width,
          region_height: sel.region_height,
        });

        const newAnnotation = res.annotation || res;

        // 2. Assign all selected tags to the newly created annotation
        if (newAnnotation?.id) {
          for (const tag of tags) {
            await paperTagsService.createAssignment({
              paper_id: currentPaperId,
              tag_id: tag.id,
              annotation_id: newAnnotation.id,
            });
          }
          setActiveAnnotationId(newAnnotation.id);
        }

        addToast({
          type: 'success',
          title: 'Paragraph Tagged',
          message: `Tagged paragraph on page ${sel.pageNumber} with ${tags.map((t) => t.name).join(', ')}.`,
        });

        setRightSidebarTab('paragraphs');
        await fetchAnnotations();
      }

      setTagSelectorOpen(false);
      setTagSelectorTarget(null);
      await fetchTaxonomyAndAssignments();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Assignment Failed',
        message: getApiErrorMessage(err, 'Failed to assign topic tags.'),
      });
    }
  }, [tagSelectorTarget, currentPaperId, addToast, fetchAnnotations, fetchTaxonomyAndAssignments]);

  // Remove Tag Assignment
  const handleRemoveAssignment = useCallback(async (assignmentId) => {
    try {
      await paperTagsService.deleteAssignment(assignmentId);
      addToast({
        type: 'info',
        title: 'Tag Removed',
        message: 'Topic tag assignment removed.',
      });
      await fetchTaxonomyAndAssignments();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Removal Failed',
        message: getApiErrorMessage(err, 'Failed to remove tag assignment.'),
      });
    }
  }, [addToast, fetchTaxonomyAndAssignments]);

  // ── 13. FR-10 Topic Taxonomy Management Handlers ──────────────────────────
  const handleOpenCreateTopicModal = useCallback((parentTag = null) => {
    setTopicModalMode('create');
    setTopicModalParent(parentTag);
    setTopicModalTagToEdit(null);
    setTopicModalOpen(true);
  }, []);

  const handleOpenEditTopicModal = useCallback((tag) => {
    setTopicModalMode('edit');
    setTopicModalTagToEdit(tag);
    setTopicModalParent(null);
    setTopicModalOpen(true);
  }, []);

  const handleDeleteTopic = useCallback(async (tagId) => {
    try {
      await tagsService.deleteTag(tagId);
      addToast({
        type: 'success',
        title: 'Topic Deleted',
        message: 'The topic tag was deleted from the taxonomy.',
      });
      await fetchTaxonomyAndAssignments();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Deletion Failed',
        message: getApiErrorMessage(err, 'Child tags or active paper assignments may prevent deletion.'),
      });
    }
  }, [addToast, fetchTaxonomyAndAssignments]);

  const handleTopicSaved = useCallback(() => {
    setTopicModalOpen(false);
    fetchTaxonomyAndAssignments();
  }, [fetchTaxonomyAndAssignments]);

  // ── 14. PDF Viewer Controls ───────────────────────────────────────────────
  const handleZoomIn = () => setZoom((prev) => Math.min(250, prev + 15));
  const handleZoomOut = () => setZoom((prev) => Math.max(50, prev - 15));
  const handleResetZoom = () => setZoom(100);
  const handleFitWidth = () => setZoom(130);
  const handleFitPage = () => setZoom(90);

  const handleToggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const handleDownload = () => {
    if (blobUrl) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${currentPaper?.title || 'research_paper'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // ── 15. In-PDF Text Search Navigation ─────────────────────────────────────
  const handleSetSearchResults = useCallback((results) => {
    setSearchResults((prev) => {
      if (prev.length === 0 && results.length === 0) return prev;
      return results;
    });
    setCurrentMatchIndex(0);
  }, []);

  const handleNextSearchMatch = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(nextIdx);
    const match = searchResults[nextIdx];
    if (match?.pageNumber) setActivePage(match.pageNumber);
  }, [searchResults, currentMatchIndex]);

  const handlePrevSearchMatch = useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIndex(prevIdx);
    const match = searchResults[prevIdx];
    if (match?.pageNumber) setActivePage(match.pageNumber);
  }, [searchResults, currentMatchIndex]);

  // Computed assigned tag IDs for selector modal
  const assignedTagIdsForPicker = useMemo(() => {
    if (tagSelectorTarget?.type === 'paper') {
      return paperAssignments.filter((a) => !a.annotation_id).map((a) => a.tag_id);
    }
    if (tagSelectorTarget?.type === 'annotation' && tagSelectorTarget.item) {
      return paperAssignments
        .filter((a) => a.annotation_id === tagSelectorTarget.item.id)
        .map((a) => a.tag_id);
    }
    return [];
  }, [tagSelectorTarget, paperAssignments]);

  return (
    <div
      className={`flex flex-col bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl transition-all duration-200 ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none border-none h-screen w-screen'
          : 'h-[850px] w-full'
      } ${className}`}
    >
      {/* Three-Panel Body Container */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* LEFT PANEL: PAPER LIBRARY & NAVIGATION */}
        <ErrorBoundary compact title="Library Sidebar Error">
          <LeftSidebar
            paper={currentPaper || {}}
            papers={libraryPapers}
            loadingPapers={loadingLibrary}
            onSelectPaper={handleSwitchPaper}
            totalPages={numPages}
            paperAssignments={paperAssignments}
            annotations={annotations}
            onOpenTagPickerForPaper={handleOpenTagPickerForPaper}
            onRemovePaperTag={handleRemoveAssignment}
            onJumpToAnnotation={handleSelectAnnotation}
            activeAnnotationId={activeAnnotationId}
            isCollapsed={leftSidebarCollapsed}
            onToggleCollapse={() => setLeftSidebarCollapsed((prev) => !prev)}
            canAssignTags={canManageTaxonomy}
          />
        </ErrorBoundary>

        {/* CENTER PANEL: PDF READER (Toolbar + Viewer) */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative overflow-hidden">
          {/* PDF Toolbar */}
          <PdfToolbar
            leftSidebarCollapsed={leftSidebarCollapsed}
            onToggleLeftSidebar={() => setLeftSidebarCollapsed((prev) => !prev)}
            activePage={activePage}
            numPages={numPages}
            onPageChange={setActivePage}
            zoom={zoom}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetZoom={handleResetZoom}
            onFitWidth={handleFitWidth}
            onFitPage={handleFitPage}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchResults={searchResults}
            currentMatchIndex={currentMatchIndex}
            onNextMatch={handleNextSearchMatch}
            onPrevMatch={handlePrevSearchMatch}
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
            onDownload={handleDownload}
            continuousMode={continuousMode}
            onToggleContinuousMode={() => setContinuousMode(!continuousMode)}
            title={currentPaper?.title}
          />

          {/* PDF Pages Viewer */}
          <ErrorBoundary
            title="PDF Document Viewer Error"
            description="An error occurred while displaying the PDF pages. Click Retry below to reload the document."
          >
            <PdfReader
              blobUrl={blobUrl}
              loading={pdfLoading}
              error={pdfError}
              onRetry={loadPdfDocument}
              activePage={activePage}
              onPageChange={setActivePage}
              numPages={numPages}
              setNumPages={setNumPages}
              zoom={zoom}
              continuousMode={continuousMode}
              annotations={annotations}
              activeAnnotationId={activeAnnotationId}
              onSelectAnnotation={handleSelectAnnotation}
              onHighlightSelection={handleQuickHighlight}
              onAnnotateSelection={handleAnnotateSelection}
              onAssignTagSelection={handleAssignTagSelection}
              searchQuery={searchQuery}
              searchResults={searchResults}
              setSearchResults={handleSetSearchResults}
              currentMatchIndex={currentMatchIndex}
              setCurrentMatchIndex={setCurrentMatchIndex}
              paperTitle={currentPaper?.title}
            />
          </ErrorBoundary>
        </div>

        {/* FR-15: Interactive Draggable Split-Pane Divider */}
        {!rightSidebarCollapsed && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDraggingSplit(true);
            }}
            onDoubleClick={() => handleSetSplitRatio(0.5)}
            title="Drag to resize split panes (Double click for 50/50 split)"
            className={`w-2.5 cursor-col-resize select-none shrink-0 transition-colors z-20 flex items-center justify-center relative group ${
              isDraggingSplit
                ? 'bg-indigo-600 ring-2 ring-indigo-400'
                : 'bg-slate-900 hover:bg-indigo-600/80 border-x border-slate-800 hover:border-indigo-500'
            }`}
          >
            {/* Visual handle dots */}
            <div className="flex flex-col gap-1 items-center pointer-events-none">
              <span className={`w-0.5 h-1.5 rounded-full ${isDraggingSplit ? 'bg-white' : 'bg-slate-600 group-hover:bg-white'}`} />
              <span className={`w-0.5 h-1.5 rounded-full ${isDraggingSplit ? 'bg-white' : 'bg-slate-600 group-hover:bg-white'}`} />
              <span className={`w-0.5 h-1.5 rounded-full ${isDraggingSplit ? 'bg-white' : 'bg-slate-600 group-hover:bg-white'}`} />
            </div>
          </div>
        )}

        {/* RIGHT PANEL: RESEARCH INTELLIGENCE (Annotations, Topics, Paragraphs) */}
        <ErrorBoundary compact title="Research Intelligence Panel Error">
          <RightSidebar
            width={splitWidth}
            onSetSplitRatio={handleSetSplitRatio}
            activeTab={rightSidebarTab}
            onTabChange={setRightSidebarTab}
            isCollapsed={rightSidebarCollapsed}
            onToggleCollapse={() => setRightSidebarCollapsed((prev) => !prev)}
            annotations={annotations}
            activeAnnotationId={activeAnnotationId}
            onSelectAnnotation={handleSelectAnnotation}
            onEditAnnotation={handleEditAnnotation}
            onDeleteAnnotation={handleDeleteAnnotation}
            onOpenTagPickerForAnnotation={handleOpenTagPickerForAnnotation}
            onRemoveAnnotationTag={handleRemoveAssignment}
            onCreateManualAnnotation={() => {
              setAnnotationToEdit(null);
              setActiveSelectionForModal(null);
              setAnnotationModalOpen(true);
            }}
            // FR-10 Topic Tree props
            tagTree={tagTree}
            allTags={allTags}
            selectedTagId={selectedTagId}
            onSelectTag={(t) => setSelectedTagId(t ? t.id : null)}
            onOpenCreateTopicModal={handleOpenCreateTopicModal}
            onOpenEditTopicModal={handleOpenEditTopicModal}
            onDeleteTopic={handleDeleteTopic}
            onAssignTagToPaper={(tag) => {
              setTagSelectorTarget({ type: 'paper' });
              handleSelectTagFromPicker(tag);
            }}
            paperAssignments={paperAssignments}
            canManageTaxonomy={canManageTaxonomy}
            isAdmin={isAdmin}
          />
        </ErrorBoundary>
      </div>

      {/* MODAL 1: Create or Edit Annotation */}
      {annotationModalOpen && (
        <CreateAnnotationModal
          isOpen={annotationModalOpen}
          onClose={() => {
            setAnnotationModalOpen(false);
            setAnnotationToEdit(null);
            setActiveSelectionForModal(null);
          }}
          selectionData={activeSelectionForModal}
          annotationToEdit={annotationToEdit}
          onSave={handleSaveAnnotation}
          tagTree={tagTree}
          allTags={allTags}
        />
      )}

      {/* MODAL 2: Assign Hierarchical Topic Tags (FR-11 Multi-Tag) */}
      {tagSelectorOpen && (
        <TagSelectorModal
          isOpen={tagSelectorOpen}
          onClose={() => {
            setTagSelectorOpen(false);
            setTagSelectorTarget(null);
          }}
          tagTree={tagTree}
          allTags={allTags}
          assignedTagIds={assignedTagIdsForPicker}
          onSelectTag={handleSelectTagFromPicker}
          multiSelect={true}
          title={
            tagSelectorTarget?.type === 'paper'
              ? 'Assign Topic Tags to Paper'
              : tagSelectorTarget?.type === 'annotation'
              ? `Assign Topic Tags to Paragraph (Page ${tagSelectorTarget.item?.page_number})`
              : 'Assign Topic Tags to Paragraph Selection'
          }
          description="Select one or multiple verified hierarchical topic tags to assign."
        />
      )}

      {/* MODAL 3: Create or Edit FR-10 Topic Tag */}
      {topicModalOpen && (
        <TagFormModal
          isOpen={topicModalOpen}
          onClose={() => setTopicModalOpen(false)}
          onSaved={handleTopicSaved}
          mode={topicModalMode}
          parentTag={topicModalParent}
          tagToEdit={topicModalTagToEdit}
          allTags={allTags}
        />
      )}
    </div>
  );
}
