/**
 * avatar.ts — turn any picture into a tiny square avatar.
 *
 * The avatar travels inside group snapshots (invite links, sync payloads),
 * so size matters more than fidelity: cover-crop to a 128px square and
 * encode as JPEG ≈ 4-8 KB. Runs entirely client-side via canvas.
 */

const AVATAR_SIZE = 128;
/** Anything bigger than this after encoding is rejected (corrupt/odd input). */
const MAX_DATA_URL_LENGTH = 60_000;

export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("scegli un file immagine (JPG, PNG…)");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("immagine non leggibile"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas non disponibile");
    // cover-crop: take the largest centered square of the source
    const s = Math.min(img.width, img.height);
    ctx.drawImage(
      img,
      (img.width - s) / 2, (img.height - s) / 2, s, s,
      0, 0, AVATAR_SIZE, AVATAR_SIZE,
    );
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      throw new Error("immagine troppo complessa, prova con un'altra");
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}
