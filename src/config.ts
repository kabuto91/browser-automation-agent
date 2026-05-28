import * as dotenv from 'dotenv';
import * as path from 'path';

let dotenvLoaded = false;

function loadDotenvOnce(): void {
  if (dotenvLoaded) {
    return;
  }

  const envPath = process.env.NODE_ENV === 'production'
    ? path.join(process.cwd(), '.env')
    : path.join(process.cwd(), '.env');

  dotenv.config({ path: envPath });
  dotenvLoaded = true;
  
  console.log('[Config] Dotenv loaded (one-time initialization)');
}

loadDotenvOnce();

export interface BrowserConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  timeout: number;
}

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'qwen';
  model: string;
  maxTokens: number;
  apiKey: string;
  baseUrl?: string;
}

export interface ScreenshotConfig {
  dir: string;
  onFailure: boolean;
  onSuccess: boolean;
}

export interface ReportConfig {
  outputDir: string;
  format: 'html' | 'json' | 'markdown';
}

export interface SecurityConfig {
  urlWhitelist: string[];
  urlWhitelistEnabled: boolean;
  blockDangerousProtocols: boolean;
  networkIsolation: boolean;
  proxyServer?: string;
  proxyBypassList?: string[];
}

export interface AppConfig {
  browser: BrowserConfig;
  llm: LLMConfig;
  screenshot: ScreenshotConfig;
  report: ReportConfig;
  security: SecurityConfig;
}

function getEnvVar(name: string): string | undefined {
  if (typeof window !== 'undefined') {
    return undefined;
  }
  return process.env[name];
}

export const config: AppConfig = {
  browser: {
    headless: getEnvVar('HEADLESS') === 'true',
    viewport: { width: 1280, height: 720 },
    timeout: parseInt(getEnvVar('BROWSER_TIMEOUT') || '30000', 10),
  },
  llm: {
    provider: (getEnvVar('LLM_PROVIDER') as 'anthropic' | 'openai' | 'qwen') || 'qwen',
    model: getEnvVar('LLM_MODEL') || 'qwen-plus',
    maxTokens: parseInt(getEnvVar('LLM_MAX_TOKENS') || '4096', 10),
    apiKey: getEnvVar('DASHSCOPE_API_KEY') || getEnvVar('OPENAI_API_KEY') || getEnvVar('ANTHROPIC_API_KEY') || '',
    baseUrl: getEnvVar('LLM_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  screenshot: {
    dir: getEnvVar('SCREENSHOT_DIR') || './screenshots',
    onFailure: getEnvVar('SCREENSHOT_ON_FAILURE') !== 'false',
    onSuccess: getEnvVar('SCREENSHOT_ON_SUCCESS') === 'true',
  },
  report: {
    outputDir: getEnvVar('REPORT_DIR') || './reports',
    format: (getEnvVar('REPORT_FORMAT') as 'html' | 'json' | 'markdown') || 'html',
  },
  security: {
    urlWhitelist: getEnvVar('URL_WHITELIST')?.split(',').map(s => s.trim()) || [],
    urlWhitelistEnabled: getEnvVar('URL_WHITELIST_ENABLED') === 'true',
    blockDangerousProtocols: getEnvVar('BLOCK_DANGEROUS_PROTOCOLS') !== 'false',
    networkIsolation: getEnvVar('NETWORK_ISOLATION') === 'true',
    proxyServer: getEnvVar('PROXY_SERVER'),
    proxyBypassList: getEnvVar('PROXY_BYPASS_LIST')?.split(',').map(s => s.trim()),
  },
};

export function ensureDirectories(): void {
  if (typeof window !== 'undefined') return;
  
  const fs = require('fs');
  const dirs = [config.screenshot.dir, config.report.outputDir];
  
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[Config] Created directory: ${dir}`);
      }
    } catch (error: any) {
      console.error(`[Config] Failed to create directory ${dir}:`, error.message);
    }
  }
}

let directoriesEnsured = false;

export function ensureDirectoriesOnce(): void {
  if (directoriesEnsured) {
    return;
  }
  
  ensureDirectories();
  directoriesEnsured = true;
  console.log('[Config] Directories ensured (one-time check)');
}
