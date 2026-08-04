import { renderDocx, RenderDocxOptions } from "./render-docx";
import { GTPDocumentData } from "@/types/gtp-types";

export interface GenerateDocxOptions {
  outputPath: string;
  orientation?: RenderDocxOptions["orientation"];
  showTitleBlock?: RenderDocxOptions["showTitleBlock"];
}

export async function generateGTPDocx(
  data: GTPDocumentData,
  options: GenerateDocxOptions
): Promise<Buffer> {
  const buffer = await renderDocx(data, {
    orientation: options.orientation,
    showTitleBlock: options.showTitleBlock,
  });

  const fs = await import("fs");
  fs.writeFileSync(options.outputPath, buffer);

  return buffer;
}
