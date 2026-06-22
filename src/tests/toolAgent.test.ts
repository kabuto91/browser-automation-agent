/**
 * Tool-Based Agent 测试用例
 */

import { createToolBasedAgent } from '../agent/toolBasedAgent';
import { BrowserToolExecutor, createBrowserToolExecutor } from '../tools/BrowserToolExecutor';
import { PageObserverToolExecutor, createPageObserverToolExecutor } from '../tools/pageObserverTools';
import { browserTools, browserToolNames } from '../tools/browserToolSchemas';
import { pageObserverTools, pageObserverToolNames } from '../tools/pageObserverTools';
import { ToolCallingEngine } from '../llm/toolCallingEngine';
import { getLLMClient } from '../llm/llmClient';
import { BrowserManager } from '../browser/browserManager';

/**
 * 测试 1: 简单导航测试
 */
export async function testSimpleNavigation() {
  console.log('\n=== Test 1: Simple Navigation ===');

  const agent = createToolBasedAgent();
  
  try {
    const result = await agent.run('Navigate to https://example.com and verify the page title');
    
    console.log('Success:', result.success);
    console.log('Result:', result.result);
    console.log('Session:', result.session);
    console.log('Screenshots:', result.screenshots.length);
    
    return result.success;
  } catch (error) {
    console.error('Test failed:', error);
    return false;
  }
}

/**
 * 测试 2: 表单填写测试
 */
export async function testFormFilling() {
  console.log('\n=== Test 2: Form Filling ===');

  const agent = createToolBasedAgent();
  
  try {
    const result = await agent.run(`
      Navigate to https://httpbin.org/forms/post
      Fill in the form with:
      - custname: Test User
      - custtel: 1234567890
      - custemail: test@example.com
      - size: medium
      - topping: cheese
      Submit the form and verify the response
    `);
    
    console.log('Success:', result.success);
    console.log('Result:', result.result);
    
    return result.success;
  } catch (error) {
    console.error('Test failed:', error);
    return false;
  }
}

/**
 * 测试 3: 工具执行器测试
 */
export async function testToolExecutors() {
  console.log('\n=== Test 3: Tool Executors ===');

  const browserManager = new BrowserManager();
  
  try {
    // 启动浏览器
    const page = await browserManager.launch();
    
    // 创建浏览器工具执行器
    const browserExecutor = createBrowserToolExecutor(page);
    
    // 创建页面观察工具执行器
    const pageObserverExecutor = createPageObserverToolExecutor(page);
    
    // 测试导航工具
    console.log('Testing browser_navigate...');
    const navigateResult = await browserExecutor.execute({
      toolName: browserToolNames.NAVIGATE,
      url: 'https://example.com',
    });
    console.log('Navigate result:', navigateResult);
    
    // 测试获取标题工具
    console.log('Testing browser_get_title...');
    const titleResult = await browserExecutor.execute({
      toolName: browserToolNames.GET_TITLE,
    });
    console.log('Title result:', titleResult);
    
    // 测试页面状态工具
    console.log('Testing page_get_state...');
    const stateResult = await pageObserverExecutor.execute({
      toolName: pageObserverToolNames.GET_STATE,
    });
    console.log('State result:', stateResult);
    
    // 关闭浏览器
    await browserManager.close();
    
    return navigateResult.status === 'success' && titleResult.status === 'success';
  } catch (error) {
    console.error('Test failed:', error);
    await browserManager.close();
    return false;
  }
}

/**
 * 测试 4: 工具调用引擎测试
 */
export async function testToolCallingEngine() {
  console.log('\n=== Test 4: Tool Calling Engine ===');

  const browserManager = new BrowserManager();
  const llm = getLLMClient();
  
  try {
    // 启动浏览器
    const page = await browserManager.launch();
    
    // 创建执行器
    const browserExecutor = createBrowserToolExecutor(page);
    const pageObserverExecutor = createPageObserverToolExecutor(page);
    
    // 创建引擎
    const engine = new ToolCallingEngine(llm, [browserExecutor, pageObserverExecutor], {
      maxCalls: 10,
      toolTimeout: 10000,
    });
    
    // 测试简单任务
    const systemPrompt = 'You are a browser automation agent. Navigate to https://example.com and get the page title.';
    const userMessage = 'Navigate to https://example.com and tell me the page title.';
    
    const result = await engine.runToolCallingLoop(
      systemPrompt,
      userMessage,
      [...browserTools, ...pageObserverTools] as any
    );
    
    console.log('Final response:', result.finalResponse);
    console.log('Session:', result.session);
    
    // 关闭浏览器
    await browserManager.close();
    
    return result.session.status === 'completed';
  } catch (error) {
    console.error('Test failed:', error);
    await browserManager.close();
    return false;
  }
}

/**
 * 运行所有测试
 */
export async function runAllTests() {
  console.log('\n========================================');
  console.log('Running Tool-Based Agent Tests');
  console.log('========================================\n');

  const results = {
    test1: false,
    test2: false,
    test3: false,
    test4: false,
  };

  try {
    // 运行测试
    results.test1 = await testSimpleNavigation();
    results.test2 = await testFormFilling();
    results.test3 = await testToolExecutors();
    results.test4 = await testToolCallingEngine();

    // 输出总结
    console.log('\n========================================');
    console.log('Test Results Summary');
    console.log('========================================');
    console.log('Test 1 (Simple Navigation):', results.test1 ? 'PASS' : 'FAIL');
    console.log('Test 2 (Form Filling):', results.test2 ? 'PASS' : 'FAIL');
    console.log('Test 3 (Tool Executors):', results.test3 ? 'PASS' : 'FAIL');
    console.log('Test 4 (Tool Calling Engine):', results.test4 ? 'PASS' : 'FAIL');
    console.log('========================================\n');

    const allPassed = Object.values(results).every(r => r);
    console.log('Overall:', allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');

    return results;
  } catch (error) {
    console.error('Error running tests:', error);
    return results;
  }
}

/**
 * 快速测试（仅测试工具执行器）
 */
export async function quickTest() {
  console.log('\n=== Quick Test: Tool Executors ===');
  return await testToolExecutors();
}

// 如果直接运行此文件
if (require.main === module) {
  runAllTests().catch(console.error);
}