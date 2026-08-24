import { execFileSync } from 'node:child_process';

const [, , docxPath] = process.argv;

if (!docxPath) {
  console.error('Usage: node tools/read-docx-text.mjs <document.docx>');
  process.exit(1);
}

const xml = execFileSync('tar', ['-xOf', docxPath, 'word/document.xml'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

function decodeXml(value = '') {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

const lines = [];
for (const paragraph of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
  const text = [...paragraph[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1]))
    .join('');
  if (text.trim()) lines.push(text.trim());
}

process.stdout.write(`${lines.join('\n')}\n`);
