import { google } from "googleapis";
import { Readable } from "stream";
import path from "path";
import fs from "fs";

let driveInstance: ReturnType<typeof google.drive> | null = null;

function getDriveClient() {
  if (driveInstance) return driveInstance;

  const credsPath = path.join(process.cwd(), "credentials.json");
  const tokenPath = path.join(process.cwd(), "token.json");

  if (!fs.existsSync(credsPath) || !fs.existsSync(tokenPath)) {
    throw new Error("Missing credentials.json or token.json in project root");
  }

  const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
  const token = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));

  const oauth2Client = new google.auth.OAuth2(
    creds.installed.client_id,
    creds.installed.client_secret,
    "http://localhost"
  );

  oauth2Client.setCredentials({
    refresh_token: token.refresh_token,
    access_token: token.token,
    expiry_date: Date.parse(token.expiry),
    scope: (token.scopes || []).join(" "),
    token_type: "Bearer",
  });

  driveInstance = google.drive({ version: "v3", auth: oauth2Client });
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
