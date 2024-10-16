import { Server } from "http";
import mongoose from "mongoose";
import app from "./app";
import config from "./config";
import { seed } from "./app/utils/seeding";
import { socketServer } from "./socketIoServer";

let server: Server;

async function main() {
  try {
    await mongoose.connect(config.database_url as string);
    await seed();
    server = app.listen(config.port, () => {
      console.log("MongoDB connected successfully");
      console.log(`App is listening on port ${config.port}`);
    });

    socketServer(server);
  } catch (err) {
    console.log(err);
  }
}

main();

process.on("unhandledRejection", (err) => {
  console.log("Unhandled rejection detected, shutting down...", err);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
});

process.on("uncaughtException", () => {
  console.log("Uncaught exception detected, shutting down...");
  process.exit(1);
});
