import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { ROLES } from "../utils/roles.js";
import {
  getOverview,
  getStorage,
  getRedis,
  getGenAI,
  recordGenAIUsage,
} from "../controllers/adminMonitoring.controller.js";

const router = express.Router();

// Strict RBAC: All administrative monitoring endpoints require SYSTEM_ADMIN role
router.use(authenticateToken);
router.use(authorize(ROLES.SYSTEM_ADMIN));

// Overview metrics
router.get("/overview", getOverview);

// Detailed Storage Quota and Usage
router.get("/storage", getStorage);

// Detailed Redis Queue and Processing
router.get("/redis", getRedis);

// Detailed GenAI Token Consumption and API Costs
router.get("/genai", getGenAI);

// Record genuine GenAI usage
router.post("/genai/record", recordGenAIUsage);

export default router;
