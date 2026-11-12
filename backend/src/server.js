
import "dotenv/config";

import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { closeSummaryQueue } from "./queues/summaryQueue.js";
import { createSupervisor } from "./workers/extractionSupervisor.js";

const startServer = async () => {
  try {
    await connectDatabase();

    // Start the FR-09 background extraction supervisor.
    const supervisor = createSupervisor();
    supervisor.start();

    const server = app.listen(env.port, () => {
      console.log(`Backend running on port ${env.port}`);
      console.log("FR-09 extraction supervisor started.");
    });

    let isShuttingDown = false;

    const shutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`${signal} received. Shutting down...`);

      // Stop accepting new HTTP requests.
      const serverClosed = new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      try {
        // Wait for both HTTP requests and extraction workers to finish.
        const results = await Promise.allSettled([
          serverClosed,
          supervisor.stop(),
          closeSummaryQueue(),
        ]);

        const failure = results.find(
          (result) => result.status === "rejected"
        );

        if (failure) {
          throw failure.reason;
        }

        const { default: pool } = await import("./config/database.js");
        await pool.end();

        console.log("Server and extraction supervisor stopped.");
        process.exit(0);
      } catch (error) {
        console.error("Shutdown error:", error.message);
        process.exit(1);
      }
    };

    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
