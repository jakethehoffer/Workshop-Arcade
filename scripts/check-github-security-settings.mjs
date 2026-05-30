#!/usr/bin/env node
// Authenticated GitHub-native security surface drift check.
//
// This verifies repository settings that live in GitHub, not in the
// checkout: vulnerability alerts, Dependabot security updates, private
// vulnerability reporting, secret scanning, push protection, and the
// currently-open security alert backlogs.

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const API_ROOT = 'https://api.github.com';
const DEFAULT_REPO = 'jakethehoffer/Workshop-Arcade';
const repoName = process.env.WORKSHOP_ARCADE_REPO || DEFAULT_REPO;
const repoParts = repoName.split('/');
const issues = [];
const notes = [];

function fail(message) {
  issues.push(message);
}

function getToken() {
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (envToken) return envToken.trim();

  // Safe fallback for local maintainer runs. Never print this value.
  const result = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

function sanitizeApiMessage(body) {
  if (!body || typeof body !== 'object') return '';
  return typeof body.message === 'string' ? `: ${body.message}` : '';
}

function summarizeAlert(alert) {
  const number = alert.number || alert.alert_number;
  if (number && alert.html_url) return `#${number} ${alert.html_url}`;
  if (number) return `#${number}`;
  if (alert.html_url) return alert.html_url;
  if (alert.security_advisory?.ghsa_id) return alert.security_advisory.ghsa_id;
  if (alert.rule?.id) return alert.rule.id;
  if (alert.secret_type) return alert.secret_type;
  return 'unnumbered alert';
}

async function githubRequest(token, path, label) {
  const [owner, repo] = repoParts.map((part) => encodeURIComponent(part));
  const url = `${API_ROOT}/repos/${owner}/${repo}${path}`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Workshop-Arcade-security-settings-check',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    let body = null;
    if (response.status !== 204) {
      const text = await response.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
    }

    return { status: response.status, body };
  } catch (error) {
    fail(`${label}: request failed (${error.message})`);
    return null;
  }
}

function requireEnabled(body, field, label) {
  if (!body || body.enabled !== true) {
    fail(`${label}: expected enabled=true, got ${JSON.stringify(body)}`);
  } else {
    notes.push(`${field}=enabled`);
  }
}

function requireSecurityStatus(security, field, expectedStatus, label) {
  const status = security?.[field]?.status;
  if (status !== expectedStatus) {
    fail(`${label}: expected ${field}.status=${expectedStatus}, got ${status || 'missing'}`);
  } else {
    notes.push(`${field}=${status}`);
  }
}

function recordInformationalSecurityStatus(security, field) {
  const status = security?.[field]?.status || 'missing';
  notes.push(`${field}=${status} (informational)`);
}

async function requireStatus(token, path, expectedStatus, label) {
  const result = await githubRequest(token, path, label);
  if (!result) return;
  if (result.status !== expectedStatus) {
    fail(`${label}: expected HTTP ${expectedStatus}, got ${result.status}${sanitizeApiMessage(result.body)}`);
  } else {
    notes.push(`${label}=HTTP ${expectedStatus}`);
  }
}

async function requireEnabledEndpoint(token, path, field, label) {
  const result = await githubRequest(token, path, label);
  if (!result) return;
  if (result.status !== 200) {
    fail(`${label}: expected HTTP 200, got ${result.status}${sanitizeApiMessage(result.body)}`);
    return;
  }
  requireEnabled(result.body, field, label);
}

async function requireEmptyOpenAlerts(token, path, label) {
  const result = await githubRequest(token, `${path}?state=open&per_page=100`, label);
  if (!result) return;
  if (result.status !== 200) {
    fail(`${label}: expected queryable HTTP 200, got ${result.status}${sanitizeApiMessage(result.body)}`);
    return;
  }
  if (!Array.isArray(result.body)) {
    fail(`${label}: expected an alert array, got ${JSON.stringify(result.body)}`);
    return;
  }
  if (result.body.length > 0) {
    const sample = result.body.slice(0, 5).map(summarizeAlert).join(', ');
    fail(`${label}: expected zero open alerts, got ${result.body.length}${sample ? ` (${sample})` : ''}`);
    return;
  }
  notes.push(`${label}=0 open`);
}

if (repoParts.length !== 2 || repoParts.some((part) => !part)) {
  fail(`WORKSHOP_ARCADE_REPO must be owner/repo, got ${JSON.stringify(repoName)}`);
}

const token = getToken();
if (!token) {
  fail('Authentication required: set GH_TOKEN or GITHUB_TOKEN, or run `gh auth login` so `gh auth token` can be used locally.');
}

if (issues.length === 0) {
  await requireStatus(token, '/vulnerability-alerts', 204, 'vulnerability alerts');
  await requireEnabledEndpoint(token, '/automated-security-fixes', 'dependabot_security_updates', 'Dependabot security updates');
  await requireEnabledEndpoint(token, '/private-vulnerability-reporting', 'private_vulnerability_reporting', 'private vulnerability reporting');

  const repo = await githubRequest(token, '', 'repository security_and_analysis');
  if (repo?.status !== 200) {
    fail(`repository security_and_analysis: expected HTTP 200, got ${repo?.status || 'no response'}${sanitizeApiMessage(repo?.body)}`);
  } else {
    const security = repo.body?.security_and_analysis;
    if (!security) {
      fail('repository security_and_analysis: response did not include security_and_analysis');
    } else {
      requireSecurityStatus(security, 'dependabot_security_updates', 'enabled', 'repository security_and_analysis');
      requireSecurityStatus(security, 'secret_scanning', 'enabled', 'repository security_and_analysis');
      requireSecurityStatus(security, 'secret_scanning_push_protection', 'enabled', 'repository security_and_analysis');
      recordInformationalSecurityStatus(security, 'secret_scanning_non_provider_patterns');
      recordInformationalSecurityStatus(security, 'secret_scanning_validity_checks');
    }
  }

  await requireEmptyOpenAlerts(token, '/dependabot/alerts', 'Dependabot alerts');
  await requireEmptyOpenAlerts(token, '/secret-scanning/alerts', 'secret scanning alerts');
  await requireEmptyOpenAlerts(token, '/code-scanning/alerts', 'CodeQL alerts');
}

if (issues.length > 0) {
  console.error(`GitHub security settings check failed for ${repoName} with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) {
    console.error(` - ${issue}`);
  }
  if (notes.length > 0) {
    console.error(`Observed: ${notes.join('; ')}`);
  }
  process.exit(1);
}

console.log(`GitHub security settings check passed for ${repoName}: ${notes.join('; ')}.`);
