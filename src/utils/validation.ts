import { z } from 'zod';

const BrowserActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('navigate'),
    url: z.string().url().max(2048),
  }),
  z.object({
    type: z.literal('click'),
    selector: z.string().max(500),
  }),
  z.object({
    type: z.literal('type'),
    selector: z.string().max(500),
    text: z.string().max(10000),
  }),
  z.object({
    type: z.literal('select'),
    selector: z.string().max(500),
    value: z.string().max(1000),
  }),
  z.object({
    type: z.literal('hover'),
    selector: z.string().max(500),
  }),
  z.object({
    type: z.literal('scroll'),
    selector: z.string().max(500).optional(),
    x: z.number().int().min(-10000).max(10000).optional(),
    y: z.number().int().min(-10000).max(10000).optional(),
  }),
  z.object({
    type: z.literal('wait'),
    selector: z.string().max(500).optional(),
    ms: z.number().int().min(0).max(60000).optional(),
  }),
  z.object({
    type: z.literal('screenshot'),
    name: z.string().max(200).regex(/^[a-zA-Z0-9_-]+$/),
  }),
  z.object({
    type: z.literal('press'),
    key: z.string().max(50),
    selector: z.string().max(500).optional(),
  }),
]);

const DynamicRequestSchema = z.object({
  goal: z.string().min(1).max(1000),
  headless: z.boolean().default(true),
  predefinedSteps: z.array(BrowserActionSchema).max(50).optional(),
  cdpEndpoint: z.string().url().max(500).optional(),
  sessionId: z.string().max(100).optional(),
});

const ExecuteRequestSchema = z.object({
  plan: z.object({
    id: z.string().max(100),
    goal: z.string().min(1).max(1000),
    steps: z.array(
      z.object({
        id: z.string().max(100).optional(),
        description: z.string().max(500),
        action: BrowserActionSchema,
        expectedResult: z.string().max(500).optional(),
        assertions: z.array(z.any()).max(20).optional(),
        timeout: z.number().int().min(1000).max(60000).optional(),
      })
    ).max(100),
  }),
  headless: z.boolean().default(true),
  cdpEndpoint: z.string().url().max(500).optional(),
});

const PlanRequestSchema = z.object({
  goal: z.string().min(1).max(1000),
  url: z.string().url().max(2048).optional(),
});

export function validateDynamicRequest(data: unknown) {
  return DynamicRequestSchema.safeParse(data);
}

export function validateExecuteRequest(data: unknown) {
  return ExecuteRequestSchema.safeParse(data);
}

export function validatePlanRequest(data: unknown) {
  return PlanRequestSchema.safeParse(data);
}

export function sanitizeSelector(selector: string): string {
  const dangerousPatterns = [
    /javascript:/i,
    /on\w+\s*=/i,
    /<script/i,
    /eval\(/i,
    /Function\(/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(selector)) {
      throw new Error(`Selector contains potentially dangerous content: ${selector}`);
    }
  }

  return selector;
}

export function sanitizeUrl(url: string, allowedDomains?: string[]): string {
  try {
    const urlObj = new URL(url);
    
    if (allowedDomains && allowedDomains.length > 0) {
      const isAllowed = allowedDomains.some(
        domain => urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      );
      
      if (!isAllowed) {
        throw new Error(`URL domain ${urlObj.hostname} is not in allowed list`);
      }
    }

    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
    if (dangerousProtocols.includes(urlObj.protocol)) {
      throw new Error(`Dangerous protocol detected: ${urlObj.protocol}`);
    }

    return url;
  } catch (error) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

export type DynamicRequestInput = z.infer<typeof DynamicRequestSchema>;
export type ExecuteRequestInput = z.infer<typeof ExecuteRequestSchema>;
export type PlanRequestInput = z.infer<typeof PlanRequestSchema>;
export type BrowserActionInput = z.infer<typeof BrowserActionSchema>;