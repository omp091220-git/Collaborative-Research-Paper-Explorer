import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import annotationRoutes from "./routes/annotation.routes.js";
import authRoutes from "./routes/auth.routes.js";
import paperRoutes from "./routes/paper.routes.js";
import tagRoutes from "./routes/tag.routes.js";
import paperTagAssignmentRoutes from "./routes/paperTagAssignment.routes.js";
import collaboratorRoutes from "./routes/collaborator.routes.js";
import discussionRoutes from "./routes/discussion.routes.js";
import invitationRoutes from "./routes/invitation.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import recommendationRoutes from "./routes/recommendation.routes.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Health-check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Research Paper Explorer API is running!",
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/papers/:paperId/collaborators", collaboratorRoutes);
app.use("/api/papers/:paperId/discussions", discussionRoutes);
app.use("/api/papers", paperRoutes);
app.use("/api/annotations", annotationRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/paper-tags", paperTagAssignmentRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/recommendations", recommendationRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found.",
  });
});

// Error handler must be registered last
app.use(errorHandler);

export default app;