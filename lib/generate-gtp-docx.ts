import { renderDocx } from "./render-docx";
import { GTPDocumentData } from "@/types/gtp-types";

export interface GenerateDocxOptions {
  outputPath: string;
}

export async function generateGTPDocx(
  data: GTPDocumentData,
  options: GenerateDocxOptions
): Promise<Buffer> {
  const buffer = await renderDocx(data);

  const fs = await import("fs");
  fs.writeFileSync(options.outputPath, buffer);

  return buffer;
}
