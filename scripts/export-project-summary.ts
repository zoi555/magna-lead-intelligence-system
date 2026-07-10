#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const files = ['PROJECT_STATUS.md', 'project_manifest.yml', 'docs/11_ISSUES_LOG.md', 'docs/13_ROADMAP.md'];
const parts = files.map((file) => existsSync(file) ? `

# ${file}

${readFileSync(file, 'utf8')}` : `

# ${file}

MISSING`);
writeFileSync('PROJECT_SUMMARY_EXPORT.md', parts.join('
'), 'utf8');
console.log('Wrote PROJECT_SUMMARY_EXPORT.md');
