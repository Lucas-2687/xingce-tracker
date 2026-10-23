import { randomBytes, scryptSync } from 'node:crypto';
import readline from 'node:readline';

if (!process.stdin.isTTY) {
  let password = '';
  for await (const chunk of process.stdin) password += chunk;
  password = password.replace(/\r?\n$/, '');
  printHash(password);
} else {
  process.stdout.write('输入新的访问密码（至少 4 位，建议 12 位以上，输入不显示）：');
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let password = '';
  process.stdin.on('keypress', (text, key) => {
    if (key?.ctrl && key.name === 'c') process.exit(130);
    if (key?.name === 'return') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      printHash(password);
    } else if (key?.name === 'backspace') password = password.slice(0, -1);
    else if (text && !key?.ctrl && !key?.meta) password += text;
  });
}
function printHash(password) {
  if (password.length < 4 || password.length > 256) { console.error('密码长度应为 4–256 位，建议至少 12 位。'); process.exitCode = 1; return; }
  const salt = randomBytes(16).toString('hex');
  console.log('APP_PASSWORD_HASH=' + `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`);
}
