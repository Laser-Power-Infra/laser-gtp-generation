import JSZip from "jszip";
import fs from "fs";
import path from "path";

const LETTERHEAD_FOOTER_DIR = path.join(process.cwd(), "public", "letterhead-footer");

/** Letterhead page is A4 landscape: width 16839 twips, side margins 1440 twips each. */
const LETTERHEAD_PAGE_WIDTH_TWIPS = 16839;
const LETTERHEAD_MARGIN_LEFT_TWIPS = 1440;

const EMU_PER_TWIP = 635;
const LETTERHEAD_MARGIN_LEFT_EMU = LETTERHEAD_MARGIN_LEFT_TWIPS * EMU_PER_TWIP;

/**
 * Replaces the generated document's footer with the letterhead footer
 * (floating signature graphic, left bar and full-width company bar, plus the
 * "Laser Power & Infra Limited" text and page field).
 *
 * The letterhead anchors every graphic relative to its text column
 * (`positionH relativeFrom="column"`) with extents tuned for its landscape
 * page. This document may use different margins, so each anchor is converted
 * to page-relative positioning (`relativeFrom="page"`) and every horizontal
 * dimension (extents + offset) is scaled by `pageWidthTwips / 16839`. That
 * reproduces the letterhead's layout exactly in landscape (same page width)
 * and shrinks it proportionally in portrait, so the graphics always stay
 * inside the page. Vertical offsets are left untouched because the footer
 * area geometry (bottom margin, footer distance) is identical in both
 * orientations.
 */
export async function applyLetterheadFooter(
  buffer: Buffer,
  pageWidthTwips: number
): Promise<Buffer> {
  const R = pageWidthTwips / LETTERHEAD_PAGE_WIDTH_TWIPS;
  const scale = (value: number) => Math.round(value * R);

  const footerXmlRaw = fs.readFileSync(
    path.join(LETTERHEAD_FOOTER_DIR, "footer.xml"),
    "utf8"
  );
  const footerRels = fs.readFileSync(
    path.join(LETTERHEAD_FOOTER_DIR, "footer.rels"),
    "utf8"
  );

  const footerXml = footerXmlRaw
    .replace(/cx="(\d+)"/g, (_m, v: string) => `cx="${scale(parseInt(v, 10))}"`)
    .replace(/cy="(\d+)"/g, (_m, v: string) => `cy="${scale(parseInt(v, 10))}"`)
    .replace(
      /(<wp:positionH relativeFrom=")column(">\s*<wp:posOffset>)(-?\d+)(<\/wp:posOffset>)/g,
      (_m, pre: string, mid: string, v: string, post: string) =>
        `${pre}page${mid}${scale(parseInt(v, 10) + LETTERHEAD_MARGIN_LEFT_EMU)}${post}`
    );

  const zip = await JSZip.loadAsync(buffer);

  const docRels = await zip.file("word/_rels/document.xml.rels")?.async("string");
  if (!docRels) {
    throw new Error("applyLetterheadFooter: document.xml.rels not found");
  }

  const footerRel = docRels.match(
    /<Relationship\b[^>]*\bType="[^"]*\/footer"[^>]*\/>/
  );
  if (!footerRel) {
    throw new Error("applyLetterheadFooter: footer relationship not found");
  }

  const target = footerRel[0].match(/Target="([^"]+)"/)?.[1];
  if (!target) {
    throw new Error("applyLetterheadFooter: footer target not found");
  }

  const footerPath = target.startsWith("/") ? target.slice(1) : `word/${target}`;
  const footerRelsPath = path
    .join(path.dirname(footerPath), "_rels", `${path.basename(footerPath)}.rels`)
    .replace(/\\/g, "/");

  zip.file(footerPath, footerXml);
  zip.file(footerRelsPath, footerRels);

  for (const media of ["image2.png", "image3.png", "image4.emf"]) {
    const data = fs.readFileSync(path.join(LETTERHEAD_FOOTER_DIR, "media", media));
    zip.file(`word/media/${media}`, data);
  }

  const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
  if (contentTypes) {
    let updated = contentTypes;
    if (!/<Default\b[^>]*\bExtension="png"/i.test(updated)) {
      updated = updated.replace(
        "</Types>",
        `<Default Extension="png" ContentType="image/png"/></Types>`
      );
    }
    if (!/<Default\b[^>]*\bExtension="emf"/i.test(updated)) {
      updated = updated.replace(
        "</Types>",
        `<Default Extension="emf" ContentType="image/x-emf"/></Types>`
      );
    }
    zip.file("[Content_Types].xml", updated);
  }

  return zip.generateAsync({ type: "nodebuffer" });
}
