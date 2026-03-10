type BunGlobalLike = {
  which?: (command: string) => string | null;
};

export function resolveCliExecutablePath(
  commandName: string,
  explicitEnvNames: string[],
): string | undefined {
  for (const envName of explicitEnvNames) {
    const explicitPath = process.env[envName]?.trim();
    if (explicitPath) {
      return explicitPath;
    }
  }

  const bunGlobal = (globalThis as typeof globalThis & { Bun?: BunGlobalLike }).Bun;
  const detectedPath = bunGlobal?.which?.(commandName);
  if (detectedPath) {
    return detectedPath;
  }

  return undefined;
}
