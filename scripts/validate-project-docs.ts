#!/usr/bin/env node
import { existsSync } from 'node:fs';

const required = [
  'README.md',
  'CLAUDE.md',
  'PROJECT_STATUS.md',
  'VERIFY_BEFORE_CLAIMING.md',
  'project_manifest.yml',
  'docs/00_PROJECT_CONTEXT.md',
  'docs/01_REQUIREMENTS.md',
  'docs/02_ARCHITECTURE.md',
  'docs/03_DATA_MODEL.md',
  'docs/04_WORKFLOWS.md',
  'docs/05_INTEGRATIONS.md',
  'docs/06_SECURITY.md',
  'docs/07_TEST_PLAN.md',
  'docs/08_DEPLOYMENT.md',
  'docs/09_DECISIONS.md',
  'docs/10_BUGS_AND_FIXES.md',
  'docs/11_ISSUES_LOG.md',
  'docs/12_CHANGELOG.md',
  'docs/13_ROADMAP.md',
  'docs/14_RUNBOOK.md',
  'docs/15_AI_WORK_LOG.md',
  'docs/16_PROMPTS.md',
  'docs/17_HANDOVER.md',
];

const missing = required.filter((file) => !existsSync(file));
if (missing.length) {
  console.error('Missing required project docs:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

console.log('Project documentation skeleton exists. This does not mean the project works. Nice try.');
