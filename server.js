import express from "express";
import path from "path";
import FTPClientPool from "./FTPClientPool.js";
import { PassThrough } from "stream";
import dotenv from "dotenv";

dotenv.config();
const app = express();

const HOST = process.env.VERCEL_HOST;
const USER = process.env.VERCEL_USER;
const PASSWORD = process.env.VERCEL_PASSWORD;
const PORT = process.env.VERCEL_PORT || 3000;
const ENV = process.env.VERCEL_ENV;
const ftpConfig = {
  host: HOST,
  user: USER,
  password: PASSWORD,
  secure: false,
};
const pool = new FTPClientPool(ftpConfig);

app.get("/browse/*", async (req, res) => {
  const FTPPath = req.params[0] || "/";
  let client;
  try {
    client = await pool.acquire();
    const fileList = await client.list(FTPPath);

    let html = `<h2>Browsing: ${FTPPath} []</h2>`;
    if (FTPPath !== "/") {
      const parentPath = "../";
      html += `<p><a href="${parentPath}">[Parent Directory]</a></p>`;
    }
    fileList.forEach((file) => {
      let href = file.name;
      if (file.isDirectory) {
        html += `<p><a href="${href}/">[DIR] ${file.name}</a></p>`;
      } else {
        href = path.join(FTPPath, file.name);
        if (file.name.match(/^(?!\._).*(mp3|wav)/gi)) {
          const streamURL = `${req.protocol}://${req.get("host")}/stream/${href}`;
          html += `<p><a href="/stream/${href}">${streamURL}</a></p>`;
          // html += `<p><audio controls><source src="/stream/${href}" type="audio/mpeg">Your browser does not support the audio element.</audio></p>`;
          html += `<p><a href="/download/${href}">download ${file.name}</a><p>`;
        }
      }
    });
    res.send(html);
  } catch (err) {
    console.error("Failed to browse directory:", err);
    res.status(500).send("Failed to browse directory.");
  } finally {
    if (client) pool.release(client);
  }
});

app.get("/stream/*", async (req, res) => {
  const ftpFilePath = decodeURIComponent(req.params[0]);
  let client;
  try {
    client = await pool.acquire();
    const fileSize = await client.size(ftpFilePath);
    const range = req.headers.range;
    if (!range) {
      // If no range header, send the entire file
      res.setHeader("Content-Length", fileSize);
      res.setHeader("Content-Type", "audio/mpeg");
      const passThrough = new PassThrough();
      passThrough.pipe(res);
      await client.downloadTo(passThrough, ftpFilePath);
    } else {
      let parts = range.replace(/bytes=/, "").split("-");
      let start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      let chunkSize = end - start + 1;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", chunkSize);
      res.setHeader("Content-Type", "audio/mpeg");
      res.status(206); // HTTP 206 Partial Content
      const passThrough = new PassThrough();
      passThrough.pipe(res);
      await client.downloadTo(passThrough, ftpFilePath, start);
    }
  } catch (e) {
    console.error("failed to stream file", e);
    res.status(500).send("failed to stream file");
  } finally {
    if (client) pool.release(client);
  }
});

app.get("/download/*", async (req, res) => {
  const ftpFilePath = decodeURIComponent(req.params[0]);
  let client;
  try {
    client = await pool.acquire();
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${path.basename(ftpFilePath)}"`
    );
    res.setHeader("Content-Type", "application/octet-stream");
    const passThrough = new PassThrough();
    passThrough.pipe(res);
    await client.downloadTo(passThrough, ftpFilePath);
  } catch (e) {
    console.error("failed to download file", e);
    res.status(500).send("failed to download file");
  } finally {
    if (client) pool.release(client);
  }
});

app.get(["/close","/stop"], async (req, res) => {
  try {
    await pool.close();
    res.send("all clients closed");
  } catch (e) {
    console.error("failed to close clients", e);
    res.status(500).send("faield to close clients");
  }
});

app.get("/start", async (req, res) => {
  try {
    await pool.initPool();
    res.send("pool started");
  } catch (e) {
    console.error("failed to start clients", e);
    res.status(500).send("faield to start clients");
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});

export default app;
