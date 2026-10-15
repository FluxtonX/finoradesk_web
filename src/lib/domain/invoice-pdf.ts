import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Invoice, InvoiceLine } from "./types";
import { money } from "./money";
export async function buildInvoicePdf(
  invoice: Invoice,
  lines: InvoiceLine[],
  fontBytes: Uint8Array,
) {
  if (invoice.state === "draft")
    throw new Error("Issue the invoice before downloading its official PDF.");
  if (!invoice.organization_snapshot || !invoice.contact_snapshot)
    throw new Error("Issued invoice snapshots are unavailable.");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  pdf.setTitle(invoice.number ?? "Invoice");
  pdf.setAuthor(invoice.organization_snapshot.name ?? "Finoredesk");
  let page: PDFPage,
    y = 0;
  const green = rgb(0.09, 0.24, 0.2),
    muted = rgb(0.4, 0.47, 0.42);
  function addPage() {
    page = pdf.addPage([595.28, 841.89]);
    y = 790;
    page.drawText(invoice.number ?? "Invoice", {
      x: 45,
      y,
      size: 11,
      font,
      color: muted,
    });
    y -= 30;
  }
  function text(value: string, size = 10, color = green, x = 45) {
    page.drawText(value, { x, y, size, font, color });
  }
  function wrap(value: string, width: number, size: number, f: PDFFont = font) {
    const result: string[] = [];
    for (const paragraph of value
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(candidate, size) > width) {
          if (line) result.push(line);
          line = "";
          for (const character of word) {
            if (f.widthOfTextAtSize(line + character, size) > width && line) {
              result.push(line);
              line = "";
            }
            line += character;
          }
        } else line = candidate;
      }
      result.push(line);
    }
    return result;
  }
  function write(value: string, size = 10, width = 505) {
    for (const line of wrap(value, width, size)) {
      if (y < 60) addPage();
      text(line, size);
      y -= size + 6;
    }
  }
  function date(value: string) {
    const [yy, mm, dd] = value.split("-");
    return `${dd}/${mm}/${yy}`;
  }
  addPage();
  text(
    invoice.organization_snapshot.gst_registered ? "TAX INVOICE" : "INVOICE",
    24,
  );
  y -= 38;
  write(invoice.organization_snapshot.name ?? "", 15);
  if (invoice.organization_snapshot.abn)
    write(`ABN ${invoice.organization_snapshot.abn}`);
  write(invoice.organization_snapshot.address ?? "");
  y -= 12;
  write(`Billed to: ${invoice.contact_snapshot.name ?? ""}`, 12);
  write(invoice.contact_snapshot.address ?? "");
  if (invoice.contact_snapshot.email) write(invoice.contact_snapshot.email);
  y -= 10;
  write(
    `Issue date: ${date(invoice.issue_date)}     Due date: ${date(invoice.due_date)}`,
  );
  write(
    `Currency: AUD     Calculation version: ${invoice.calculation_version}`,
  );
  if (invoice.state === "void") write("VOID — retained for your records", 13);
  y -= 12;
  for (const line of lines) {
    if (y < 110) addPage();
    write(line.description, 11, 500);
    write(
      `${line.quantity} × ${money(line.unit_cents)} · ${line.tax_mode.replaceAll("_", " ")} · GST ${money(line.tax_cents)} · Total ${money(line.total_cents)}`,
      9,
    );
    y -= 8;
  }
  y -= 10;
  write(`Subtotal: ${money(invoice.subtotal_cents)}`);
  write(`GST: ${money(invoice.tax_cents)}`);
  write(`Total AUD: ${money(invoice.total_cents)}`, 15);
  write(`Recorded payments: ${money(invoice.paid_cents)}`);
  write(`Outstanding: ${money(invoice.outstanding_cents)}`, 12);
  if (invoice.notes) {
    y -= 15;
    write("Notes / payment instructions", 12);
    write(invoice.notes);
  }
  pdf
    .getPages()
    .forEach((p, i) =>
      p.drawText(
        `Generated from issued records · ${i + 1} / ${pdf.getPageCount()}`,
        { x: 45, y: 30, size: 8, font, color: muted },
      ),
    );
  return pdf.save();
}
