import { LLMClient } from '../llm/llmClient';

export interface LoginDetectionResult {
  needsLogin: boolean;
  confidence: number;
  reason: string;
  loginElements?: string[];
}

export class LoginDetector {
  constructor(private llm: LLMClient) {}

  private detectionCache = new Map<string, { result: LoginDetectionResult; timestamp: number }>();
  private cacheConfig = {
    enabled: true,
    ttl: 30000,
    maxSize: 50,
  };

  private getCached(pageContent: string): LoginDetectionResult | null {
    if (!this.cacheConfig.enabled) {
      return null;
    }

    const cacheKey = pageContent.slice(0, 200);
    const cached = this.detectionCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > this.cacheConfig.ttl) {
      this.detectionCache.delete(cacheKey);
      return null;
    }

    return cached.result;
  }

  private setCache(pageContent: string, result: LoginDetectionResult): void {
    if (!this.cacheConfig.enabled) {
      return;
    }

    if (this.detectionCache.size >= this.cacheConfig.maxSize) {
      const oldestKey = this.detectionCache.keys().next().value;
      if (oldestKey) {
        this.detectionCache.delete(oldestKey);
      }
    }

    const cacheKey = pageContent.slice(0, 200);
    this.detectionCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });
  }

  async detectLoginRequired(pageContent: string): Promise<LoginDetectionResult> {
    const cachedResult = this.getCached(pageContent);
    if (cachedResult) {
      console.log('[LoginDetector] Using cached detection result');
      return cachedResult;
    }

    const systemPrompt = `You are a web page analyzer. Your task is to determine if a web page requires user login to proceed.

Analyze the page content and look for:
1. Login forms, sign-in buttons, or authentication prompts
2. Input fields for credentials (username/password/email)
3. Messages indicating login is required
4. Registration or sign-up prompts

Respond in JSON format only.`;

    const userMessage = `Analyze the following web page content and determine if the user needs to login to proceed.

Page Content:
${pageContent.slice(0, 2000)}

Please respond in JSON format:
{
  "needsLogin": boolean,
  "confidence": number (0-1),
  "reason": string (explanation),
  "loginElements": string[] (list of detected login-related elements)
}

Only respond with the JSON, no other text.`;

    try {
      const response = await this.llm.chat(systemPrompt, userMessage);
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          needsLogin: false,
          confidence: 0,
          reason: 'Failed to parse LLM response',
        };
      }

      const result = JSON.parse(jsonMatch[0]);
      
      const detectionResult: LoginDetectionResult = {
        needsLogin: result.needsLogin || false,
        confidence: result.confidence || 0,
        reason: result.reason || '',
        loginElements: result.loginElements || [],
      };

      this.setCache(pageContent, detectionResult);
      
      return detectionResult;
    } catch (error: any) {
      console.error('[LoginDetector] Detection failed:', error.message);
      return {
        needsLogin: false,
        confidence: 0,
        reason: `Detection error: ${error.message}`,
      };
    }
  }

  quickDetectLoginRequired(pageContent: string): LoginDetectionResult {
    const loginKeywords = [
      'login', 'sign in', 'signin', 'log in',
      '登录', '登陆', '登入',
      'authentication', 'authenticate',
      'username', 'password', 'email',
      '用户名', '密码', '邮箱',
      'please login', 'please sign in',
      '请登录', '请登陆',
      'create account', 'register', 'sign up',
      '注册', '创建账户',
    ];

    const loginPatterns = [
      /<form[^>]*class="[^"]*login[^"]*"/i,
      /<form[^>]*id="[^"]*login[^"]*"/i,
      /<input[^>]*type="password"/i,
      /<input[^>]*placeholder="[^"]*password[^"]*"/i,
      /<input[^>]*placeholder="[^"]*密码[^"]*"/i,
      /<button[^>]*login[^>]*>/i,
      /<button[^>]*登录[^>]*>/i,
      /<a[^>]*login[^>]*>/i,
      /<a[^>]*登录[^>]*>/i,
    ];

    const detectedKeywords: string[] = [];
    const lowerContent = pageContent.toLowerCase();

    for (const keyword of loginKeywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        detectedKeywords.push(keyword);
      }
    }

    for (const pattern of loginPatterns) {
      if (pattern.test(pageContent)) {
        detectedKeywords.push(`Pattern: ${pattern.source}`);
      }
    }

    const hasPasswordInput = /<input[^>]*type="password"/i.test(pageContent);
    const hasLoginKeyword = detectedKeywords.length > 0;
    const hasLoginPattern = detectedKeywords.some(k => k.startsWith('Pattern:'));

    const needsLogin = (hasPasswordInput && hasLoginKeyword) || hasLoginPattern;
    const confidence = needsLogin ? 0.8 : hasLoginKeyword ? 0.5 : 0;

    return {
      needsLogin,
      confidence,
      reason: needsLogin 
        ? `Detected login elements: ${detectedKeywords.slice(0, 5).join(', ')}`
        : 'No clear login indicators found',
      loginElements: detectedKeywords,
    };
  }
}
