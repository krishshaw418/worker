import dotenv from "dotenv";
dotenv.config();
import { Worker } from "bullmq";
import { getRedisClient } from "./utils/redis";
import { ImaGen } from "./utils/image-generation";

const worker = new Worker(
    "requestQueue",
    async (job) => {
        console.log(`processing jobId ${job.id}: `, job.data);
        return await ImaGen(job.data);
    },
    { connection: getRedisClient() }
);

worker.on("completed", (job, returnedValue) => {
    if(returnedValue !== 1) {
        console.log(`Failed to process request with jobId ${job.id} due to: ${returnedValue}`);
    }
    else {
        console.log(`Job ${job.id} processed successfully!`);
    }
});

worker.on("failed", (job, err) => {
    console.log(`Job ${job?.id} failed due to: `, err);
})

process.on("SIGINT", async () => {
  console.log("Shutting down worker...");
  await worker.close();
  process.exit(0);
});
