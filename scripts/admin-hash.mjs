// Generates the server-only values for the admin login. Run locally: npm run admin:hash
// The password is typed into your own terminal (hidden) and is never written to disk or logged.
import { randomBytes, scryptSync } from 'node:crypto';
import readline from 'node:readline';

const N = 16384, r = 8, p = 1;

function ask(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

const pw = process.env.ADMIN_PASSWORD_INPUT ?? (await ask('Choose an admin password (min 12 chars): '));
if (pw.length < 12) { console.error('Password must be at least 12 characters.'); process.exit(1); }
if (!process.env.ADMIN_PASSWORD_INPUT && (await ask('Repeat password: ')) !== pw) { console.error('Passwords do not match.'); process.exit(1); }

const salt = randomBytes(16);
const key = scryptSync(pw, salt, 64, { N, r, p, maxmem: 256 * 1024 * 1024 });
console.log('\nSet these as SERVER environment variables (Vercel > Settings > Environment Variables, or a local .env.local). Never commit them.\n');
console.log(`ADMIN_EMAIL=<your admin email>`);
console.log(`ADMIN_PASSWORD_HASH=scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`);
console.log(`ADMIN_SESSION_SECRET=${randomBytes(48).toString('base64url')}`);
