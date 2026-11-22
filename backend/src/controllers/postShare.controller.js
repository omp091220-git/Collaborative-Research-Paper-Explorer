import postShareService from "../services/postShare.service.js";

/**
 * Controller for FR-29: Share Posts
 */

export const getShareLink = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const result = await postShareService.getShareLink(req.params.id, req.user);
    return res.status(200).json({
      success: true,
      data: result,
      ...result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        is_private: error.is_private || false,
      });
    }
    next(error);
  }
};

export const resolveShareLink = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const identifier = req.params.token || req.params.id;
    const post = await postShareService.resolveShare(identifier, req.user);
    return res.status(200).json({
      success: true,
      post,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        is_private: error.is_private || false,
      });
    }
    next(error);
  }
};

export const shareToPlatform = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const userId = req.user?.id;
    const postId = req.params.id;
    const post = await postShareService.shareToPlatform(userId, postId, req.body || {});
    return res.status(201).json({
      success: true,
      message: "Post successfully shared to ScholarSphere.",
      post,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
};

export const getPostPreview = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const identifier = req.params.token || req.params.id;
    const preview = await postShareService.getPostPreview(identifier, req.user);
    return res.status(200).json({
      success: true,
      preview,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
};
