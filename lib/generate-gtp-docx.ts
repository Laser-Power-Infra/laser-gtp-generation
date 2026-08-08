import { renderDocx, RenderDocxOptions } from "./render-docx";
import { GTPDocumentData } from "@/types/gtp-types";

export interface GenerateDocxOptions {
  outputPath: string;
  orientation?: RenderDocxOptions["orientation"];
  titleBlockMode?: RenderDocxOptions["titleBlockMode"];
  titleBlockCustomRows?: RenderDocxOptions["titleBlockCustomRows"];
}

export async function generateGTPDocx(
  data: GTPDocumentData,
  options: GenerateDocxOptions
): Promise<Buffer> {
  const buffer = await renderDocx(data, {
    orientation: options.orientation,
    titleBlockMode: options.titleBlockMode,
    titleBlockCustomRows: options.titleBlockCustomRows,
  });

  const fs = await import("fs");
  fs.writeFileSync(options.outputPath, buffer);

  return buffer;
}
