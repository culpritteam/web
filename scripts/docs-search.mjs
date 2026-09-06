#!/usr/bin/env node
// Local, dependency-free retrieval over the project's Markdown knowledge base. No vector DB, no
// external service: this is a keyword/section index rebuilt in memory on every run (docs are
// small; there's nothing to cache).
//
// Design contract, so this stays swappable later without touching call sites:
//   1. `loadCorpus()`      -> Section[]   (read-only; never writes to any source doc)
//   2. `scoreSection(...)` -> number      (the ONLY function that knows how relevance is computed)
// If semantic/embedding search is ever wanted, replace `scoreSection` (and the tokenizer it uses)
// with an embedding-similarity lookup — `loadCorpus()` and the CLI/output layer don't need to
// change.
//
// Usage:
//   npm run docs:search -- "appointment workflow"
//   node scripts/docs-search.mjs "why postgres" --json --limit=5

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Default corpus: the curated knowledge base.
const DEFAULT_SOURCES = ['docs', 'PROJECT_SPEC.md'];

const HISTORY_SIGNAL_WORDS = new Set([
  'history', 'historical', 'old', 'previous', 'before', 'originally', 'replaced', 'removed',
  'superseded', 'deprecated', 'used to', 'formerly', 'past',
]);

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'of', 'to', 'in', 'on', 'for',
  'and', 'or', 'do', 'does', 'did', 'how', 'what', 'why', 'which', 'this', 'that', 'it', 'as',
  'with', 'by', 'at', 'from', 'should', 'currently', 'current',
]);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? []).filter((t) => t.length > 1);
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { body: raw, meta: {} };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w_]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { body: raw.slice(match[0].length), meta };
}

function splitSections(body, filePath) {
  const lines = body.split(/\r?\n/);
  const sections = [];
  let title = relative(ROOT, filePath);
  let current = { heading: title, level: 0, text: [] };
  let sawTitle = false;

  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      if (h[1].length === 1 && !sawTitle) {
        title = h[2].trim();
        sawTitle = true;
        current.heading = title;
        continue;
      }
      if (current.text.length) sections.push(current);
      current = { heading: h[2].trim(), level: h[1].length, text: [] };
    } else {
      current.text.push(line);
    }
  }
  if (current.text.length) sections.push(current);
  return { title, sections: sections.length ? sections : [{ heading: title, level: 0, text: body.split(/\r?\n/) }] };
}

function walkMarkdownFiles(startPath) {
  const abs = join(ROOT, startPath);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return [];
  }
  if (st.isFile()) return extname(abs) === '.md' ? [abs] : [];

  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(abs, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdownFiles(relative(ROOT, full)));
    else if (extname(entry.name) === '.md') out.push(full);
  }
  return out;
}

/** Read-only: builds the section index. Never writes to any source document. */
function loadCorpus(sourcePaths) {
  const sections = [];
  for (const source of sourcePaths) {
    for (const file of walkMarkdownFiles(source)) {
      const raw = readFileSync(file, 'utf8');
      const { body, meta } = parseFrontmatter(raw);
      const { title, sections: fileSections } = splitSections(body, file);
      const relPath = relative(ROOT, file).replace(/\\/g, '/');
      const status = meta.status ?? 'unspecified';
      for (const s of fileSections) {
        sections.push({
          path: relPath,
          docTitle: title,
          heading: s.heading,
          text: s.text.join('\n'),
          status,
          sourceOfTruth: meta.source_of_truth === 'true',
          lastUpdated: meta.last_updated ?? null,
        });
      }
    }
  }
  return sections;
}

/** The only function that knows how relevance is computed — swap this to change ranking behavior. */
function scoreSection(queryTokens, queryRaw, section, { historyIntent }) {
  const titleTokens = tokenize(section.docTitle);
  const headingTokens = tokenize(section.heading);
  const bodyTokens = tokenize(section.text);
  const bodyLower = section.text.toLowerCase();

  let score = 0;
  for (const term of queryTokens) {
    if (titleTokens.includes(term)) score += 6;
    if (headingTokens.includes(term)) score += 4;
    const occurrences = bodyTokens.filter((t) => t === term).length;
    score += Math.min(occurrences, 5) * 1.5;
  }
  // Exact phrase match anywhere is a strong signal.
  if (queryRaw.length > 3 && bodyLower.includes(queryRaw.toLowerCase())) score += 8;
  if (queryRaw.length > 3 && section.heading.toLowerCase().includes(queryRaw.toLowerCase())) score += 5;

  // Current-vs-historical prioritization (§8 of the retrieval spec this script implements).
  if (!historyIntent) {
    if (section.status === 'current') score *= 1.3;
    else if (section.status === 'deprecated') score *= 0.6;
    else if (section.status === 'historical') score *= 0.4;
  } else if (section.status === 'historical' || section.status === 'deprecated') {
    score *= 1.2; // an explicit history/why-was-X-replaced query should surface these more readily
  }
  if (section.sourceOfTruth) score *= 1.15; // ADRs

  return score;
}

function relevanceLabel(score, maxScore) {
  if (maxScore <= 0) return 'low';
  const ratio = score / maxScore;
  if (ratio > 0.66) return 'high';
  if (ratio > 0.33) return 'medium';
  return 'low';
}

function snippet(text, queryTokens, maxLen = 160) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();
  let hitAt = -1;
  for (const term of queryTokens) {
    const idx = lower.indexOf(term);
    if (idx !== -1 && (hitAt === -1 || idx < hitAt)) hitAt = idx;
  }
  const start = hitAt === -1 ? 0 : Math.max(0, hitAt - 40);
  const excerpt = clean.slice(start, start + maxLen).trim();
  return (start > 0 ? '…' : '') + excerpt + (start + maxLen < clean.length ? '…' : '');
}

function search(query, { limit = 8 } = {}) {
  const queryTokens = tokenize(query).filter((t) => !STOPWORDS.has(t));
  if (queryTokens.length === 0) return [];
  const historyIntent = tokenize(query).some((t) => HISTORY_SIGNAL_WORDS.has(t)) ||
    HISTORY_SIGNAL_WORDS.has(query.toLowerCase());

  const corpus = loadCorpus(DEFAULT_SOURCES);

  const scored = corpus
    .map((section) => ({ section, score: scoreSection(queryTokens, query, section, { historyIntent }) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const maxScore = scored.length ? scored[0].score : 0;
  return scored.map((r) => ({
    path: r.section.path,
    section: r.section.heading,
    status: r.section.status,
    relevance: relevanceLabel(r.score, maxScore),
    score: Math.round(r.score * 10) / 10,
    snippet: snippet(r.section.text, queryTokens),
  }));
}

function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const queryParts = args.filter((a) => !a.startsWith('--'));
  const query = queryParts.join(' ').trim();

  const limitFlag = [...flags].find((f) => f.startsWith('--limit='));
  const limit = limitFlag ? Number(limitFlag.split('=')[1]) || 8 : 8;
  const asJson = flags.has('--json');

  if (!query) {
    console.error('Usage: npm run docs:search -- "<query>" [--json] [--limit=N]');
    process.exitCode = 1;
    return;
  }

  const results = search(query, { limit });

  if (asJson) {
    console.log(JSON.stringify({ query, results }, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`No matches for "${query}". Try fewer/broader terms.`);
    return;
  }

  console.log(`Results for "${query}":\n`);
  results.forEach((r, i) => {
    const statusTag = r.status === 'current' ? '' : ` [${r.status}]`;
    console.log(`${i + 1}. ${r.path}${statusTag}`);
    console.log(`   Section: ${r.section}`);
    console.log(`   Relevance: ${r.relevance}`);
    console.log(`   ${r.snippet}`);
    console.log('');
  });
}

main();
