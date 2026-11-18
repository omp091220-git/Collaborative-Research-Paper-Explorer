import { useAuth } from '../context/AuthContext';

/**
 * Derives all effective capabilities for a user on a specific paper.
 * Considers both the global user role (STUDENT, RESEARCHER, SYSTEM_ADMIN)
 * and the paper-specific effective permission (VIEW, ANNOTATE, EDIT, OWNER).
 *
 * @param {object|null} paper - The paper object from the API (may be null)
 * @returns {object} Derived permission flags
 */
export function usePaperPermissions(paper) {
  const { user, isAdmin, isStudent, isResearcher } = useAuth();

  if (!user || !paper) {
    return {
      canViewPaper: false,
      canReadPdf: false,
      canAnnotate: false,
      canEditPaper: false,
      canManageTags: false,
      canManageCollaborators: false,
      canChangeVisibility: false,
      canDeletePaper: false,
      canCreateDiscussion: false,
      canReplyToDiscussion: false,
      canManageDiscussion: false,
      canModerateDiscussion: false,
      canRequestViewAccess: false,
      canRequestAnnotateAccess: false,
      canRequestEditAccess: false,
      isOwner: false,
      isStudent: Boolean(isStudent),
      isAdmin: Boolean(isAdmin),
      effectivePermission: null,
      isReadOnly: true,
    };
  }

  const effectivePermission = paper.user_permission || null;
  const isOwner = Boolean(
    isAdmin ||
    paper.is_owner ||
    (user.id && paper.uploader_id && user.id === paper.uploader_id)
  );

  // STUDENTS are ALWAYS strictly read-only on the paper content itself
  if (isStudent) {
    const hasViewAccess =
      paper.visibility === 'PUBLIC' ||
      effectivePermission === 'VIEW' ||
      effectivePermission === 'ANNOTATE' ||
      effectivePermission === 'EDIT' ||
      effectivePermission === 'OWNER';

    return {
      canViewPaper: hasViewAccess,
      canReadPdf: hasViewAccess,
      canAnnotate: false,
      canEditPaper: false,
      canManageTags: false,
      canManageCollaborators: false,
      canChangeVisibility: false,
      canDeletePaper: false,
      canCreateDiscussion: false,
      canReplyToDiscussion: false,
      canManageDiscussion: false,
      canModerateDiscussion: false,
      canRequestViewAccess: paper.visibility === 'PRIVATE' && !hasViewAccess,
      canRequestAnnotateAccess: false,
      canRequestEditAccess: false,
      isOwner: false, // Students can never claim paper ownership
      isStudent: true,
      isAdmin: false,
      effectivePermission: hasViewAccess ? 'VIEW' : null,
      isReadOnly: true,
    };
  }

  // SYSTEM_ADMIN has platform-wide full privileges
  if (isAdmin) {
    return {
      canViewPaper: true,
      canReadPdf: true,
      canAnnotate: true,
      canEditPaper: true,
      canManageTags: true,
      canManageCollaborators: true,
      canChangeVisibility: true,
      canDeletePaper: true,
      canCreateDiscussion: true,
      canReplyToDiscussion: true,
      canManageDiscussion: true,
      canModerateDiscussion: true,
      canRequestViewAccess: false,
      canRequestAnnotateAccess: false,
      canRequestEditAccess: false,
      isOwner: true,
      isStudent: false,
      isAdmin: true,
      effectivePermission: 'OWNER',
      isReadOnly: false,
    };
  }

  // RESEARCHER role
  const hasViewAccess =
    paper.visibility === 'PUBLIC' ||
    isOwner ||
    effectivePermission === 'VIEW' ||
    effectivePermission === 'ANNOTATE' ||
    effectivePermission === 'EDIT' ||
    effectivePermission === 'OWNER';

  const canAnnotate =
    isOwner ||
    effectivePermission === 'ANNOTATE' ||
    effectivePermission === 'EDIT' ||
    effectivePermission === 'OWNER';

  const canEdit =
    isOwner ||
    effectivePermission === 'EDIT' ||
    effectivePermission === 'OWNER';

  return {
    canViewPaper: hasViewAccess,
    canReadPdf: hasViewAccess,
    canAnnotate: hasViewAccess && canAnnotate,
    canEditPaper: hasViewAccess && canEdit,
    canManageTags: hasViewAccess && (canEdit || isOwner),
    canManageCollaborators: isOwner,
    canChangeVisibility: isOwner,
    canDeletePaper: isOwner,
    canCreateDiscussion: hasViewAccess && canAnnotate,
    canReplyToDiscussion: hasViewAccess && canAnnotate,
    canManageDiscussion: isOwner,
    canModerateDiscussion: isOwner,
    canRequestViewAccess: paper.visibility === 'PRIVATE' && !hasViewAccess,
    canRequestAnnotateAccess: hasViewAccess && !canAnnotate && isResearcher,
    canRequestEditAccess: hasViewAccess && canAnnotate && !canEdit && isResearcher,
    isOwner,
    isStudent: false,
    isAdmin: false,
    effectivePermission,
    isReadOnly: !canAnnotate,
  };
}
