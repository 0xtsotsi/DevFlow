import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';

interface CliStatusResult {
  success: boolean;
  status?: string;
  path?: string | null;
  version?: string | null;
  method?: string;
  auth?: {
    authenticated: boolean;
    method?: string;
    hasStoredOAuthToken?: boolean;
    hasEnvOAuthToken?: boolean;
    hasStoredApiKey?: boolean;
    hasEnvApiKey?: boolean;
  };
}

interface CliStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  method: string;
}

interface AuthStatus {
  authenticated: boolean;
  method:
    | 'oauth_token_env'
    | 'oauth_token'
    | 'api_key'
    | 'api_key_env'
    | 'credentials_file'
    | 'cli_authenticated'
    | 'none';
  hasCredentialsFile: boolean;
  oauthTokenValid: boolean;
  apiKeyValid: boolean;
  hasEnvOAuthToken: boolean;
  hasEnvApiKey: boolean;
}

interface UseCliStatusOptions {
  cliType: 'claude';
  statusApi: () => Promise<CliStatusResult>;
  setCliStatus: (status: CliStatus) => void;
  setAuthStatus: (status: AuthStatus) => void;
}

// Create logger once outside the hook to prevent infinite re-renders
const logger = createLogger('CliStatus');

export function useCliStatus({
  cliType,
  statusApi,
  setCliStatus,
  setAuthStatus,
}: UseCliStatusOptions) {
  const [isChecking, setIsChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    logger.info(`Starting status check for ${cliType}...`);
    setIsChecking(true);
    try {
      const result = await statusApi();
      logger.info(`Raw status result for ${cliType}:`, result);

      if (result.success) {
        const cliStatus = {
          installed: result.status === 'installed',
          path: result.path || null,
          version: result.version || null,
          method: result.method || 'none',
        };
        logger.info(`CLI Status for ${cliType}:`, cliStatus);
        setCliStatus(cliStatus);

        if (result.auth) {
          // Validate method is one of the expected values, default to "none"
          const validMethods = [
            'oauth_token_env',
            'oauth_token',
            'api_key',
            'api_key_env',
            'credentials_file',
            'cli_authenticated',
            'none',
          ] as const;
          type AuthMethod = (typeof validMethods)[number];
          const method: AuthMethod = validMethods.includes(result.auth.method as AuthMethod)
            ? (result.auth.method as AuthMethod)
            : 'none';
          const authStatus = {
            authenticated: result.auth.authenticated,
            method,
            hasCredentialsFile: false,
            oauthTokenValid: Boolean(
              result.auth.hasStoredOAuthToken || result.auth.hasEnvOAuthToken
            ),
            apiKeyValid: Boolean(result.auth.hasStoredApiKey || result.auth.hasEnvApiKey),
            hasEnvOAuthToken: Boolean(result.auth.hasEnvOAuthToken),
            hasEnvApiKey: Boolean(result.auth.hasEnvApiKey),
          };
          setAuthStatus(authStatus);
        }
      }
    } catch (error) {
      logger.error(`Failed to check status for ${cliType}:`, error);
    } finally {
      setIsChecking(false);
    }
  }, [cliType, statusApi, setCliStatus, setAuthStatus]);

  return { isChecking, checkStatus };
}
