import { config as loadDotenv } from 'dotenv';

/**
 * Load configuration from an explicit file or from .env in the process cwd.
 * Existing environment variables always take precedence.
 */
export function loadEnvironment(): void {
  const explicitPath = process.env.EMAIL_ENV_FILE?.trim();
  const result = loadDotenv({
    ...(explicitPath ? { path: explicitPath } : {}),
    override: false,
    quiet: true
  });

  if (explicitPath && result.error) {
    throw new Error(`Failed to load EMAIL_ENV_FILE "${explicitPath}": ${result.error.message}`);
  }
}
