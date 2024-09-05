import { Client } from "basic-ftp";
import dotenv from "dotenv";

dotenv.config();
const TIMEOUT = parseInt(process.env.VERCEL_TIMEOUT) || 60000;
const CLIENT_TIMEOUT = 1000;
const CLIENT_CLEANUP_TIMEOUT = process.env.CLIENT_CLEANUP_TIMEOUT || 5000 * 60;
const CONCURRENCY_LIMIT = process.env.VERCEL_POOL_SIZE || 3;
const FTP_VERBOSE = false; //process.env.FTP_VERBOSE || false;

export default class PoolManager {
  constructor(poolSize = CONCURRENCY_LIMIT) {
    this.poolSize = poolSize;
    this.clientPool = [];
    this.jobQueue = [];
    this.stopped = true;
    this.activeJobs = 0;
    this.initPool();
    this.lastChanged = Date.now();
  }
  
  generateJob(i){
    return setTimeout(()=>console.log('job:',i,'done'),3000);
  }

  async processJob(){

  }

  async processJob(job) {
    // const client = new Client(CLIENT_TIMEOUT);
    // client.ftp.verbose = FTP_VERBOSE;
    let client;
    if (this.stopped) this.initPool();
    try {
      client = await this.acquire();
      await client.access(this.config);
      this.processNext();
      await job(client);
    } catch (error) {
      console.log('error happened, stop everything');
      this.close();
      console.error("FTP job failed:", error);
    } finally {
      // client.close();
      if (client) {
        this.release(client);
      }
      this.activeJobs--;
      this.processNext();
    }
  }

  enqueueJob(job) {
    this.queue.push(job);
    this.processNext();
  }

  processNext() {
    console.log("processing next job");
    this.lastChanged = Date.now();
    if (this.activeJobs >= CONCURRENCY_LIMIT) {
      return;
    }
    if (this.queue.length === 0) {
      this.close();
      return;
    }

    this.activeJobs++;
    const job = this.queue.shift();
    this.processJob(job);
    return;
  }

  async initPool() {
    console.log("restarting pool");
    if (this.stopped) {
      for (let i = 0; i < this.poolSize; i++) {
        const client = new Client(CLIENT_TIMEOUT);
        client.ftp.verbose = FTP_VERBOSE;
        await client.access(this.config);
        this.pool.push(client);
      }
      this.stopped = false;
      this.cleanup();
    }
  }

  acquire() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    } else {
      console.log("pools empty, come back tomorrow");
    }
  }

  release(client) {
    this.pool.push(client);
  }

  close() {
    if (!this.stopped) {
      for (const client of this.pool) {
        client.close();
      }
      this.pool = [];
      console.log("were done here, cleanup bois");
      this.stopped = true;
    }
  }

  cleanup() {
    if (Date.now() - this.lastChanged > CLIENT_CLEANUP_TIMEOUT) {
      this.close();
    } else {
      let autoCleanup = setTimeout(() => {
        this.cleanup();
        clearTimeout(autoCleanup);
      }, CLIENT_CLEANUP_TIMEOUT);
    }
  }
}
