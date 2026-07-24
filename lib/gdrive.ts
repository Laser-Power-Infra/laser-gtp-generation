import { google } from "googleapis";
import { Readable } from "stream";

let driveInstance: ReturnType<typeof google.drive> | null = null;

function getDriveClient() {
  if (driveInstance) return driveInstance;

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientEmail || !privateKey || !folderId) {
    throw new Error("Missing GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, or GOOGLE_DRIVE_FOLDER_ID in .env");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  driveInstance = google.drive({ version: "v3", auth });
  return driveInstance;
}

export async function uploadFileToDrive(
  fileName: string,
  mimeType: string,
  base64Data: string
): Promise<{ success: boolean; fileId: string; url: string }> {
  const drive = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
  const buffer = Buffer.from(base64Data, "base64");

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink",
  });

  const fileId = response.data.id;
  if (!fileId) throw new Error("Upload failed — no file ID returned.");

  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  return {
    success: true,
    fileId,
    url: response.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
  };
}
