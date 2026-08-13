import { createPdfUpload, deleteR2Object, verifyPdfObject } from "../lib/r2-server.ts";

const key = `_smoke/pdf-upload-${crypto.randomUUID()}.pdf`;
const bytes = new TextEncoder().encode("%PDF-1.4\n% REMIX R2 upload smoke\n%%EOF\n");
let uploaded = false;

try {
  const prepared = await createPdfUpload(key);
  const response = await fetch(prepared.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/pdf",
      Origin: "https://www.mathremix.pro.vn",
    },
    body: bytes,
  });
  if (!response.ok) throw new Error(`R2 upload returned ${response.status}.`);
  uploaded = true;
  await verifyPdfObject(key, bytes.byteLength, bytes.byteLength);
  console.log("R2_PDF_UPLOAD_OK upload=PASS verify=PASS cleanup=PENDING");
} finally {
  if (uploaded) {
    await deleteR2Object(key);
    console.log("R2_PDF_UPLOAD_CLEANUP_OK cleanup=PASS");
  }
}
