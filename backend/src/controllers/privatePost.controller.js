import service from "../services/privatePost.service.js";
const handle = (action) => async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json({ success: true, ...(await action(req)) });
  } catch (error) {
    if (error.code === "POST_RECIPIENT_NOT_FOUND")
      return res.status(404).json({ error: error.message, code: error.code });
    next(error);
  }
};
export const listAccessiblePosts = handle(async (req) =>
  service.list(req.user.id, req.query),
);
export const getAccessiblePost = handle(async (req) => ({
  post: await service.detail(req.params.id, req.user.id),
}));
export const editAccessiblePost = handle(async (req) => ({
  post: await service.edit(req.params.id, req.user.id, req.body),
}));
export const listPostPermissions = handle(async (req) => ({
  permissions: await service.permissions(req.params.id, req.user.id),
}));
export const grantPostPermission = handle(async (req) => ({
  permission: await service.grant(req.params.id, req.user.id, req.body),
}));
export const revokePostPermission = handle(async (req) =>
  service.revoke(req.params.id, req.user.id, req.params.userId),
);
