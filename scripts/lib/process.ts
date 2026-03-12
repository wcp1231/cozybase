const bunBinary = Bun.which('bun') ?? process.execPath;

export interface CommandSpec {
  label: string;
  cmd: string[];
  cwd?: string;
  env?: Record<string, string>;
  prefixOutput?: boolean;
}

export interface RunningCommand {
  label: string;
  process: ReturnType<typeof Bun.spawn>;
  done: Promise<void>;
}

function writePrefixed(label: string, chunk: string, writer: NodeJS.WriteStream) {
  if (!chunk) return;
  const parts = chunk.split('\n');
  const trailingNewline = chunk.endsWith('\n');
  const lastIndex = trailingNewline ? parts.length - 1 : parts.length;

  for (let index = 0; index < lastIndex; index += 1) {
    writer.write(`[${label}] ${parts[index]}\n`);
  }
}

async function pipeStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
  label: string,
  writer: NodeJS.WriteStream,
) {
  if (!stream) return;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      writer.write(`[${label}] ${line}\n`);
    }
  }

  buffer += decoder.decode();
  if (buffer) {
    writePrefixed(label, buffer, writer);
  }
}

export function spawnCommand(spec: CommandSpec): RunningCommand {
  const prefixOutput = spec.prefixOutput ?? true;
  const child = Bun.spawn({
    cmd: spec.cmd,
    cwd: spec.cwd,
    env: spec.env ? { ...globalThis.process.env, ...spec.env } : globalThis.process.env,
    stdout: prefixOutput ? 'pipe' : 'inherit',
    stderr: prefixOutput ? 'pipe' : 'inherit',
  });

  const done = (async () => {
    const outputPipes = prefixOutput
      ? [
          pipeStream(child.stdout, spec.label, process.stdout),
          pipeStream(child.stderr, spec.label, process.stderr),
        ]
      : [];

    const exitCode = await child.exited;
    await Promise.all(outputPipes);
    if (exitCode !== 0) {
      throw new Error(`${spec.label} failed with exit code ${exitCode}`);
    }
  })();

  return { label: spec.label, process: child, done };
}

export async function runCommand(spec: CommandSpec) {
  const running = spawnCommand(spec);
  await running.done;
}

export async function waitForPaths(paths: string[], timeoutMs = 30_000, pollMs = 200) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ready = await Promise.all(paths.map(async (path) => await Bun.file(path).exists()));
    if (ready.every(Boolean)) {
      return;
    }

    await Bun.sleep(pollMs);
  }

  throw new Error(`Timed out waiting for: ${paths.join(', ')}`);
}

export async function shutdownCommands(commands: RunningCommand[]) {
  for (const command of commands) {
    command.process.kill('SIGTERM');
  }

  await Bun.sleep(250);

  for (const command of commands) {
    const didExit = await Promise.race([
      command.process.exited.then(() => true),
      Bun.sleep(750).then(() => false),
    ]);

    if (!didExit) {
      command.process.kill('SIGKILL');
    }
  }
}

export function workspaceScript(packageName: string, script: string): string[] {
  return [bunBinary, 'run', '--filter', packageName, script];
}

export function rootScript(scriptPath: string): string[] {
  return [bunBinary, 'run', scriptPath];
}
