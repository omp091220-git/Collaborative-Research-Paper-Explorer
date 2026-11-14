/**
 * paper.service.js
 *
 * Business logic for paper management.
 *
 * Responsibilities:
 *   - arXiv ID parsing and validation
 *   - arXiv PDF download
 *   - arXiv metadata fetching (title, abstract, authors, doi, publicationYear)
 *   - Manual-upload metadata validation
 *   - Safe file deletion helper
 *
 * The helpers parseArxivId, downloadArxivPdf, fetchArxivMetadata, and
 * safeUnlink were originally defined inline in paper.routes.js (FR-06).
 * They are moved here verbatim and then extended for FR-07 (doi, year).
 * The routes file now imports them from this module.
 *
 * NOTE on title/authors/abstract for manual uploads:
 *   FR-07 does not require automatic extraction of metadata from uploaded PDF
 *   files. The existing approach — client-supplied title, authors, abstract —
 *   is retained for /upload. Automatic PDF parsing would require a new
 *   dependency (e.g. pdf-parse) and is out of scope for this feature.
 *   The fields are supplied and validated by the caller, not invented here.
 */

import fs from "node:fs";
import https from "node:https";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";

const MAX_FILE_SIZE = 31_457_280; // 30 MiB

// ─── Helper: delete a file safely (best-effort, ignore errors) ───────────────
export function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors — the upload directory is managed separately.
  }
}

// ─── Parse and normalise an arXiv identifier ─────────────────────────────────
// Accepts bare IDs ("2301.00001", "2301.00001v2") and full arXiv URLs.
export function parseArxivId(input) {
  if (!input || typeof input !== "string") return null;
  const cleaned = input.trim();
  const idMatch = cleaned.match(
    /(?:arxiv\.org\/(?:abs|pdf)\/)?([0-9]{4}\.[0-9]{4,5}(?:v\d+)?|[a-z\-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)$/i
  );
  return idMatch ? idMatch[1] : null;
}

// ─── Helper: decode XML entities ─────────────────────────────────────────────
export function decodeXmlEntities(str) {
  if (!str || typeof str !== "string") return str;
  return str
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        const code = parseInt(dec, 10);
        return String.fromCodePoint(code);
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        const code = parseInt(hex, 16);
        return String.fromCodePoint(code);
      } catch {
        return _;
      }
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// ─── Helper: normalize and validate DOI values ──────────────────────────────
export function normalizeDoi(input) {
  if (!input || typeof input !== "string") return null;
  let cleaned = input.trim();
  if (!cleaned) return null;

  // Strip URL prefixes: https://doi.org/, http://doi.org/, https://dx.doi.org/, http://dx.doi.org/
  cleaned = cleaned.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");

  // Strip URI prefixes: doi: or DOI:
  cleaned = cleaned.replace(/^doi:\s*/i, "");

  cleaned = cleaned.trim();
  return cleaned || null;
}

export function isValidDoi(doi) {
  if (!doi || typeof doi !== "string") return false;
  if (doi.length > 255) return false;
  // A standard DOI begins with directory indicator "10." followed by registrant code (numbers and optional dots),
  // a slash, and the suffix. No unencoded whitespace is allowed.
  return /^10\.\d+(?:\.\d+)*\/\S+$/.test(doi);
}

// ─── Helper: check if a host is private or disallowed (SSRF protection) ─────
function isDisallowedHost(hostname) {
  if (!hostname || typeof hostname !== "string") return true;
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "[::]" ||
    host === "::1" ||
    host === "[::1]"
  ) {
    return true;
  }

  // IPv4 checks
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const b0 = parseInt(ipv4Match[1], 10);
    const b1 = parseInt(ipv4Match[2], 10);
    if (b0 === 127) return true; // loopback
    if (b0 === 10) return true;  // private
    if (b0 === 169 && b1 === 254) return true; // link-local
    if (b0 === 192 && b1 === 168) return true; // private
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // private
    if (b0 === 0) return true;
  }

  // IPv6 unique local (fc00::/7) or link-local (fe80::/10)
  if (
    host.startsWith("fe80:") ||
    host.startsWith("[fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("[fc") ||
    host.startsWith("fd") ||
    host.startsWith("[fd")
  ) {
    return true;
  }

  return false;
}

// ─── Download an arXiv PDF to a local path ───────────────────────────────────
//
// Redirect handling notes:
//   arXiv may return relative Location headers such as "/pdf/2610.30421".
//   doRequest() resolves every Location value against the URL that issued the
//   redirect using the standard URL API.  This correctly handles:
//     - Relative paths  ("/pdf/...")      → resolved against current origin
//     - Absolute URLs   ("https://...")   → used as-is
//   After resolution:
//     - Protocol is checked: only http: and https: are permitted.
//     - HTTPS to HTTP downgrade is disallowed to prevent insecure transport.
//     - Private and loopback hosts (localhost, 127.0.0.1, 10.x, etc.) are
//       disallowed to prevent SSRF while allowing legitimate public hosts.
//     - Partial and failed downloads are consistently cleaned up.
export async function downloadArxivPdf(arxivId, destPath) {
  const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
  return new Promise((resolve, reject) => {
    let fileStream = null;

    const cleanupAndReject = (err, statusCode) => {
      if (fileStream) {
        try {
          fileStream.destroy();
        } catch {
          // ignore stream close errors
        }
      }
      safeUnlink(destPath);
      reject(statusCode ? Object.assign(err, { statusCode }) : err);
    };

    const doRequest = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        return cleanupAndReject(
          new Error("Too many redirects while downloading PDF.")
        );
      }
      const mod = currentUrl.startsWith("https") ? https : http;
      const req = mod.get(currentUrl, { timeout: 30_000 }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          const rawLocation = res.headers["location"];
          res.resume();
          if (!rawLocation) {
            return cleanupAndReject(
              new Error("Redirect without location header.")
            );
          }

          let resolvedUrl;
          try {
            resolvedUrl = new URL(rawLocation, currentUrl).href;
          } catch {
            return cleanupAndReject(
              new Error(`Invalid redirect location: ${rawLocation}`),
              502
            );
          }

          const parsed = new URL(resolvedUrl);
          const protocol = parsed.protocol;
          if (protocol !== "http:" && protocol !== "https:") {
            return cleanupAndReject(
              new Error(`Unsafe redirect protocol: ${protocol}`),
              502
            );
          }

          if (currentUrl.startsWith("https:") && protocol === "http:") {
            return cleanupAndReject(
              new Error("Unsafe protocol downgrade from HTTPS to HTTP."),
              502
            );
          }

          if (isDisallowedHost(parsed.hostname)) {
            return cleanupAndReject(
              new Error(`Disallowed redirect destination: ${parsed.hostname}`),
              502
            );
          }

          return doRequest(resolvedUrl, redirectCount + 1);
        }

        if (res.statusCode === 404) {
          res.resume();
          return cleanupAndReject(new Error("PDF not found on arXiv."), 404);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return cleanupAndReject(
            new Error(`arXiv responded with status ${res.statusCode}.`),
            502
          );
        }

        let downloaded = 0;
        fileStream = fs.createWriteStream(destPath);
        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (downloaded > MAX_FILE_SIZE) {
            req.destroy();
            cleanupAndReject(
              new Error("PDF exceeds the 30 MiB size limit."),
              413
            );
          }
        });
        res.on("error", (err) => cleanupAndReject(err, 502));
        res.pipe(fileStream);
        fileStream.on("finish", () => resolve(downloaded));
        fileStream.on("error", (err) => cleanupAndReject(err));
      });

      req.on("error", (err) => cleanupAndReject(err, 503));
      req.on("timeout", () => {
        req.destroy();
        cleanupAndReject(
          new Error("Request timed out while downloading PDF from arXiv."),
          504
        );
      });
    };

    doRequest(pdfUrl);
  });
}

// ─── Fetch paper metadata from the arXiv Atom API ────────────────────────────
// FR-06 returned: { title, abstract, authors }
// FR-07 extends this to also return: { doi, publicationYear }
//
// The arXiv Atom feed includes:
//   <title>       — paper title (second <title> in feed; first is feed name)
//   <summary>     — abstract
//   <author>      — one per author, contains <name>
//   <published>   — ISO 8601 datetime, e.g. "2017-06-12T17:57:34Z" (FR-07)
//   <arxiv:doi>   — DOI when assigned by a publisher (FR-07, not always present)
//
export async function fetchArxivMetadata(arxivId) {
  const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}&max_results=1`;
  return new Promise((resolve, reject) => {
    https
      .get(apiUrl, { timeout: 15_000 }, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(
              Object.assign(
                new Error(`arXiv API error: ${res.statusCode}`),
                { statusCode: 502 }
              )
            );
          }

          // Check total results
          const totalMatch = data.match(
            /<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/
          );
          const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
          if (total === 0) {
            return reject(
              Object.assign(
                new Error(`No paper found for arXiv ID: ${arxivId}`),
                { statusCode: 404 }
              )
            );
          }

          // ── Title ───────────────────────────────────────────────────────────
          const entryMatch = data.match(/<entry[^>]*>([\s\S]*?)<\/entry>/);
          let paperTitle = null;
          if (entryMatch) {
            const entryTitleMatch = entryMatch[1].match(
              /<title[^>]*>([\s\S]*?)<\/title>/
            );
            if (entryTitleMatch) {
              paperTitle = entryTitleMatch[1].trim().replace(/\s+/g, " ");
            }
          }
          if (!paperTitle) {
            const titles = [
              ...data.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/g),
            ];
            paperTitle = (titles[1] || titles[0])
              ? (titles[1] || titles[0])[1].trim().replace(/\s+/g, " ")
              : arxivId;
          }
          paperTitle = decodeXmlEntities(paperTitle);

          // ── Abstract ────────────────────────────────────────────────────────
          const abstractMatch = data.match(/<summary>([\s\S]*?)<\/summary>/);
          const abstract = abstractMatch
            ? decodeXmlEntities(abstractMatch[1].trim().replace(/\s+/g, " "))
            : null;

          // ── Authors ─────────────────────────────────────────────────────────
          const authorMatches = [
            ...data.matchAll(/<author>([\s\S]*?)<\/author>/g),
          ];
          const authors = authorMatches
            .map((m) => {
              const nameMatch = m[1].match(/<name>([\s\S]*?)<\/name>/);
              return nameMatch ? decodeXmlEntities(nameMatch[1].trim()) : "";
            })
            .filter(Boolean);

          // ── Publication year (FR-07) ─────────────────────────────────────────
          const publishedMatch = data.match(
            /<published[^>]*>([\s\S]*?)<\/published>/
          );
          let publicationYear = null;
          if (publishedMatch) {
            const parsed = parseInt(
              publishedMatch[1].trim().substring(0, 4),
              10
            );
            if (!isNaN(parsed) && parsed >= 1665 && parsed <= 2100) {
              publicationYear = parsed;
            }
          }

          // ── DOI (FR-07) ─────────────────────────────────────────────────────
          const doiMatch = data.match(
            /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/
          );
          let doi = null;
          if (doiMatch) {
            const rawDoi = decodeXmlEntities(doiMatch[1].trim());
            const candidate = normalizeDoi(rawDoi);
            if (isValidDoi(candidate)) {
              doi = candidate;
            }
          }

          resolve({
            title: paperTitle,
            abstract,
            authors: authors.length > 0 ? authors : ["Unknown Author"],
            publicationYear,
            doi,
          });
        });
        res.on("error", (err) =>
          reject(Object.assign(err, { statusCode: 503 }))
        );
      })
      .on("error", (err) =>
        reject(Object.assign(err, { statusCode: 503 }))
      )
      .on("timeout", function () {
        this.destroy();
        reject(
          Object.assign(
            new Error("Timed out fetching arXiv metadata."),
            { statusCode: 504 }
          )
        );
      });
  });
}

// ─── Validate manual-upload metadata ─────────────────────────────────────────
// Returns { valid: true, data } or { valid: false, error, status }.
//
// Required: title (non-empty string), authors (non-empty array of non-empty strings).
// Optional: abstract (string|null), doi (string|null), publicationYear (integer|null).
//
// Preserves existing input formats:
//   - Array of strings
//   - JSON-encoded array of strings
//   - Comma-separated author string
//
export function validateUploadMetadata(body) {
  const { title, abstract, authors, doi, publication_year } = body;

  // ── Title ──────────────────────────────────────────────────────────────────
  if (!title || typeof title !== "string" || !title.trim()) {
    return { valid: false, error: "Paper title is required.", status: 400 };
  }

  // ── Authors ─────────────────────────────────────────────────────────────────
  let list = null;
  if (Array.isArray(authors)) {
    list = authors;
  } else if (typeof authors === "string") {
    const trimmed = authors.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          list = parsed;
        }
      } catch {
        // Fall back to comma-separated
      }
    }
    if (list === null) {
      list = trimmed ? trimmed.split(",").map((s) => s.trim()) : [];
    }
  }

  if (!Array.isArray(list) || list.length === 0) {
    return { valid: false, error: "At least one author is required.", status: 400 };
  }

  const cleanedAuthors = [];
  for (const item of list) {
    if (typeof item !== "string" || !item.trim()) {
      return {
        valid: false,
        error: "All authors must be non-empty strings.",
        status: 400,
      };
    }
    cleanedAuthors.push(item.trim());
  }

  if (cleanedAuthors.length === 0) {
    return { valid: false, error: "At least one author is required.", status: 400 };
  }

  // ── DOI (FR-07, optional) ─────────────────────────────────────────────────
  let normalizedDoi = null;
  if (doi !== undefined && doi !== null && doi !== "") {
    if (typeof doi !== "string") {
      return { valid: false, error: "DOI must be a string.", status: 400 };
    }
    const trimmed = doi.trim();
    if (trimmed !== "") {
      normalizedDoi = normalizeDoi(trimmed);
      if (!isValidDoi(normalizedDoi)) {
        return {
          valid: false,
          error: "Invalid DOI format. Expected format: 10.xxxx/yyyy",
          status: 400,
        };
      }
    }
  }

  // ── Publication year (FR-07, optional) ────────────────────────────────────
  let normalizedYear = null;
  if (
    publication_year !== undefined &&
    publication_year !== null &&
    publication_year !== ""
  ) {
    const yr = Number(publication_year);
    if (!Number.isInteger(yr) || yr < 1665 || yr > 2100) {
      return {
        valid: false,
        error:
          "publication_year must be an integer between 1665 and 2100.",
        status: 400,
      };
    }
    normalizedYear = yr;
  }

  return {
    valid: true,
    data: {
      title: title.trim(),
      abstract: abstract?.trim() || null,
      authors: cleanedAuthors,
      doi: normalizedDoi,
      publicationYear: normalizedYear,
    },
  };
}
