// Test-only helper: builds a small valid text PDF in memory without external
// fixtures. Coordinates use PDF user space (origin bottom-left).

/**
 * @param {Array<{rotate?:number, lines:Array<{text?:string,x?:number,y:number,size?:number,segments?:Array<{text:string,x:number,size?:number}>}>}>} pages
 * @param {{width?:number,height?:number}} [opts]
 * @returns {Buffer}
 */
export function buildTestPdf(pages, { width = 612, height = 792 } = {}) {
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;
  const catalog = add("");
  const pagesRoot = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const pageNumbers = pages.map((page) => {
    const ops = page.lines
      .flatMap((line) => {
        const segments = line.segments || [line];
        return segments.map((segment) => {
          const safe = (segment.text || "").replace(/([\\()])/g, "\\$1");
          return `BT /F1 ${segment.size ?? line.size ?? 12} Tf ${segment.x ?? line.x} ${line.y} Td (${safe}) Tj ET`;
        });
      })
      .join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`);
    const rotate = page.rotate ? ` /Rotate ${page.rotate}` : "";
    return add(
      `<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${width} ${height}]${rotate} ` +
        `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`
    );
  });

  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`;
  objects[pagesRoot - 1] =
    `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNumbers.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
