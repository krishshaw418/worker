import * as z from "zod";
import { v4 as uuidv4 } from "uuid";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import s3Client from "./s3Client";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { GetObjectCommand } from "@aws-sdk/client-s3";

async function GetSignedUrl(key: string) {
    let url: string | undefined;
    try {
      url = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: process.env.BUCKET_NAME!,
        Key: key
      }), { expiresIn: 3600 });
    } catch (error) {
      console.log("Error: ", error);
      return;
    }
    return url;
}

const InputFormat = z.object({
  prompt: z.string(),
  style: z.enum(["anime", "flux-schnell", "flux-dev", "flux-dev-fast", "imagine-turbo", "realistic"]),
  aspect_ratio: z.optional(z.enum(["1:1", "16:9", "9:16"]))
})

type InputFormatType = z.infer<typeof InputFormat>

type ErrorFormat = {
  code: number,
  error: string,
  message: string,
  status: string
}

export async function ImaGen(input: InputFormatType) {

  const formData = new FormData();
  formData.append("prompt", input.prompt);
  if(input.style)
  formData.append("style", input.style);
  if(input.aspect_ratio)
  formData.append("aspect_ratio", input.aspect_ratio);
  let url: string | undefined;

  try {
    const response = await fetch(`${process.env.IMAGINE_ART_API}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.IMAGINE_ART_API_KEY}`,
      },
      body: formData
    })
    const contentType = response.headers.get("content-type");
    if(!response.ok) {
      if(contentType?.includes("application/json")) {
        const error = (await response.json()) as ErrorFormat;
        console.log("status: ", error.status);
        console.log("code: ", error.code);
        console.log("message: ", error.message);
        console.log("error: ", error.error);
        return {success: false, error: error.message};
      }
    }
    if(response.headers.get("content-length") === "157921"){
      return {success: false, error: "Image generation failed due to offensive request!"};
    }
    if(contentType?.includes("image/png")){
      const data = await response.blob();
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileName = `${uuidv4()}.png`;
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.BUCKET_NAME!,
          Key: `uploads/${fileName}`,
          Body: buffer,
          ContentType: "image/png"
        }))
        console.log("Upload successful!");
        url = await GetSignedUrl(`uploads/${fileName}`);
      } catch (error: any) {
        switch (error.name) {
          case "CredentialsProviderError":
            console.error("Invalid credentials (check R2 keys).");
            break;
          case "AccessDenied":
            console.error("No access to bucket (check bucket policy / permissions).");
            break;
          case "NoSuchBucket":
            console.error("Bucket does not exist.");
            break;
          default:
          console.error("Unexpected error:", error);
        }
        return {success: false, error: error.name};
      }
    }
    return {success: true, url: url};
  } catch (error) {
    console.log("Error", error);
    return {success: false, error: "Internal server error!"};
  }
}