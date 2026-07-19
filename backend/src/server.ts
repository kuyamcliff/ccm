import express from "express";
import cookieParser from "cookie-parser";
import { attachUser } from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { reservationsRouter } from "./routes/reservations.js";
import { reviewsRouter } from "./routes/reviews.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(express.json());
app.use(cookieParser());
app.use(attachUser);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/reviews", reviewsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Something broke on our side. Try again." });
  }
);

app.listen(PORT, () => {
  console.log(`Camchop backend listening on http://localhost:${PORT}`);
});
