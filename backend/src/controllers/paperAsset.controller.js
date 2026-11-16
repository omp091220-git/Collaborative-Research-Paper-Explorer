/**
 * paperAsset.controller.js
 *
 * Controller layer for paper visual asset endpoints and extraction job status/re-extraction.
 */

import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import * as paperAssetService from "../services/paperAsset.service.js";
import { PaperAssetError } from "../services/paperAsset.service.js";

/**
 * Factory to create controller handlers with injected service (for testing).
 * @param {object} service - Service implementation exposing required methods.
 * @returns {{listAssets:Function,getAsset:Function,getExtractionStatus:Function,requestExtraction:Function}}
 */
function createControllers(service) {
  return {
    /**
     * GET /api/papers/:paperId/assets
     */
    async listAssets(req, res, next) {
      try {
        const { paperId } = req.params;
        const { asset_type } = req.query;
        const result = await service.getActiveAssets(paperId, { assetType: asset_type });
        return res.status(200).json(result);
      } catch (error) {
        if (error instanceof PaperAssetError) {
          return res.status(error.statusCode).json({ error: error.message });
        }
        return next(error);
      }
    },

    /**
     * GET /api/papers/:paperId/assets/:assetId
     */
    async getAsset(req, res, next) {
      try {
        const { paperId, assetId } = req.params;
        const { asset, filePath } = await service.getAssetBinary(paperId, assetId);
        // MIME whitelist
        const allowedMimes = ["image/png", "image/jpeg", "image/webp"];
        const mime = asset.mime_type;
        if (!allowedMimes.includes(mime)) {
          const err = new PaperAssetError("Asset MIME type not allowed.", 500);
          throw err;
        }
        res.setHeader("Content-Type", mime);
        if (asset.file_size_bytes) {
          res.setHeader("Content-Length", asset.file_size_bytes);
        }
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        await pipeline(fs.createReadStream(filePath), res);
      } catch (error) {
        if (error instanceof PaperAssetError) {
          return res.status(error.statusCode).json({ error: error.message });
        }
        if (!res.headersSent) {
          return next(error);
        }
        res.destroy();
      }
    },

    /**
     * GET /api/papers/:paperId/extraction-status
     */
    async getExtractionStatus(req, res, next) {
      try {
        const { paperId } = req.params;
        const result = await service.getExtractionStatus(paperId);
        return res.status(200).json(result);
      } catch (error) {
        if (error instanceof PaperAssetError) {
          return res.status(error.statusCode).json({ error: error.message });
        }
        return next(error);
      }
    },

    /**
     * POST /api/papers/:paperId/extract
     */
    async requestExtraction(req, res, next) {
      try {
        const { paperId } = req.params;
        const { job, alreadyExists } = await service.requestExtraction(paperId);
        return res.status(alreadyExists ? 200 : 202).json({ job });
      } catch (error) {
        if (error instanceof PaperAssetError) {
          return res.status(error.statusCode).json({ error: error.message });
        }
        return next(error);
      }
    },
  };
}

// Production handlers using the real service
const {
  listAssets,
  getAsset,
  getExtractionStatus,
  requestExtraction,
} = createControllers(paperAssetService);

export { listAssets, getAsset, getExtractionStatus, requestExtraction };
export { createControllers as createPaperAssetController };
