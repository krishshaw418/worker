import dotenv from "dotenv";
dotenv.config();
import { Worker } from "bullmq";
import { getRedisClient } from "./utils/redis";
import { ImaGen } from "./utils/image-generation";

const worker = new Worker(
    "requestQueue",
    async (job) => {
        console.log(`processing jobId ${job.id}: `, job.data);
        const input = {prompt: job.data.prompt, style: job.data.style}
        return await ImaGen(input);
    },
    { connection: getRedisClient() }
);

worker.on("completed", async (job, returnedValue) => {
    if(returnedValue.success === false) {
        console.log(`Failed to process request with jobId ${job.id} due to: ${returnedValue.error}`);
    }
    else {
        try {
            const response = await fetch(process.env.RENDER_EXTERNAL_URL!, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ imgUrl: returnedValue.url, validity: 3600, chatId: job.data.chatId })
            })
            if(!response.ok) {
                console.log("Error sending result to bot!");
            }
            else{
                const data = await response.json();
                console.log(data);
            }
        } catch (error) {
            console.log("Error: ", error);
        }
        console.log({
            url: returnedValue.url,
            message: `Job ${job.id} processed successfully!`
        });
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
