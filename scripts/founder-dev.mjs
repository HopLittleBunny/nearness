import { spawn } from 'node:child_process'

const keyFile = process.env.NEARNESS_BOOTSTRAP_KEY_FILE
if (!keyFile) {
  process.stderr.write('Set NEARNESS_BOOTSTRAP_KEY_FILE to an env file containing OPENAI_API_KEY. The key is imported into macOS secure storage and is never printed.\n')
  process.exit(1)
}
const child = spawn('npm', ['run', 'dev:desktop'], {
  stdio: 'inherit',
  env: { ...process.env, NEARNESS_BOOTSTRAP_KEY_FILE: keyFile },
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
