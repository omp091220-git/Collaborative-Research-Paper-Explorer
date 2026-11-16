import React, { useMemo } from 'react';

/**
 * LaTeX symbol mappings for clean fallback rendering when KaTeX is not yet loaded.
 */
const LATEX_SYMBOLS = {
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\epsilon': 'ε',
  '\\zeta': 'ζ',
  '\\eta': 'η',
  '\\theta': 'θ',
  '\\iota': 'ι',
  '\\kappa': 'κ',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\nu': 'ν',
  '\\xi': 'ξ',
  '\\pi': 'π',
  '\\rho': 'ρ',
  '\\sigma': 'σ',
  '\\tau': 'τ',
  '\\upsilon': 'υ',
  '\\phi': 'φ',
  '\\chi': 'χ',
  '\\psi': 'ψ',
  '\\omega': 'ω',
  '\\Gamma': 'Γ',
  '\\Delta': 'Δ',
  '\\Theta': 'Θ',
  '\\Lambda': 'Λ',
  '\\Xi': 'Ξ',
  '\\Pi': 'Π',
  '\\Sigma': 'Σ',
  '\\Upsilon': 'Υ',
  '\\Phi': 'Φ',
  '\\Psi': 'Ψ',
  '\\Omega': 'Ω',
  '\\times': '×',
  '\\div': '÷',
  '\\pm': '±',
  '\\mp': '∓',
  '\\cdot': '·',
  '\\leq': '≤',
  '\\le': '≤',
  '\\geq': '≥',
  '\\ge': '≥',
  '\\neq': '≠',
  '\\ne': '≠',
  '\\approx': '≈',
  '\\sim': '∼',
  '\\equiv': '≡',
  '\\infty': '∞',
  '\\partial': '∂',
  '\\nabla': '∇',
  '\\int': '∫',
  '\\iint': '∬',
  '\\iiint': '∭',
  '\\oint': '∮',
  '\\sum': '∑',
  '\\prod': '∏',
  '\\coprod': '∐',
  '\\in': '∈',
  '\\notin': '∉',
  '\\subset': '⊂',
  '\\supset': '⊃',
  '\\subseteq': '⊆',
  '\\supseteq': '⊇',
  '\\cup': '∪',
  '\\cap': '∩',
  '\\vee': '∨',
  '\\wedge': '∧',
  '\\neg': '¬',
  '\\forall': '∀',
  '\\exists': '∃',
  '\\nexists': '∄',
  '\\rightarrow': '→',
  '\\to': '→',
  '\\leftarrow': '←',
  '\\Rightarrow': '⇒',
  '\\Leftarrow': '⇐',
  '\\Leftrightarrow': '⇔',
  '\\iff': '⟺',
  '\\circ': '∘',
  '\\bullet': '•',
};

/**
 * Fallback LaTeX parser that handles fractions, superscripts, subscripts and Greek letters.
 */
function renderFallbackMath(latexStr) {
  let s = latexStr.trim();

  // Replace symbols
  for (const [sym, rep] of Object.entries(LATEX_SYMBOLS)) {
    s = s.split(sym).join(rep);
  }

  // Handle \frac{a}{b} -> (a / b) with balanced curly braces
  let idx = 0;
  while ((idx = s.indexOf('\\frac{', idx)) !== -1) {
    const numStart = idx + 6;
    let depth = 1;
    let numEnd = numStart;
    while (numEnd < s.length && depth > 0) {
      if (s[numEnd] === '{') depth++;
      else if (s[numEnd] === '}') depth--;
      numEnd++;
    }
    if (depth !== 0 || s[numEnd] !== '{') {
      idx += 6;
      continue;
    }
    const denStart = numEnd + 1;
    depth = 1;
    let denEnd = denStart;
    while (denEnd < s.length && depth > 0) {
      if (s[denEnd] === '{') depth++;
      else if (s[denEnd] === '}') depth--;
      denEnd++;
    }
    if (depth !== 0) {
      idx += 6;
      continue;
    }

    const numerator = s.slice(numStart, numEnd - 1);
    const denominator = s.slice(denStart, denEnd - 1);
    const replacement = `(${numerator} / ${denominator})`;
    s = s.slice(0, idx) + replacement + s.slice(denEnd);
    idx += replacement.length;
  }

  // Handle \sqrt{a} -> √(a)
  s = s.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');

  // Handle \mathbf{a}, \mathit{a}, \text{a}
  s = s.replace(/\\(mathbf|mathit|text|mathrm)\{([^}]+)\}/g, '$2');

  // Parse superscripts and subscripts into HTML
  // x^{abc} -> x<sup>abc</sup>
  s = s.replace(/\^{([^}]+)}/g, '<sup>$1</sup>');
  // x^a -> x<sup>a</sup>
  s = s.replace(/\^([0-9a-zA-Z+-])/g, '<sup>$1</sup>');
  // x_{abc} -> x<sub>abc</sub>
  s = s.replace(/_{([^}]+)}/g, '<sub>$1</sub>');
  // x_a -> x<sub>a</sub>
  s = s.replace(/_([0-9a-zA-Z+-])/g, '<sub>$1</sub>');

  return s;
}

/**
 * Renders a single math expression using KaTeX if available, or structured fallback HTML.
 */
function MathExpression({ math, displayMode = false }) {
  const renderedHtml = useMemo(() => {
    if (typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
      try {
        return window.katex.renderToString(math, {
          displayMode,
          throwOnError: false,
          output: 'htmlAndMathml',
        });
      } catch (e) {
        console.warn('KaTeX render error:', e);
      }
    }
    return null;
  }, [math, displayMode]);

  if (renderedHtml) {
    if (displayMode) {
      return (
        <div
          className="my-2.5 p-2.5 rounded-lg bg-slate-950/70 border border-indigo-900/40 text-center overflow-x-auto text-indigo-100"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      );
    }
    return (
      <span
        className="inline-block px-1 py-0.5 mx-0.5 rounded bg-indigo-950/50 border border-indigo-800/40 text-indigo-200"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    );
  }

  // Fallback rendering
  const fallbackHtml = renderFallbackMath(math);

  if (displayMode) {
    return (
      <div className="my-2.5 p-2 rounded-lg bg-slate-950/70 border border-amber-500/30 text-amber-200 font-serif text-sm text-center overflow-x-auto select-text">
        <span dangerouslySetInnerHTML={{ __html: fallbackHtml }} />
      </div>
    );
  }

  return (
    <span
      className="inline-block px-1.5 py-0.2 mx-0.5 rounded bg-amber-950/30 border border-amber-500/30 font-serif italic text-amber-200 text-xs select-text"
      dangerouslySetInnerHTML={{ __html: fallbackHtml }}
    />
  );
}

/**
 * Inline text parser that splits string into Markdown tokens & LaTeX math ($...$).
 */
function renderInlineContent(text, keyPrefix = '') {
  if (!text) return null;

  // Split tokens by inline math: $...$ or \(...\)
  // Be careful with escaped \$
  const mathRegex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$(?!\$)((?:\\.|[^\\$])+?)\$|\\\(((?:\\.|[^\\)])+?)\\\))/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = mathRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        val: text.slice(lastIndex, match.index),
      });
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith('$$') && matchedStr.endsWith('$$')) {
      parts.push({
        type: 'block-math',
        val: matchedStr.slice(2, -2),
      });
    } else if (matchedStr.startsWith('\\[') && matchedStr.endsWith('\\]')) {
      parts.push({
        type: 'block-math',
        val: matchedStr.slice(2, -2),
      });
    } else if (matchedStr.startsWith('$') && matchedStr.endsWith('$')) {
      parts.push({
        type: 'inline-math',
        val: match[2] || matchedStr.slice(1, -1),
      });
    } else if (matchedStr.startsWith('\\(') && matchedStr.endsWith('\\)')) {
      parts.push({
        type: 'inline-math',
        val: match[3] || matchedStr.slice(2, -2),
      });
    }

    lastIndex = match.index + matchedStr.length;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      val: text.slice(lastIndex),
    });
  }

  return parts.map((part, pIdx) => {
    const k = `${keyPrefix}-p-${pIdx}`;
    if (part.type === 'block-math') {
      return <MathExpression key={k} math={part.val} displayMode={true} />;
    }
    if (part.type === 'inline-math') {
      return <MathExpression key={k} math={part.val} displayMode={false} />;
    }

    // Text token: parse inline markdown (bold, italic, code, links, strikethrough)
    return <span key={k}>{renderTextMarkdown(part.val, k)}</span>;
  });
}

/**
 * Parses bold, italic, code, link, and strikethrough inside a plain text fragment.
 */
function renderTextMarkdown(text, keyPrefix) {
  // Regex pattern for inline markdown elements:
  // 1: `code`
  // 2: [text](url)
  // 3: **bold** or __bold__
  // 4: *italic* or _italic_
  // 5: ~~strike~~
  const inlineRegex = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~)/g;

  const elements = [];
  let lastIdx = 0;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      elements.push(text.slice(lastIdx, match.index));
    }

    const token = match[0];
    const itemKey = `${keyPrefix}-t-${match.index}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      elements.push(
        <code
          key={itemKey}
          className="px-1.5 py-0.5 rounded bg-slate-800 text-rose-300 font-mono text-[11px] border border-slate-700/80"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[') && token.includes('](')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        elements.push(
          <a
            key={itemKey}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        elements.push(token);
      }
    } else if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      elements.push(
        <strong key={itemKey} className="font-bold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      elements.push(
        <em key={itemKey} className="italic text-slate-200">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      elements.push(
        <span key={itemKey} className="line-through text-slate-500">
          {token.slice(2, -2)}
        </span>
      );
    } else {
      elements.push(token);
    }

    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    elements.push(text.slice(lastIdx));
  }

  return elements;
}

/**
 * Main Markdown and LaTeX Math Renderer Component for FR-15.
 */
export default function MarkdownMathRenderer({
  content = '',
  className = '',
  inline = false,
}) {
  const blocks = useMemo(() => {
    if (!content || typeof content !== 'string') return [];

    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const result = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeBuffer = [];

    let inBlockMath = false;
    let mathBuffer = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // ── Check multi-line code blocks ```
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLanguage = line.trim().slice(3).trim();
          codeBuffer = [];
        } else {
          inCodeBlock = false;
          result.push({
            type: 'code-block',
            lang: codeLanguage,
            code: codeBuffer.join('\n'),
          });
          codeBuffer = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        continue;
      }

      // ── Check multi-line display math $$
      if (line.trim() === '$$') {
        if (!inBlockMath) {
          inBlockMath = true;
          mathBuffer = [];
        } else {
          inBlockMath = false;
          result.push({
            type: 'display-math',
            math: mathBuffer.join('\n'),
          });
          mathBuffer = [];
        }
        continue;
      }

      if (inBlockMath) {
        mathBuffer.push(line);
        continue;
      }

      // ── Standalone single-line $$...$$
      const trimmed = line.trim();
      if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 2) {
        result.push({
          type: 'display-math',
          math: trimmed.slice(2, -2).trim(),
        });
        continue;
      }

      // ── Headings
      if (line.startsWith('### ')) {
        result.push({ type: 'h3', text: line.slice(4) });
        continue;
      }
      if (line.startsWith('## ')) {
        result.push({ type: 'h2', text: line.slice(3) });
        continue;
      }
      if (line.startsWith('# ')) {
        result.push({ type: 'h1', text: line.slice(2) });
        continue;
      }

      // ── Blockquotes
      if (line.startsWith('> ')) {
        result.push({ type: 'blockquote', text: line.slice(2) });
        continue;
      }

      // ── Unordered lists
      if (line.match(/^(\*|-|\+)\s+/)) {
        result.push({ type: 'list-item', text: line.replace(/^(\*|-|\+)\s+/, '') });
        continue;
      }

      // ── Ordered lists
      if (line.match(/^\d+\.\s+/)) {
        result.push({ type: 'ordered-item', text: line.replace(/^\d+\.\s+/, '') });
        continue;
      }

      // ── Empty line / paragraph break
      if (!trimmed) {
        result.push({ type: 'break' });
        continue;
      }

      // ── Normal text paragraph
      result.push({ type: 'paragraph', text: line });
    }

    // Flush unclosed buffers gracefully
    if (inCodeBlock && codeBuffer.length > 0) {
      result.push({ type: 'code-block', lang: codeLanguage, code: codeBuffer.join('\n') });
    }
    if (inBlockMath && mathBuffer.length > 0) {
      result.push({ type: 'display-math', math: mathBuffer.join('\n') });
    }

    return result;
  }, [content]);

  if (!content) {
    return <span className="text-slate-500 italic text-xs">No remarks</span>;
  }

  if (inline) {
    return (
      <span className={`leading-relaxed ${className}`}>
        {renderInlineContent(content, 'inline-root')}
      </span>
    );
  }

  return (
    <div className={`space-y-1.5 text-xs text-slate-200 leading-relaxed font-sans ${className}`}>
      {blocks.map((b, idx) => {
        const k = `block-${idx}`;

        switch (b.type) {
          case 'h1':
            return (
              <h1 key={k} className="text-sm font-bold text-white mt-2 mb-1 border-b border-slate-700/80 pb-1">
                {renderInlineContent(b.text, k)}
              </h1>
            );
          case 'h2':
            return (
              <h2 key={k} className="text-xs font-bold text-slate-100 mt-2 mb-0.5">
                {renderInlineContent(b.text, k)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={k} className="text-xs font-semibold text-indigo-300 mt-1 mb-0.5">
                {renderInlineContent(b.text, k)}
              </h3>
            );
          case 'display-math':
            return <MathExpression key={k} math={b.math} displayMode={true} />;
          case 'code-block':
            return (
              <pre
                key={k}
                className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto my-1.5"
              >
                <code>{b.code}</code>
              </pre>
            );
          case 'blockquote':
            return (
              <blockquote
                key={k}
                className="pl-2.5 py-0.5 my-1 border-l-2 border-indigo-400 bg-indigo-950/20 text-slate-300 italic text-[11px] rounded-r"
              >
                {renderInlineContent(b.text, k)}
              </blockquote>
            );
          case 'list-item':
            return (
              <div key={k} className="flex items-start gap-1.5 pl-1 my-0.5">
                <span className="text-indigo-400 mt-0.5 select-none">•</span>
                <span className="flex-1">{renderInlineContent(b.text, k)}</span>
              </div>
            );
          case 'ordered-item':
            return (
              <div key={k} className="flex items-start gap-1.5 pl-1 my-0.5">
                <span className="text-indigo-400 font-mono text-[10px] mt-0.5 select-none">▶</span>
                <span className="flex-1">{renderInlineContent(b.text, k)}</span>
              </div>
            );
          case 'break':
            return <div key={k} className="h-1" />;
          case 'paragraph':
          default:
            return (
              <p key={k} className="leading-relaxed whitespace-pre-wrap">
                {renderInlineContent(b.text, k)}
              </p>
            );
        }
      })}
    </div>
  );
}
