import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY || 'minioadmin';
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY || 'minioadmin';
const endpoint = process.env.AWS_S3_ENDPOINT || process.env.S3_ENDPOINT;
export const bucketName = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET_NAME || 'coretrack-attachments';

// If endpoint is set (e.g. MinIO/Localstack in dev), force path style.
// If endpoint is empty or undefined, AWS SDK connects directly to real AWS S3 (https://s3.<region>.amazonaws.com).
export const s3Client = new S3Client({
  region,
  endpoint: endpoint || undefined,
  forcePathStyle: !!endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

/**
 * Generate a presigned S3 PUT URL allowing browser clients to upload files directly to S3.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Generate a presigned S3 GET URL allowing clients to download private S3 objects securely.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Delete an object from S3.
 */
export async function deleteS3Object(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3Client.send(command);
}
