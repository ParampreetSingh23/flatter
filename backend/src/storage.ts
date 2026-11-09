import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Private Cloudflare R2 over its S3 API. Tests inject an in-memory implementation of this interface.
export interface Storage {
  presignPut(key: string, contentType: string): Promise<string>;
  presignGet(key: string): Promise<string>;
  /** Bytes of the object, or null when missing. Throws "TOO_LARGE" past maxBytes. */
  read(key: string, maxBytes: number): Promise<Buffer | null>;
  write(key: string, body: Buffer, contentType: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>; // idempotent
}

export const PUT_TTL_SECONDS = 300;
export const GET_TTL_SECONDS = 60;

const notFound = (e: unknown) => ["NoSuchKey", "NotFound"].includes((e as { name?: string })?.name ?? "") || (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404;

export function r2Storage(env = process.env): Storage | null {
  const { R2_ACCOUNT_ID: account, R2_BUCKET: Bucket, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = env;
  if (!account || !Bucket || !accessKeyId || !secretAccessKey) return null;
  const s3 = new S3Client({ region: "auto", endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
  return {
    presignPut: (Key, ContentType) => getSignedUrl(s3, new PutObjectCommand({ Bucket, Key, ContentType }), { expiresIn: PUT_TTL_SECONDS }),
    presignGet: (Key) => getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: GET_TTL_SECONDS }),
    async read(Key, maxBytes) {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket, Key }));
        if ((res.ContentLength ?? 0) > maxBytes) throw new Error("TOO_LARGE");
        const chunks: Buffer[] = [];
        let n = 0;
        for await (const c of res.Body as AsyncIterable<Buffer>) {
          n += c.length;
          if (n > maxBytes) throw new Error("TOO_LARGE");
          chunks.push(c);
        }
        return Buffer.concat(chunks);
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
    async write(Key, Body, ContentType) {
      await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
    },
    async exists(Key) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket, Key }));
        return true;
      } catch (e) {
        if (notFound(e)) return false;
        throw e;
      }
    },
    async remove(Key) {
      await s3.send(new DeleteObjectCommand({ Bucket, Key }));
    },
  };
}
