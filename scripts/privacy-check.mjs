import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Patterns never print the matched value. This is a release guard, not proof
// that arbitrary personal data or unknown secret formats cannot be present.
export function findingsFor(path, content) {
  const hits = [];
  const add = (rule) => { if (!hits.includes(rule)) hits.push(rule); };
  if (/\.(?:pem|key|p12|pfx|keystore|sqlite3?|db|csv|xlsx|dump|backup|zip)$/i.test(path)
      || /(?:^|\/)(?:\.npmrc|id_rsa|id_ed25519|\.aws|\.ssh)(?:\/|$)/.test(path)) add('restricted-file');
  if (/(?:^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('.env.example')) add('environment-file');
  if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(content)) add('private-key');
  if (/\b(?:ghp_|github_pat_|shpat_|sk_live_|sk_test_|whsec_)[A-Za-z0-9_]{16,}\b/.test(content)) add('service-token');
  if (/\bAKIA[A-Z0-9]{16}\b/.test(content)) add('cloud-access-key');
  if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(content)) add('jwt');
  if (/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s@]+@/i.test(content)) add('database-password-url');
  if (/(?:\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Z]:\\Users\\[^\\\s]+\\)/.test(content)) add('personal-filesystem-path');
  const emails = content.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi) || [];
  if (emails.some((email) => !email.toLowerCase().endsWith('@example.com'))) add('non-example-email');
  return hits;
}
export function identitySafe(name, email) {
  return ['spsport', 'sp sport kakajun'].includes(name) && email === 'opensource@example.com';
}
const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// GitHub ZIP downloads have no .git directory and beginners need no Git install.
// In that case scan the unpacked source, including hidden files, and skip only
// generated directories. A local .env is deliberately reported in ZIP mode.
export function sourceFiles(root = '.') {
  if (existsSync(join(root, '.git'))) {
    return [...new Set(git(['-C', root, 'ls-files', '-co', '--exclude-standard', '-z']).split('\0').filter(Boolean))];
  }
  const paths = [];
  function walk(dir = '') {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (['node_modules', 'dist', 'coverage', '.git'].includes(entry.name) && entry.isDirectory()) continue;
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else paths.push(path);
    }
  }
  walk();
  return paths;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const report = { scope: args[0] === '--history' ? 'git-history' : 'current-files', scanned: 0, findings: [], metadata: 0 };
  if (args[0] === '--history') {
    const refs = args.slice(1);
    if (!refs.length || refs.some((ref) => ref.startsWith('-'))) throw Error('Provide explicit refs after --history.');
    const objects = git(['rev-list', '--objects', ...refs]).trim().split('\n');
    for (const line of objects) {
      const split = line.indexOf(' '); if (split < 0) continue;
      const oid = line.slice(0, split), path = line.slice(split + 1);
      if (git(['cat-file', '-t', oid]).trim() !== 'blob') continue;
      report.scanned++;
      const content = git(['cat-file', '-p', oid]);
      for (const rule of findingsFor(path, content)) report.findings.push({ object: oid.slice(0, 12), path, rule });
    }
    const commits = git(['log', ...refs, '--format=%H%x09%an%x09%ae%x09%cn%x09%ce%x09%B%x00']).split('\0');
    for (const record of commits) {
      const [sha, an, ae, cn, ce, message = ''] = record.trim().split('\t');
      if (!sha) continue;
      if (!identitySafe(an, ae) || !identitySafe(cn, ce)) report.metadata++;
      for (const rule of findingsFor('commit-message', message)) report.findings.push({ object: sha.slice(0, 12), path: 'commit-message', rule });
    }
  } else {
    const files = sourceFiles();
    for (const path of files) {
      if (!existsSync(path)) continue;
      report.scanned++;
      const content = readFileSync(path);
      // PNGs require visual review separately; arbitrary binaries are rejected.
      if (content.includes(0) && extname(path) !== '.png') { report.findings.push({ path, rule: 'unreviewed-binary' }); continue; }
      for (const rule of findingsFor(path, content.toString('utf8'))) report.findings.push({ path, rule });
    }
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.findings.length || report.metadata ? 1 : 0;
}
