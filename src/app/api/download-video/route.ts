import path from "path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import z from "zod";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: Request) {
  // accept body
  const body = await request.json();

  try {
    // validate body with zod
    const schema = z.object({ url: z.string().url() });
    const _body = schema.parse(body, {});

    // download content locally
    const fileName = `${crypto.randomUUID()}.mp4`;

    const cliPath = path.resolve("public/yt-dlp.cli");
    const download = await promisify(exec)(
      `${cliPath} -o "downloads/${fileName}" -f "bestvideo[ext=mp4]" ${_body.url}`
    );

    const match = download.stdout.match(/Destination: (.+)/);
    const downloadedFile = match && match[1].trim();

    console.log({ downloadedFile, fileName });

    // upload content to s3
    const command = new PutObjectCommand({
      Bucket: "social-media-downloader-test-return0",
      Body: await fs.readFile(downloadedFile!),
      Key: fileName,
    });

    // response s3 url
    await s3Client.send(command);

    // const getObjectCommand = s3Client.
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: "social-media-downloader-test-return0",
        Key: fileName,
      }),
      { expiresIn: 60 * 60 * 24 }
    );

    const response = {
      downloadUrl: signedUrl,
      fileName,
    };
    await fs.unlink(downloadedFile!);
    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error }, { status: 400 });
  }
}
