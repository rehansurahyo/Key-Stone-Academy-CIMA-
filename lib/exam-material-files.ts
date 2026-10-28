export const REFERENCE_MATERIAL_ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;

export function isReferenceImage(path: string) {
  return /\.(png|jpe?g)$/i.test(path);
}

// Check the bytes as well as the extension; never upload an image as a PDF.
export async function validateExamMaterial(file: File, kind: "reference" | "preseen" | "solution") {
  if (file.size === 0 || file.size > MAX_MATERIAL_BYTES) {
    throw new Error(`${file.name}: files must be between 1 byte and 20 MB.`);
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (extension === "pdf" && [37, 80, 68, 70, 45].every((byte, i) => bytes[i] === byte)) {
    return { extension: "pdf", contentType: "application/pdf" };
  }
  if (kind === "reference") {
    if (extension === "png" && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) {
      return { extension: "png", contentType: "image/png" };
    }
    if ((extension === "jpg" || extension === "jpeg") && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
      return { extension: "jpg", contentType: "image/jpeg" };
    }
    throw new Error(`${file.name}: select a valid PDF, PNG or JPG file.`);
  }
  throw new Error(`${file.name} is not a valid PDF document.`);
}
