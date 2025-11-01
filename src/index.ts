import { closeDatabasePool } from "./core/db.js";
import { prisma } from "./core/prisma.js";
import { startServer } from "./core/server.js";
import { logger } from "./config/logger.js";

async function main() {
  try {
    const { server, transport, httpServer } = await startServer();

    const shutdown = async (signal: NodeJS.Signals) => {
      logger.info(`Received ${signal}. Shutting down MCP server...`);

      httpServer.close();
      await transport.close();
      await server.close();
      await prisma.$disconnect();
      await closeDatabasePool();

      process.exit(0);
    };

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        shutdown(signal).catch((error) => {
          const message = error instanceof Error ? error.stack ?? error.message : String(error);
          logger.error(`Graceful shutdown failed: ${message}`);
          process.exit(1);
        });
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    logger.error(`Failed to start MCP server: ${message}`);
    await prisma.$disconnect().catch((dbError) => {
      const dbMessage = dbError instanceof Error ? dbError.message : String(dbError);
      logger.error(`Failed to disconnect Prisma client: ${dbMessage}`);
    });
    await closeDatabasePool().catch((dbError) => {
      const dbMessage = dbError instanceof Error ? dbError.message : String(dbError);
      logger.error(`Failed to close database pool: ${dbMessage}`);
    });
    process.exitCode = 1;
  }
}

void main();
