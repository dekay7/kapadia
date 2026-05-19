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
    // Core
    'security', 'cybersecurity', 'cyber security',
    // Cyber-prefixed roles
    'cyber analyst', 'cyber engineer', 'cyber operations', 'cyber defense',
    // SIEM
    'siem',
    // Offensive / testing
    'pentest', 'penetration test', 'red team', 'purple team',
    // Defensive / response
    'blue team', 'incident response', 'insider threat', 'intrusion',
    // Intelligence / modeling
    'threat intel', 'threat hunt', 'threat model', 'osint',
    // Malware / threats
    'vulnerability', 'malware', 'ransomware', 'phishing',
    // Forensics / RE
    'forensic', 'reverse engineer',
    // Disciplines
    'grc', 'cryptograph', 'infosec', 'appsec', 'devsecops',
    // Domains
    'endpoint security', 'network security', 'cloud security', 'zero trust',
    // Identity / privacy
    'identity and access', 'iam ', 'privacy engineer', 'data privacy',
  ],
  it: [
    // Admin
    'sysadmin', 'system administrator', 'systems administration',
    'it administrator', 'linux administrator',
    // Support
    'help desk', 'helpdesk', 'service desk', 'desktop support', 'technical support',
    'it support', 'it specialist', 'it analyst', 'it technician', 'it operations',
    'it intern', 'information technology',
    // Network
    'network engineer', 'network administrator', 'network technician',
    'network operations', 'noc ',
    // Infrastructure / cloud
    'infrastructure engineer', 'infrastructure admin',
    'cloud engineer', 'cloud architect', 'cloud administrator', 'cloud operations',
    // Engineering / SRE / DevOps
    'devops', 'site reliability', 'sre ', 'platform engineer', 'systems engineer',
    // Database
    'database administrator', 'dba ',
    // Directory
    'active directory',
  ],
};

// Word-boundary match for bare "it" — avoids false hits on 'bit', 'unit', 'credit', etc.
const IT_WORD_RE = /\bit\b/i;
// Case-sensitive: only uppercase SOC matches Security Operations Center, not SoC (System on Chip)
const SOC_RE = /\bSOC\b/;

/**
 * Returns the set of categories a job belongs to based on its title.
 * @param {string} title
 * @returns {string[]} Array of matching categories ('cybersecurity', 'it'), may be empty.
 */
export function categorize(title) {
  const lower = title.toLowerCase();
  const matches = [];

  const cyberMatch = KEYWORDS.cybersecurity.some(kw => lower.includes(kw)) || SOC_RE.test(title);
  if (cyberMatch) matches.push('cybersecurity');

  let itMatch = KEYWORDS.it.some(kw => lower.includes(kw));
  if (!itMatch && IT_WORD_RE.test(lower)) itMatch = true;
  if (itMatch) matches.push('it');

  return matches;
}
