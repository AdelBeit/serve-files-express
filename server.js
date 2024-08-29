import express from "express";
import path from "path";
import FTPClientPool from "./FTPClientPool.js";
import { PassThrough } from "stream";
import dotenv from 'dotenv'

dotenv.config();
const app = express();

const HOST=process.env.VERCEL_HOST;
const USER=process.env.VERCEL_USER;
const PASSWORD=process.env.VERCEL_PASSWORD;
const PORT=process.env.VERCEL_PORT || 3000;
const ftpConfig = {
  host: HOST,
  user: USER,
  password: PASSWORD,
  secure: false, 
};
const pool = new FTPClientPool(ftpConfig);

app.get("/browse/*", async (req, res) => {
  const ftpPath = req.params[0] || "/";
  let client;
  try {
    client = await pool.acquire();
    const fileList = await client.list(ftpPath);

    let html = `<h2>Browsing: ${ftpPath}</h2>`;
    if (ftpPath !== "/") {
      const parentPath = path.dirname(ftpPath);
      html += `<li><a href="/browse/${parentPath}">[Parent Directory]</a></li>`;
    }
    fileList.forEach((file) => {
      const hrefPath = path.join(ftpPath, file.name).replace(/\\/g, "/");

      if (file.isDirectory) {
        html += `<li><a href="/browse/${hrefPath}/">[DIR] ${file.name}</a></li>`;
      } else {
        html += `<li><a href="/stream/${hrefPath}">stream ${file.name}</a></li>`;
        html += `<li><a href="/download/${hrefPath}">download ${file.name}</a></li>`;
      }
    });
    html += "</ul>";
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
    res.setHeader("Content-Type", "audio/mpeg");
    const passThrough = new PassThrough();
    passThrough.pipe(res);
    await client.downloadTo(passThrough, ftpFilePath);
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

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});
