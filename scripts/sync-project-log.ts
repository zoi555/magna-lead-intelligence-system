#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const status = existsSync('PROJECT_STATUS.md') ? readFileSync('PROJECT_STATUS.md', 'utf8') : 'PROJECT_STATUS.md missing';
appendFileSync('logs/ai-session-log.md', `

## Sync ${new Date().toISOString()}

${status.slice(0, 2000)}
`, 'utf8');
console.log('Appended PROJECT_STATUS snapshot to logs/ai-session-log.md');
