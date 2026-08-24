import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function decodeXml(value = '') {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? 'A';
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export function parseSheetXml(xml) {
  return [...xml.matchAll(/<x:row\b[^>]*>([\s\S]*?)<\/x:row>/g)].map((rowMatch) => {
  const cells = [];
  for (const cellMatch of rowMatch[1].matchAll(/<x:c\b([^>]*)>([\s\S]*?)<\/x:c>|<x:c\b([^>]*)\/>/g)) {
    const attributes = cellMatch[1] ?? cellMatch[3] ?? '';
    const body = cellMatch[2] ?? '';
    const reference = attributes.match(/\br="([A-Z]+\d+)"/)?.[1];
    if (!reference) continue;
    const raw = body.match(/<x:v>([\s\S]*?)<\/x:v>/)?.[1]
      ?? [...body.matchAll(/<x:t(?:\s[^>]*)?>([\s\S]*?)<\/x:t>/g)].map((match) => match[1]).join('');
    cells[columnIndex(reference)] = decodeXml(raw ?? '');
  }
  return cells.map((value) => value ?? '');
  });
}

export function readSheet(sheetPath) {
  return parseSheetXml(fs.readFileSync(sheetPath, 'utf8'));
}

const isCli = path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
if (isCli) {
  const [, , sheetPath] = process.argv;
  if (!sheetPath) {
    console.error('Usage: node tools/read-ooxml-sheet.mjs <worksheet.xml>');
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(readSheet(sheetPath), null, 2)}\n`);
}
