import { Client } from "basic-ftp";
import dotenv from "dotenv";

dotenv.config();
const TIMEOUT = parseInt(process.env.VERCEL_TIMEOUT) || 60000;
const CONCURRENCY_LIMIT = process.env.VERCEL_POOL_SIZE || 3;
const FTP_VERBOSE = false;//process.env.FTP_VERBOSE || false;

export default class FTPClientManager {
  constructor(config, poolSize = CONCURRENCY_LIMIT) {
    this.config = config;
    this.poolSize = poolSize;
    this.pool = [];
    this.queue = [];
    this.stopped = true;
    this.activeJobs = 0;
  }

  async processJob(job) {
    const client = new Client();
    client.ftp.verbose = FTP_VERBOSE;

    try {
      await client.access(this.config);
      await job(client);
    } catch (error) {
      console.error("FTP job failed:", error);
    } finally {
      client.close();
      this.activeJobs--;
      this.processNext();
    }
  }

  async enqueueJob(job) {
    this.queue.push(job);
    this.processNext();
  }

  async processNext() {
    if (this.activeJobs >= CONCURRENCY_LIMIT || this.queue.length === 0) {
      return;
    }

    this.activeJobs++;
    const job = this.queue.shift();
    await this.processJob(job);
  }

  async initPool() {
    if (this.stopped) {
      for (let i = 0; i < this.poolSize; i++) {
        const client = new Client();
        client.ftp.verbose = FTP_VERBOSE;
        await client.access(this.config);
        this.pool.push(client);
      }
      this.stopped = false;
    }
  }

  async acquire() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    } else {
      return new Promise((resolve) => {
        this.queue.push(resolve);
      });
    }
  }

  async release(client) {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      resolve(client);
    } else {
      this.pool.push(client);
    }
  }

  async close() {
    if (!this.stopped) {
      for (const client of this.pool) {
        client.close();
      }
      this.stopped = true;
    }
  }
}
