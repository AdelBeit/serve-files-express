import { Client } from "basic-ftp";
import dotenv from "dotenv";

dotenv.config();
const TIMEOUT = parseInt(process.env.VERCEL_TIMEOUT) || 60000;
const POOL_SIZE = process.env.VERCEL_POOL_SIZE || 3;
const FTP_VERBOSE = false;//process.env.FTP_VERBOSE || false;

export default class FTPClientPool {
  constructor(config, poolSize = POOL_SIZE) {
    this.config = config;
    this.poolSize = poolSize;
    this.pool = [];
    this.queue = [];
    this.stopped = true;
    this.initPool();
  }

  async initPool() {
    if (this.stopped) {
      for (let i = 0; i < this.poolSize; i++) {
        const client = new Client();
        client.ftp.verbose = true;
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