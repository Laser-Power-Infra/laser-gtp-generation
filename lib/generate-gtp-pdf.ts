// import fs from "fs";
// import Handlebars from "handlebars";
// import puppeteer, { PDFOptions } from "puppeteer";
// import { GtpDocumentData } from "@/types/gtp-types";
// import { extractTablesFromWorkbooks } from "./extract-xlsx-tables";

// const WINDOWS_CHROME_PATHS = [
//   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
//   "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
//   "C:\\Program Files\\Chromium\\Application\\chrome.exe",
// ];

// function resolveChromePath(executablePathOverride?: string): string | undefined {
//   if (executablePathOverride) return executablePathOverride;
//   return WINDOWS_CHROME_PATHS.find((candidate) => fs.existsSync(candidate));
// }

// export interface GenerateGtpPdfOptions {
//   /** One or more .xlsx files to pull sheets/tables from. Every sheet becomes one page. */
//   xlsxFilePaths: string[];

//   /** Path to the gtp_document.hbs template source, or pass templateSource directly instead. */
//   templatePath?: string;
//   templateSource?: string;

//   /** Output path to write the PDF to. */
//   outputPath: string;

//   pdfOptions?: PDFOptions;
//   executablePath?: string;
// }

// /**
//  * Full pipeline: reads every worksheet out of the given .xlsx files
//  * (preserving merged cells), compiles them into the GTP Handlebars
//  * template -- one sheet per page -- and renders the result to a PDF
//  * via headless Chrome.
//  */
// export async function generateGtpPdf(options: GenerateGtpPdfOptions): Promise<Buffer> {
//   // 1. Pull every sheet from every workbook into the grid shape the template expects.
//   const tables = await extractTablesFromWorkbooks(options.xlsxFilePaths);
//   const data: GtpDocumentData = { tables };

//   // 2. Load template source (from disk or passed in directly) and compile with data.
//   const templateSource =
//     options.templateSource ??
//     fs.readFileSync(options.templatePath ?? "./gtp_document.hbs", "utf-8");

//   const template = Handlebars.compile<GtpDocumentData>(templateSource);
//   const html = template(data);

//   // 3. Render via Puppeteer.
//   const chromePath = resolveChromePath(options.executablePath);
//   const browser = await puppeteer.launch({
//     headless: true,
//     executablePath: chromePath,
//     args: ["--no-sandbox", "--disable-setuid-sandbox"],
//   });

//   try {
//     const page = await browser.newPage();
//     await page.setContent(html, { waitUntil: "load" });
//     await page.evaluateHandle("document.fonts.ready");

//     const pdfBuffer = await page.pdf({
//       format: "A4",
//       printBackground: true,
//       preferCSSPageSize: true, // respect the @page size/margin rules in the template
//       ...options.pdfOptions,
//       path: options.outputPath,
//     });

//     return Buffer.from(pdfBuffer);
//   } finally {
//     await browser.close();
//   }
// }

// /**
//  * Example usage:
//  *
//  *   import { generateGtpPdf } from "./generate-gtp-pdf";
//  *
//  *   generateGtpPdf({
//  *     xlsxFilePaths: [
//  *       "./GTP-_15753.xlsx",
//  *       "./REV_2__GTP-_15363_NPCL_RC-2100000056.xlsx",
//  *     ],
//  *     templatePath: "./gtp_document.hbs",
//  *     outputPath: "./out/gtp-combined.pdf",
//  *   }).then(() => console.log("PDF generated"));
//  *
//  * With 1 sheet in the first file and 4 sheets in the second, this produces
//  * a 5-page PDF, one Excel sheet per page, formatted exactly like the
//  * reference .docx tables.
//  */