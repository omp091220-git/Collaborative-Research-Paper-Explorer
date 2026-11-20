import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";

function makeImagePixels(width, height, paint) {
  const pixels = Buffer.alloc(width * height * 3, 255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = paint(x, y);
      const offset = (y * width + x) * 3;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }
  return deflateSync(pixels);
}

function makePdf(objects) {
  const chunks = [Buffer.from("%PDF-1.4\n%FR09\n", "ascii")];
  const offsets = [0];
  let length = chunks[0].length;

  for (let index = 0; index < objects.length; index++) {
    offsets.push(length);
    const object = Buffer.isBuffer(objects[index])
      ? objects[index]
      : Buffer.from(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`, "ascii");
    chunks.push(object);
    length += object.length;
  }

  const xrefOffset = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "ascii"));
  return Buffer.concat(chunks);
}

function streamObject(dictionary, data) {
  return Buffer.concat([
    Buffer.from(`${dictionary.replace(/>>$/, "")} /Length ${data.length} >>\nstream\n`, "ascii"),
    data,
    Buffer.from("\nendstream\nendobj\n", "ascii"),
  ]);
}

/** Creates a tiny deterministic multi-page PDF for FR-09 tests. */
export const FR09_FONT_TEST_REGIONS = Object.freeze({
  greekAlpha: { pageNumber: 1, minX: 108, minY: 586, maxX: 130, maxY: 605 },
  mathSigma: { pageNumber: 1, minX: 143, minY: 586, maxX: 166, maxY: 605 },
  standardLatin: { pageNumber: 2, minX: 90, minY: 531, maxX: 150, maxY: 546 },
  fallbackLatin: { pageNumber: 2, minX: 300, minY: 531, maxX: 380, maxY: 546 },
  scientificNotation: { pageNumber: 2, minX: 405, minY: 511, maxX: 475, maxY: 526 },
});
export const FR09_PDF_PAGE_HEIGHT = 792;

export function createFr09FixturePdf({ greekFontName = "Symbol" } = {}) {
  if (!["Symbol", "Helvetica"].includes(greekFontName)) {
    throw new TypeError("greekFontName must be one of the supported fixture font names");
  }
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "fr09-pdf-fixture-"));
  const pdfPath = path.join(fixtureDir, "fr09-regression-fixture.pdf");

  try {
  const chartPixels = makeImagePixels(160, 80, (x, y) => {
    if (x < 4 || y < 4 || x >= 156 || y >= 76) return [35, 65, 105];
    if ((x > 28 && x < 48 && y > 42) || (x > 67 && x < 87 && y > 27) || (x > 106 && x < 126 && y > 12)) {
      return [90, 150, 205];
    }
    if (y % 16 === 0 || x % 32 === 0) return [220, 230, 238];
    return [250, 252, 255];
  });
  const coverPixels = makeImagePixels(96, 128, (x, y) =>
    ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? [45, 75, 115] : [220, 232, 245])
  );

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [8 0 R 10 0 R 12 0 R 14 0 R] /Count 4 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    // Explicit glyph-name differences keep the test bytes mapped to alpha/Sigma
    // for either Symbol or Helvetica font rendering paths.
    `<< /Type /Font /Subtype /Type1 /BaseFont /${greekFontName} /Encoding << /Type /Encoding /Differences [ 97 /alpha 83 /Sigma ] >> >>`,
    Buffer.concat([
      Buffer.from("5 0 obj\n", "ascii"),
      streamObject("<< /Type /XObject /Subtype /Image /Width 160 /Height 80 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode >>", chartPixels),
    ]),
    Buffer.concat([
      Buffer.from("6 0 obj\n", "ascii"),
      streamObject("<< /Type /XObject /Subtype /Image /Width 96 /Height 128 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode >>", coverPixels),
    ]),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Fr09UnembeddedFallback >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 7 0 R >> /XObject << /Im1 5 0 R /Cover 6 0 R >> >> /Contents 9 0 R >>",
    null,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 7 0 R >> /XObject << /Im1 5 0 R /Cover 6 0 R >> >> /Contents 11 0 R >>",
    null,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 7 0 R >> /XObject << /Im1 5 0 R /Cover 6 0 R >> >> /Contents 13 0 R >>",
    null,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 7 0 R >> /XObject << /Im1 5 0 R /Cover 6 0 R >> >> /Contents 15 0 R >>",
    null,
  ];

  const page1 = [
    "BT /F1 11 Tf 54 520 Td (Figure 1: Left column vector diagram.) Tj ET",
    "BT /F1 11 Tf 326 520 Td (Figure 2: Right column chart.) Tj ET",
    "BT /F1 10 Tf 54 480 Td (Nearby prose remains outside the figure.) Tj ET",
    "BT /F1 10 Tf 326 480 Td (Second column prose stays separate.) Tj ET",
    "BT /F2 14 Tf 112 590 Td (a) Tj ET",
    "BT /F2 14 Tf 147 590 Td (S) Tj ET",
    "q 1.2 w 70 575 m 125 640 l 190 575 l S 70 575 m 190 575 l S Q",
    "q 1.2 w 350 575 m 350 640 l 555 640 l S 350 575 m 555 575 l S Q",
    "q 0.7 w 375 575 28 56 re f 425 575 28 82 re f 475 575 28 108 re f Q",
  ].join("\n");
  const page2 = [
    "BT /F1 11 Tf 72 570 Td (Table 1: Synthetic measurements.) Tj ET",
    "BT /F1 9 Tf 90 535 Td (Method A      12.5      0.01) Tj ET",
    "BT /F1 9 Tf 90 515 Td (Method B      15.0      0.03) Tj ET",
    "BT /F3 12 Tf 300 535 Td (Fallback) Tj ET",
    "BT /F1 10 Tf 405 515 Td (1.25E-4) Tj ET",
    "q 0.8 w 72 550 m 520 550 l S 72 500 m 520 500 l S 72 480 m 520 480 l S Q",
  ].join("\n");
  const page3 = [
    "q 220 0 0 140 100 500 cm /Im1 Do Q",
    "BT /F1 11 Tf 100 475 Td (Figure 3: Embedded raster chart.) Tj ET",
    "BT /F1 9 Tf 100 450 Td (Scientific notation 1.25E-4 and Greek alpha a.) Tj ET",
  ].join("\n");
  const page4 = "q 612 0 0 792 0 0 cm /Cover Do Q";

  for (const [objectNumber, content] of [[9, page1], [11, page2], [13, page3], [15, page4]]) {
    objects[objectNumber - 1] = Buffer.concat([
      Buffer.from(`${objectNumber} 0 obj\n`, "ascii"),
      streamObject("<<", Buffer.from(content, "ascii")),
    ]);
  }

  fs.writeFileSync(pdfPath, makePdf(objects));
  return {
    directory: fixtureDir,
    filePath: pdfPath,
    cleanup() {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    },
  };
  } catch (error) {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    throw error;
  }
}

/** Creates one high-resolution raster figure whose image object exactly matches its figure region. */
export function createFr09NativeRasterFigurePdf() {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "fr09-native-figure-"));
  const pdfPath = path.join(fixtureDir, "fr09-native-raster-figure.pdf");

  try {
    const pixels = makeImagePixels(640, 320, (x, y) => {
      if (x < 5 || y < 5 || x >= 635 || y >= 315) return [30, 50, 80];
      if (Math.abs(y - (80 + Math.sin(x / 45) * 42)) < 5) return [205, 45, 50];
      if (x % 80 === 0 || y % 64 === 0) return [218, 225, 232];
      return [252, 252, 250];
    });
    const content = [
      "q 200 0 0 100 200 500 cm /Raster Do Q",
      "BT /F1 11 Tf 200 475 Td (Figure 1: Native raster plot.) Tj ET",
    ].join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R >> /XObject << /Raster 5 0 R >> >> /Contents 4 0 R >>",
      Buffer.concat([
        Buffer.from("4 0 obj\n", "ascii"),
        streamObject("<<", Buffer.from(content, "ascii")),
      ]),
      Buffer.concat([
        Buffer.from("5 0 obj\n", "ascii"),
        streamObject("<< /Type /XObject /Subtype /Image /Width 640 /Height 320 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode >>", pixels),
      ]),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ];
    fs.writeFileSync(pdfPath, makePdf(objects));
    return {
      directory: fixtureDir,
      filePath: pdfPath,
      cleanup() {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    throw error;
  }
}
