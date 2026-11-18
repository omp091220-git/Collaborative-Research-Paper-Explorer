import { Router } from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import {
  getMyAccountType,
  updateMyAccountType,
} from "../controllers/post.controller.js";

const router = Router();

// Retrieve authenticated user's account type (FR-25)
router.get("/me/account-type", authenticateToken, getMyAccountType);

// Update authenticated user's account privacy type ('PUBLIC' <-> 'PRIVATE')
router.patch("/me/account-type", authenticateToken, updateMyAccountType);

export default router;
