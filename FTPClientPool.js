import { Client } from "basic-ftp";

export default class FTPClientPool {
  constructor(config, poolSize = 4) {
    this.config = config;
    this.poolSize = poolSize;
    this.pool = [];
    this.queue = [];
    this.initPool();
  }

  async initPool() {
    for (let i = 0; i < this.poolSize; i++) {
      const client = new Client(process.env.VERCEL_TIMEOUT);
      // client.ftp.verbose = true;
      await client.access(this.config);
      this.pool.push(client);
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

  async close(){
    for(const client of this.pool){
      client.close();
    }
  }
}