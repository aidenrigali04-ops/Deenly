const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "deenly-backend",
    timestamp: new Date().toISOString()
  });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "Deenly backend is running",
    docs: "Start building API routes under /api"
  });
});

app.listen(port, () => {
  console.log(`Deenly backend listening on port ${port}`);
});
