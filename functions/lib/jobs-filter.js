/**
 * Keyword-based job category filter.
 * Used by /api/jobs/* Pages Functions via import.
 *
 * SYNC NOTE: job-digest.js (standalone cron Worker) contains an inline copy
 * of KEYWORDS and categorize() because standalone Workers cannot import
 * Pages Function lib files. scripts/check-sync.js verifies parity at build time.
 * If you edit this file, mirror the changes to the FILTER block in job-digest.js.
 */

export const KEYWORDS = {
  cybersecurity: [
    'security', 'cybersecurity', 'cyber security', 'soc ', 'siem',
    'pentest', 'penetration test', 'vulnerability', 'malware', 'forensic',
    'grc', 'cryptograph', 'threat intel', 'threat hunt', 'infosec',
    'appsec', 'devsecops', 'red team', 'blue team', 'incident response',
    'security engineer', 'security analyst', 'security operations',
    'endpoint security', 'network security', 'cloud security', 'zero trust',
  ],
  it: [
    'sysadmin', 'system administrator', 'help desk', 'helpdesk',
    'network engineer', 'network administrator', 'infrastructure engineer',
    'devops', 'site reliability', 'sre ', 'platform engineer',
    'cloud engineer', 'it intern', 'information technology',
    'systems engineer', 'it support', 'it operations',
  ],
};

// Word-boundary match for bare "it" — avoids false hits on 'bit', 'unit', 'credit', etc.
const IT_WORD_RE = /\bit\b/i;

/**
 * Returns the set of categories a job belongs to based on its title.
 * @param {string} title
 * @returns {string[]} Array of matching categories ('cybersecurity', 'it'), may be empty.
 */
export function categorize(title) {
  const lower = title.toLowerCase();
  const matches = [];

  for (const kw of KEYWORDS.cybersecurity) {
    if (lower.includes(kw)) {
      matches.push('cybersecurity');
      break;
    }
  }

  let itMatch = KEYWORDS.it.some(kw => lower.includes(kw));
  if (!itMatch && IT_WORD_RE.test(lower)) itMatch = true;
  if (itMatch) matches.push('it');

  return matches;
}
