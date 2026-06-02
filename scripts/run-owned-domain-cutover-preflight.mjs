#!/usr/bin/env node
// Run a domain-neutral preflight for the future owned-domain cutover.
//
// This is the step between "root-domain rehearsal works" and "a real domain
// is configured." With no WORKSHOP_ARCADE_CUSTOM_DOMAIN it uses the reserved
// placeholder arcade.example.test, runs the existing owned-domain rehearsal,
// and writes evidence. With a real domain it also records GitHub Pages settings
// and can optionally enforce DNS / Pages custom-domain checks.

import { spawnSync } from 'node:child_process';
import dns from 'node:dns/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[:.]/g, '-');
const outputDir = join(repoRoot, 'test-results', 'owned-domain-cutover-preflight', runId);
const summaryPath = join(outputDir, 'summary.json');
const reportPath = join(outputDir, 'report.md');

const DEFAULT_DOMAIN = 'arcade.example.test';
const PAGES_DOMAIN = 'jakethehoffer.github.io';
const REPO_SLUG = 'jakethehoffer/Workshop-Arcade';
const GITHUB_PAGES_IPV4 = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'];
const GITHUB_PAGES_IPV6 = ['2606:50c0:8000::153', '2606:50c0:8001::153', '2606:50c0:8002::153', '2606:50c0:8003::153'];

const customDomain = normalizeDomain(process.env.WORKSHOP_ARCADE_CUSTOM_DOMAIN || DEFAULT_DOMAIN);
const placeholderMode = customDomain === DEFAULT_DOMAIN;
const checkDns = isTruthy(process.env.WORKSHOP_ARCADE_CHECK_DNS);
const requirePagesCname = isTruthy(process.env.WORKSHOP_ARCADE_REQUIRE_PAGES_CNAME);
const siteOrigin = `https://${customDomain}`;

const summary = {
  status: 'running',
  mode: placeholderMode ? 'placeholder' : 'real-domain',
  startedAt,
  finishedAt: null,
  durationMs: null,
  repoRoot,
  outputDir,
  summaryPath,
  reportPath,
  customDomain,
  siteOrigin,
  siteBasePath: '/',
  strictFlags: {
    checkDns,
    requirePagesCname,
  },
  githubPages: null,
  dns: null,
  failedStep: null,
  warnings: [],
  steps: [],
};

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

function durationLabel(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function validateHostname(hostname) {
  const issues = [];
  if (!hostname) issues.push('domain is empty');
  if (hostname.includes('://')) issues.push('domain must not include a URL scheme');
  if (/[/?#:]/.test(hostname)) issues.push('domain must not include a path, query, hash, or port');
  if (hostname.includes('*')) issues.push('wildcard domains are not allowed');
  if (hostname.includes('_')) issues.push('underscores are not valid in DNS host labels');
  if (hostname === 'localhost') issues.push('localhost is not a public GitHub Pages domain');
  if (hostname.length > 253) issues.push('domain exceeds 253 characters');

  const labels = hostname.split('.');
  if (labels.length < 2) issues.push('domain must include at least two labels');
  for (const label of labels) {
    if (!label) {
      issues.push('domain contains an empty label');
      continue;
    }
    if (label.length > 63) issues.push(`label "${label}" exceeds 63 characters`);
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
      issues.push(`label "${label}" must use letters, numbers, or interior hyphens`);
    }
  }
  return issues;
}

function createStep(id, label, command) {
  const step = {
    id,
    label,
    command,
    status: 'running',
    exitCode: null,
    error: null,
    details: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
  };
  summary.steps.push(step);
  return step;
}

function finishStep(step, status, details = null, error = null, exitCode = status === 'failed' ? 1 : 0) {
  step.status = status;
  step.exitCode = exitCode;
  step.error = error;
  step.details = details;
  step.finishedAt = new Date().toISOString();
  step.durationMs = Date.parse(step.finishedAt) - Date.parse(step.startedAt);
  if (status === 'warning' && error) summary.warnings.push(`${step.label}: ${error}`);
  if (status === 'failed' && !summary.failedStep) summary.failedStep = step.id;
  console.log(`${step.label}: ${status.toUpperCase()} ${durationLabel(step.durationMs)}`);
  if (error) console.error(error);
}

function skipStep(id, label, command, details) {
  summary.steps.push({
    id,
    label,
    command,
    status: 'skipped',
    exitCode: null,
    error: null,
    details,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
  });
  console.log(`${label}: SKIPPED`);
}

function runShellCommand(command, env = {}) {
  return spawnSync(command, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
  });
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function hasAll(actual, expected) {
  const actualSet = new Set(actual.map((value) => value.toLowerCase()));
  return expected.every((value) => actualSet.has(value.toLowerCase()));
}

async function resolveRecords(recordType, resolver) {
  try {
    return { values: await resolver(customDomain), error: null };
  } catch (error) {
    if (['ENODATA', 'ENOTFOUND', 'ENODOMAIN'].includes(error.code)) {
      return { values: [], error: error.code };
    }
    return { values: [], error: error.message || String(error) };
  }
}

async function runDnsCheck() {
  const [a, aaaa, cname] = await Promise.all([
    resolveRecords('A', dns.resolve4),
    resolveRecords('AAAA', dns.resolve6),
    resolveRecords('CNAME', dns.resolveCname),
  ]);

  const cnameValues = sortedUnique(cname.values.map((value) => value.replace(/\.$/, '').toLowerCase()));
  const ipv4Values = sortedUnique(a.values);
  const ipv6Values = sortedUnique(aaaa.values);
  const cnamePointsToPages = cnameValues.includes(PAGES_DOMAIN);
  const hasPagesIpv4 = hasAll(ipv4Values, GITHUB_PAGES_IPV4);
  const hasPagesIpv6 = hasAll(ipv6Values, GITHUB_PAGES_IPV6);

  const details = {
    expectedPagesDomain: PAGES_DOMAIN,
    expectedIpv4: GITHUB_PAGES_IPV4,
    expectedIpv6: GITHUB_PAGES_IPV6,
    records: {
      A: ipv4Values,
      AAAA: ipv6Values,
      CNAME: cnameValues,
    },
    resolverErrors: {
      A: a.error,
      AAAA: aaaa.error,
      CNAME: cname.error,
    },
    cnamePointsToPages,
    hasPagesIpv4,
    hasPagesIpv6,
  };

  const ok = cnamePointsToPages || hasPagesIpv4 || hasPagesIpv6;
  return {
    ok,
    details,
    error: ok
      ? null
      : `DNS records for ${customDomain} do not point at ${PAGES_DOMAIN} or the GitHub Pages A/AAAA targets.`,
  };
}

function queryGitHubPagesSettings() {
  const result = spawnSync(`gh api repos/${REPO_SLUG}/pages`, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: true,
    windowsHide: true,
  });

  if (result.status !== 0) {
    return {
      ok: false,
      details: {
        available: false,
        exitCode: result.status ?? 1,
        stderr: (result.stderr || '').trim(),
        stdout: (result.stdout || '').trim(),
      },
      error: 'Unable to query GitHub Pages settings with gh api.',
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    return {
      ok: false,
      details: {
        available: false,
        exitCode: 1,
        stderr: error.message || String(error),
        stdout: (result.stdout || '').trim(),
      },
      error: 'Unable to parse GitHub Pages settings returned by gh api.',
    };
  }
  return {
    ok: true,
    details: {
      available: true,
      status: parsed.status || null,
      cname: parsed.cname || null,
      html_url: parsed.html_url || null,
      custom_404: parsed.custom_404 ?? null,
      https_enforced: parsed.https_enforced ?? null,
      source: parsed.source || null,
    },
    error: null,
  };
}

function buildReport() {
  const lines = [
    '# Owned-Domain Cutover Preflight Report',
    '',
    `Status: ${summary.status.toUpperCase()}`,
    `Mode: ${summary.mode}`,
    `Domain: ${summary.customDomain}`,
    `Site origin: ${summary.siteOrigin}`,
    `Started: ${summary.startedAt}`,
    `Finished: ${summary.finishedAt || ''}`,
    `Duration: ${durationLabel(summary.durationMs)}`,
    `Failed step: ${summary.failedStep || 'none'}`,
    '',
    '| # | Step | Status | Exit | Duration | Command |',
    '|---:|------|--------|------|----------|---------|',
  ];

  for (const [index, step] of summary.steps.entries()) {
    lines.push(`| ${index + 1} | ${step.label} | ${step.status} | ${step.exitCode ?? ''} | ${durationLabel(step.durationMs)} | \`${String(step.command || '').replaceAll('`', '\\`')}\` |`);
  }

  if (summary.githubPages) {
    lines.push('');
    lines.push(`GitHub Pages cname: ${summary.githubPages.cname || 'none'}`);
    lines.push(`GitHub Pages URL: ${summary.githubPages.html_url || 'unknown'}`);
  }

  if (summary.warnings.length) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of summary.warnings) lines.push(`- ${warning}`);
  }

  lines.push('');
  lines.push(summary.status === 'passed'
    ? 'Owned-domain cutover preflight passed.'
    : 'Owned-domain cutover preflight found a blocking issue.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function writeEvidence() {
  await mkdir(outputDir, { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(reportPath, buildReport(), 'utf8');
}

const runStartedMs = Date.now();
let exitCode = 0;

try {
  console.log(`Owned-domain cutover preflight for ${customDomain} (${summary.mode})`);

  const validateStep = createStep('validate-domain', 'Validate custom domain input', 'validate WORKSHOP_ARCADE_CUSTOM_DOMAIN');
  const hostnameIssues = validateHostname(customDomain);
  if (hostnameIssues.length) {
    finishStep(validateStep, 'failed', { issues: hostnameIssues }, hostnameIssues.join('; '), 2);
    exitCode = 2;
  } else {
    finishStep(validateStep, 'passed', { placeholderMode });
  }

  if (exitCode === 0) {
    const rehearsalStep = createStep('owned-domain-rehearsal', 'Run root-domain rehearsal', 'npm run test:owned-domain-rehearsal');
    const result = runShellCommand('npm run test:owned-domain-rehearsal', {
      WORKSHOP_ARCADE_SITE_ORIGIN: siteOrigin,
      WORKSHOP_ARCADE_SITE_BASE_PATH: '/',
    });
    const commandExit = result.status ?? (result.error ? 1 : 0);
    finishStep(
      rehearsalStep,
      commandExit === 0 ? 'passed' : 'failed',
      { signal: result.signal || null },
      result.error?.message || null,
      commandExit
    );
    if (commandExit !== 0) exitCode = commandExit;
  } else {
    skipStep('owned-domain-rehearsal', 'Run root-domain rehearsal', 'npm run test:owned-domain-rehearsal', 'domain validation failed');
  }

  if (placeholderMode) {
    skipStep('github-pages-settings', 'Query GitHub Pages settings', `gh api repos/${REPO_SLUG}/pages`, 'placeholder mode does not require repository settings');
    skipStep('dns-targets', 'Verify DNS targets', 'resolve A/AAAA/CNAME records', 'placeholder mode does not query DNS');
    skipStep('pages-cname-match', 'Require Pages cname match', 'compare GitHub Pages cname to WORKSHOP_ARCADE_CUSTOM_DOMAIN', 'placeholder mode does not require a Pages custom domain');
  } else {
    const pagesStep = createStep('github-pages-settings', 'Query GitHub Pages settings', `gh api repos/${REPO_SLUG}/pages`);
    const pages = queryGitHubPagesSettings();
    if (pages.ok) {
      summary.githubPages = pages.details;
      const pageCname = normalizeDomain(pages.details.cname || '');
      const cnameMatches = pageCname === customDomain;
      finishStep(pagesStep, cnameMatches ? 'passed' : 'warning', { ...pages.details, cnameMatches }, cnameMatches ? null : `GitHub Pages cname is ${pageCname || 'not set'}, expected ${customDomain}.`);
    } else {
      finishStep(pagesStep, requirePagesCname ? 'failed' : 'warning', pages.details, pages.error);
      if (requirePagesCname) exitCode = 1;
    }

    if (checkDns) {
      const dnsStep = createStep('dns-targets', 'Verify DNS targets', 'resolve A/AAAA/CNAME records');
      const dnsResult = await runDnsCheck();
      summary.dns = dnsResult.details;
      finishStep(dnsStep, dnsResult.ok ? 'passed' : 'failed', dnsResult.details, dnsResult.error);
      if (!dnsResult.ok) exitCode = 1;
    } else {
      skipStep('dns-targets', 'Verify DNS targets', 'resolve A/AAAA/CNAME records', 'WORKSHOP_ARCADE_CHECK_DNS is not set');
    }

    if (requirePagesCname) {
      const cnameStep = createStep('pages-cname-match', 'Require Pages cname match', 'compare GitHub Pages cname to WORKSHOP_ARCADE_CUSTOM_DOMAIN');
      const pageCname = normalizeDomain(summary.githubPages?.cname || '');
      const ok = pageCname === customDomain;
      finishStep(cnameStep, ok ? 'passed' : 'failed', { pagesCname: pageCname || null, expected: customDomain }, ok ? null : `GitHub Pages cname is ${pageCname || 'not set'}, expected ${customDomain}.`);
      if (!ok) exitCode = 1;
    } else {
      skipStep('pages-cname-match', 'Require Pages cname match', 'compare GitHub Pages cname to WORKSHOP_ARCADE_CUSTOM_DOMAIN', 'WORKSHOP_ARCADE_REQUIRE_PAGES_CNAME is not set');
    }
  }
} finally {
  summary.finishedAt = new Date().toISOString();
  summary.durationMs = Date.now() - runStartedMs;
  summary.status = exitCode === 0 ? 'passed' : 'failed';
  await writeEvidence();
}

console.log(`\nOwned-domain cutover preflight report: ${reportPath}`);
process.exit(exitCode);
