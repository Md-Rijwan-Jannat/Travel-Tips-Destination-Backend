/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";
import router from "./app/routes";
import notFound from "./app/middlewares/notFound";
import globalErrorHandler from "./app/middlewares/globalErrorhandler";

const app: Application = express();

// Parsers
app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://traveltipsdestinationcommunity.vercel.app",
    ],
    credentials: true, // Allow credentials to be sent
  }),
);

// Application routes
app.use("/api/v1", router);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello Travel Tips & Destination Guides");
});

// Global Error
app.use(globalErrorHandler);

//Not Found
app.use(notFound);

export default app;
