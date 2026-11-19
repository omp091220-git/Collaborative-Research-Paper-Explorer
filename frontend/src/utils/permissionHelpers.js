/**
 * permissionHelpers.js
 * Comprehensive paper permission and access request resolution helpers.
 */

/**
 * Calculates eligibility and button states for requesting paper access.
 *
 * @param {object} params
 * @param {object} params.paper - Paper data
 * @param {object} params.user - Current user from AuthContext
 * @param {boolean} [params.isRestrictedPrivate=false] - Whether paper is private and access was denied (403)
 * @param {object|null} [params.pendingRequest=null] - Any existing pending request for this user on this paper
 *
 * @returns {object} {
 *   canRequest: boolean,
 *   isOwner: boolean,
 *   isStudent: boolean,
 *   isPending: boolean,
 *   pendingPermission: string|null,
 *   currentPermission: string|null,
 *   targetPermission: string|null,
 *   eligiblePermissions: string[],
 *   buttonLabel: string,
 *   reasonNotice: string|null,
 *   badgeLabel: string|null,
 * }
 */
export function getAccessRequestState({
  paper,
  user,
  isRestrictedPrivate = false,
  pendingRequest = null,
}) {
  const isSysAdmin =
    user?.role === 'SYSTEM_ADMIN' ||
    user?.role === 'SYSTEM ADMIN' ||
    user?.role === 'ADMIN';

  const isOwner = Boolean(
    isSysAdmin ||
      paper?.is_owner ||
      (user?.id && paper?.uploader_id && user.id === paper.uploader_id)
  );

  // Owners and Platform Admins never see Request Access
  if (isOwner) {
    return {
      canRequest: false,
      isOwner: true,
      isStudent: false,
      isPending: false,
      pendingPermission: null,
      currentPermission: 'OWNER',
      targetPermission: null,
      eligiblePermissions: [],
      buttonLabel: '',
      reasonNotice: null,
      badgeLabel: isSysAdmin ? 'SYSTEM ADMIN' : 'OWNER',
    };
  }

  const isStudent = user?.role === 'STUDENT';
  const isPrivate = Boolean(
    isRestrictedPrivate ||
      paper?.visibility === 'PRIVATE' ||
      paper?.is_private
  );

  // Active pending request on this paper
  const activePending =
    pendingRequest || paper?.pending_request || null;
  const isPending = Boolean(activePending && activePending.status === 'PENDING');
  const pendingPermission = isPending ? activePending.requested_permission : null;

  // Determine user's current effective permission
  let currentPermission = paper?.user_permission;
  if (!currentPermission) {
    if (isPrivate && isRestrictedPrivate) {
      currentPermission = null;
    } else if (!isPrivate) {
      currentPermission = 'VIEW';
    }
  }

  // Normalize: if backend gave permissions object
  if (!currentPermission && paper?.permissions) {
    if (paper.permissions.canManage) currentPermission = 'OWNER';
    else if (paper.permissions.canEdit) currentPermission = 'EDIT';
    else if (paper.permissions.canAnnotate || paper.permissions.canComment)
      currentPermission = 'ANNOTATE';
    else if (paper.permissions.canView) currentPermission = 'VIEW';
  }

  // ─── CASE 1: Private Paper — User has NO View Access (Unauthorized) ─────────
  if (isPrivate && (!currentPermission || isRestrictedPrivate)) {
    return {
      canRequest: !isPending,
      isOwner: false,
      isStudent,
      isPending,
      pendingPermission,
      currentPermission: null,
      targetPermission: 'VIEW',
      eligiblePermissions: ['VIEW'],
      buttonLabel: isPending
        ? `Pending ${pendingPermission} Approval`
        : 'Request Access (VIEW)',
      reasonNotice: isPending
        ? `You have an active request for ${pendingPermission} access awaiting owner approval.`
        : 'This paper is private. Request VIEW access to read the paper.',
      badgeLabel: null,
    };
  }

  // ─── CASE 2: Student Account on an Accessible Paper (Public or Permitted Private) ──
  // Students can view, but cannot request ANNOTATE or EDIT
  if (isStudent) {
    return {
      canRequest: false,
      isOwner: false,
      isStudent: true,
      isPending: false,
      pendingPermission: null,
      currentPermission: currentPermission || 'VIEW',
      targetPermission: null,
      eligiblePermissions: [],
      buttonLabel: '',
      reasonNotice:
        'Student accounts have read-only viewing access and cannot request annotation or editing permissions.',
      badgeLabel: 'VIEW ONLY (STUDENT)',
    };
  }

  // ─── CASE 3: Researcher with VIEW Permission (Needs ANNOTATE or EDIT) ────────
  if (currentPermission === 'VIEW') {
    return {
      canRequest: !isPending,
      isOwner: false,
      isStudent: false,
      isPending,
      pendingPermission,
      currentPermission: 'VIEW',
      targetPermission: 'ANNOTATE',
      eligiblePermissions: ['ANNOTATE', 'EDIT'],
      buttonLabel: isPending
        ? `Pending ${pendingPermission} Approval`
        : 'Request Access (ANNOTATE)',
      reasonNotice: isPending
        ? `You have an active request for ${pendingPermission} access awaiting owner approval.`
        : 'You currently have read-only access. Request ANNOTATE or EDIT permission to collaborate.',
      badgeLabel: 'VIEW ONLY',
    };
  }

  // ─── CASE 4: Researcher with ANNOTATE Permission (Can Request EDIT) ──────────
  if (
    currentPermission === 'ANNOTATE' ||
    (paper?.permissions?.canAnnotate && !paper?.permissions?.canEdit)
  ) {
    return {
      canRequest: !isPending,
      isOwner: false,
      isStudent: false,
      isPending,
      pendingPermission,
      currentPermission: 'ANNOTATE',
      targetPermission: 'EDIT',
      eligiblePermissions: ['EDIT'],
      buttonLabel: isPending
        ? `Pending ${pendingPermission} Approval`
        : 'Request EDIT Access',
      reasonNotice: isPending
        ? `You have an active request for ${pendingPermission} access awaiting owner approval.`
        : 'You can annotate. Request EDIT permission for full collaborative tag and metadata control.',
      badgeLabel: 'ANNOTATE',
    };
  }

  // ─── CASE 5: Researcher already has EDIT Permission ─────────────────────────
  return {
    canRequest: false,
    isOwner: false,
    isStudent: false,
    isPending: false,
    pendingPermission: null,
    currentPermission: currentPermission || 'EDIT',
    targetPermission: null,
    eligiblePermissions: [],
    buttonLabel: '',
    reasonNotice: null,
    badgeLabel: 'EDIT ACCESS',
  };
}
