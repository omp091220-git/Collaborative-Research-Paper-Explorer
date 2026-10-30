// Pure passage-chunking helpers. Kept separate from Gemini SDK code so these
// functions can be tested without loading external AI/network dependencies.

function estimatePassageChars(passage) {
  return passage.text.length + passage.id.length + 32;
}

function splitLongPassage(passage, maxChars) {
  const limit = Math.max(1, Math.floor(maxChars));
  const fragments = [];
  let current = "";

  const flush = () => {
    if (current) fragments.push(current);
    current = "";
  };

  for (const token of passage.text.split(/(\s+)/).filter(Boolean)) {
    if (/^\s+$/.test(token)) {
      if (current && current.length < limit) current += " ";
      continue;
    }
    if (token.length > limit) {
      flush();
      for (let offset = 0; offset < token.length; offset += limit) {
        fragments.push(token.slice(offset, offset + limit));
      }
      continue;
    }
    if (current && current.length + token.length + 1 > limit) flush();
    current = current ? `${current} ${token}` : token;
  }
  flush();

  return fragments.map((text, index) => ({
    ...passage,
    id: `${passage.id}-part${index + 1}`,
    text,
  }));
}

export function chunkPassages(passages, maxInputChars) {
  const target = Math.max(1000, maxInputChars - 1000); // reserve prompt/schema overhead
  const chunks = [];
  let chunk = [];
  let size = 0;
  for (const original of passages) {
    const passageParts = estimatePassageChars(original) > target
      ? splitLongPassage(original, Math.max(200, target - original.id.length - 48))
      : [original];
    for (const passage of passageParts) {
      const cost = estimatePassageChars(passage);
      if (chunk.length && size + cost > target) {
        chunks.push(chunk);
        chunk = [];
        size = 0;
      }
      chunk.push(passage);
      size += cost;
    }
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

