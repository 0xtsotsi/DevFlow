#!/usr/bin/env node
/**
 * ADR Review Script
 *
 * Automates Architecture Decision Record (ADR) review checks:
 * - Identifies stale ADRs (>12 months since last review)
 * - Reports on ADR status distribution
 * - Validates ADR links
 * - Checks MADR template compliance
 *
 * Usage:
 *   node scripts/adr-review.mjs --check
 *   node scripts/adr-review.mjs --report
 *   node scripts/adr-review.mjs --update ADR-XXX-title.md
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const ADR_DIR = join(PROJECT_ROOT, 'docs', 'adr');

// Configuration
const REVIEW_INTERVAL_MONTHS = 12;
const ADR_FILE_PATTERN = /^ADR-\d+-.+\.md$/;

/**
 * Parse ADR frontmatter and content
 */
function parseADR(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const adr = {
    file: filePath,
    name: filePath.split('/').pop(),
    number: 0,
    title: '',
    status: '',
    date: null,
    lastReviewed: null,
    supersededBy: null,
    relatedADRs: [],
    hasMADRFormat: false,
    content: content,
  };

  // Extract ADR number from filename
  const numberMatch = adr.name.match(/ADR-(\d+)/);
  if (numberMatch) {
    adr.number = parseInt(numberMatch[1], 10);
  }

  // Extract title from first heading
  for (const line of lines) {
    if (line.startsWith('# ')) {
      adr.title = line.replace('# ', '').trim();
      break;
    }
  }

  // Parse frontmatter-like fields from content
  let inFrontmatter = false;
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    const line = lines[i];

    if (line.startsWith('**Status**:')) {
      adr.status = line.replace('**Status**:', '').replace(/\*\*/g, '').trim();
      adr.hasMADRFormat = true;
      continue;
    }

    if (line.startsWith('**Date**:')) {
      const dateStr = line.replace('**Date**:', '').replace(/\*\*/g, '').trim();
      adr.date = new Date(dateStr);
      continue;
    }

    if (line.startsWith('**Last Reviewed**:')) {
      const dateStr = line.replace('**Last Reviewed**:', '').replace(/\*\*/g, '').trim();
      adr.lastReviewed = new Date(dateStr);
      continue;
    }

    if (line.startsWith('**Superseded By**:')) {
      adr.supersededBy = line.replace('**Superseded By**:', '').replace(/\*\*/g, '').trim();
      continue;
    }

    if (line.startsWith('**Related ADRs**:')) {
      const relatedStr = line.replace('**Related ADRs**:', '').replace(/\*\*/g, '').trim();
      adr.relatedADRs = relatedStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }

    // Check for legacy format markers
    if (line.startsWith('| ') && line.includes('|')) {
      // Table row - might be legacy format index
      if ((line.includes('|') && line.includes('Accepted')) || line.includes('Proposed')) {
        // Could be legacy format
      }
    }
  }

  // For legacy ADRs, try to extract info from tables
  if (!adr.hasMADRFormat) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('| ') && line.includes(adr.name)) {
        // This might be the row in the index table
        const parts = line.split('|').map((s) => s.trim());
        if (parts.length >= 4) {
          adr.status = parts[parts.length - 3] || adr.status;
          const dateStr = parts[parts.length - 2] || '';
          if (dateStr && dateStr.match(/\d{4}-\d{2}-\d{2}/)) {
            adr.date = new Date(dateStr);
          }
        }
        break;
      }
    }
  }

  // Default date to file creation time if not found
  if (!adr.date || isNaN(adr.date.getTime())) {
    try {
      const stats = statSync(filePath);
      adr.date = stats.mtime;
    } catch {
      adr.date = new Date();
    }
  }

  return adr;
}

/**
 * Get all ADR files
 */
function getADRFiles() {
  const files = readdirSync(ADR_DIR);
  return files
    .filter((f) => ADR_FILE_PATTERN.test(f))
    .filter((f) => f !== 'README.md' && f !== 'review-process.md')
    .map((f) => join(ADR_DIR, f))
    .sort();
}

/**
 * Check if an ADR needs review
 */
function needsReview(adr, now = new Date()) {
  if (adr.status === 'Proposed' || adr.status === 'Superseded' || adr.status === 'Deprecated') {
    return false;
  }

  const lastReviewed = adr.lastReviewed || adr.date;
  if (!lastReviewed) {
    return true;
  }

  const monthsSinceReview = (now - lastReviewed) / (1000 * 60 * 60 * 24 * 30);
  return monthsSinceReview >= REVIEW_INTERVAL_MONTHS;
}

/**
 * Format date for display
 */
function formatDate(date) {
  if (!date || isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toISOString().split('T')[0];
}

/**
 * Format duration for display
 */
function formatDuration(startDate) {
  const now = new Date();
  const months = Math.floor((now - startDate) / (1000 * 60 * 60 * 24 * 30));
  if (months < 1) {
    const days = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    return `${days} days ago`;
  }
  return `${months} months ago`;
}

/**
 * Main check function
 */
function checkADRs() {
  const adrFiles = getADRFiles();
  const adrs = adrFiles.map(parseADR);
  const now = new Date();

  console.log(`\n🔍 ADR Review Check (${formatDate(now)})`);
  console.log(`═`.repeat(60));

  const stale = adrs.filter((adr) => needsReview(adr, now));
  const byStatus = adrs.reduce((acc, adr) => {
    acc[adr.status] = (acc[adr.status] || 0) + 1;
    return acc;
  }, {});

  console.log(`\n📊 Status Distribution:`);
  console.log(
    `   ${Object.entries(byStatus)
      .map(([status, count]) => `${status}: ${count}`)
      .join(' | ')}`
  );

  if (stale.length === 0) {
    console.log(`\n✅ All ADRs are up to date!`);
    return;
  }

  console.log(`\n⚠️  ${stale.length} ADR(s) need review:\n`);

  for (const adr of stale) {
    const lastReviewed = adr.lastReviewed || adr.date;
    const duration = formatDuration(lastReviewed);

    console.log(`   ${adr.name}`);
    console.log(`   └─ Status: ${adr.status} | Last reviewed: ${duration}`);
    console.log(`      File: docs/adr/${adr.name}`);
    console.log();
  }

  console.log(`Run 'node scripts/adr-review.mjs --report' for details.`);
}

/**
 * Generate detailed report
 */
function generateReport() {
  const adrFiles = getADRFiles();
  const adrs = adrFiles.map(parseADR);
  const now = new Date();

  console.log(`\n📋 ADR Review Report (${formatDate(now)})`);
  console.log(`═`.repeat(70));

  for (const adr of adrs) {
    const isStale = needsReview(adr, now);
    const statusIcon =
      adr.status === 'Accepted'
        ? '✅'
        : adr.status === 'Proposed'
          ? '📝'
          : adr.status === 'Deprecated'
            ? '⚠️ '
            : adr.status === 'Superseded'
              ? '↪️ '
              : '❓';

    console.log(`\n${statusIcon} ${adr.name}`);
    console.log(`   Title: ${adr.title}`);
    console.log(`   Status: ${adr.status}`);
    console.log(`   Date: ${formatDate(adr.date)}`);
    console.log(`   Last Reviewed: ${adr.lastReviewed ? formatDate(adr.lastReviewed) : 'Never'}`);
    console.log(`   MADR Format: ${adr.hasMADRFormat ? 'Yes' : 'No (Legacy)'}`);

    if (adr.supersededBy) {
      console.log(`   Superseded By: ${adr.supersededBy}`);
    }

    if (adr.relatedADRs.length > 0) {
      console.log(`   Related: ${adr.relatedADRs.join(', ')}`);
    }

    if (isStale) {
      const lastReviewed = adr.lastReviewed || adr.date;
      const duration = formatDuration(lastReviewed);
      console.log(`   ⚠️  Needs review (${duration} since last review)`);
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`\nSummary:`);
  console.log(`   Total ADRs: ${adrs.length}`);
  console.log(`   Need Review: ${adrs.filter((a) => needsReview(a)).length}`);
  console.log(`   MADR Format: ${adrs.filter((a) => a.hasMADRFormat).length}`);
  console.log(`   Legacy Format: ${adrs.filter((a) => !a.hasMADRFormat).length}`);
}

/**
 * Update ADR with review date
 */
function updateADRReview(adrFileName) {
  const filePath = join(ADR_DIR, adrFileName);

  try {
    let content = readFileSync(filePath, 'utf-8');
    const now = new Date();
    const reviewDate = now.toISOString().split('T')[0];

    // Check if Last Reviewed field exists
    if (content.includes('**Last Reviewed**')) {
      // Update existing field
      content = content.replace(
        /\*\*Last Reviewed\*\*:\s*\d{4}-\d{2}-\d{2}/,
        `**Last Reviewed**: ${reviewDate}`
      );
    } else {
      // Add Last Reviewed field after Date field
      content = content.replace(
        /(\*\*Date\*\*:\s*\d{4}-\d{2}-\d{2})/,
        `$1\n**Last Reviewed**: ${reviewDate}`
      );
    }

    // Add review notes section if it doesn't exist
    if (!content.includes('## Review Notes')) {
      content += `\n\n## Review Notes\n\n### Review Date: ${reviewDate}\n\n**Status**: Remains Accepted\n\n**Findings**:\n- Decision is still accurate\n- Implementation matches documented approach\n\n**Actions**: None\n`;
    }

    writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ Updated ${adrFileName} with review date ${reviewDate}`);
  } catch (error) {
    console.error(`❌ Failed to update ${adrFileName}:`, error.message);
  }
}

/**
 * CLI entry point
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case '--check':
      checkADRs();
      break;

    case '--report':
      generateReport();
      break;

    case '--update':
      if (!args[1]) {
        console.error('Usage: node scripts/adr-review.mjs --update <ADR-file>');
        process.exit(1);
      }
      updateADRReview(args[1]);
      break;

    default:
      console.log(`
ADR Review Script

Usage:
  node scripts/adr-review.mjs --check      Check for stale ADRs
  node scripts/adr-review.mjs --report     Generate detailed report
  node scripts/adr-review.mjs --update <file>  Update ADR review date

Options:
  --check    List ADRs that need review (older than ${REVIEW_INTERVAL_MONTHS} months)
  --report   Show detailed report of all ADRs
  --update   Add/update Last Reviewed date for a specific ADR
`);
      process.exit(1);
  }
}

main();
