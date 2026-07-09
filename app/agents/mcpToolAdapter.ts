// MCP 工具适配器 - 将 MCP 工具转换为 LangChain Tool

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  client: Client;
  onToolCall?: (toolName: string, args: any, result: any) => Promise<void>;
}

/**
 * 将 JSON Schema 转换为 Zod Schema
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  const type = schema.type as string;
  
  switch (type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      if (schema.items) {
        const itemSchema = jsonSchemaToZod(schema.items as Record<string, unknown>);
        return z.array(itemSchema);
      }
      return z.array(z.any());
    case "object":
      if (schema.properties) {
        const properties = schema.properties as Record<string, Record<string, unknown>>;
        const required = (schema.required as string[]) || [];
        const zodShape: Record<string, z.ZodType> = {};
        
        for (const [key, propSchema] of Object.entries(properties)) {
          let fieldSchema = jsonSchemaToZod(propSchema);
          if (!required.includes(key)) {
            fieldSchema = fieldSchema.optional();
          }
          zodShape[key] = fieldSchema;
        }
        
        return z.object(zodShape);
      }
      return z.record(z.string(), z.any());
    default:
      return z.any();
  }
}

/**
 * MCP 工具适配器 - 将 MCP 工具包装为 LangChain Tool
 */
export class MCPToolAdapter extends DynamicStructuredTool {
  constructor(mcpTool: MCPToolInfo) {
    const zodSchema = jsonSchemaToZod(mcpTool.inputSchema);
    
    super({
      name: mcpTool.name,
      description: mcpTool.description || `Execute ${mcpTool.name} tool`,
      schema: zodSchema as z.ZodObject<any>,
      func: async (input: any) => {
        try {
          const result = await mcpTool.client.callTool({
            name: mcpTool.name,
            arguments: input,
          });
          
          // 调用回调函数（用于登录拦截等逻辑）
          if (mcpTool.onToolCall) {
            await mcpTool.onToolCall(mcpTool.name, input, result);
          }
          
          // 处理返回结果
          if (typeof result.content === "string") {
            return result.content;
          } else if (Array.isArray(result.content)) {
            // 处理数组类型的 content（如浏览器快照）
            return JSON.stringify(result.content);
          } else if (result.content && typeof result.content === "object") {
            return JSON.stringify(result.content);
          }
          
          return String(result.content || "");
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`MCP Tool ${mcpTool.name} execution failed:`, errorMsg);
          return `Error: ${errorMsg}`;
        }
      },
    });
  }
}

/**
 * 将 MCP 工具列表转换为 LangChain Tool 列表
 */
export function convertMCPToolsToLangChain(
  mcpTools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
  client: Client
): MCPToolAdapter[] {
  return mcpTools.map(tool => 
    new MCPToolAdapter({
      ...tool,
      client,
    })
  );
}
