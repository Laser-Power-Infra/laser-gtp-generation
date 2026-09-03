import { renderDocx, RenderDocxOptions } from "./render-docx";
import { validateAndFixGTPDocx } from "./validate-docx";
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
  const rawBuffer = await renderDocx(data, {
    orientation: options.orientation,
    titleBlockMode: options.titleBlockMode,
    titleBlockCustomRows: options.titleBlockCustomRows,
  });

  const buffer = await validateAndFixGTPDocx(rawBuffer);

  const fs = await import("fs");
  fs.writeFileSync(options.outputPath, buffer);

  return buffer;
}
