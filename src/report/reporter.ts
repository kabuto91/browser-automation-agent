import { TestReport, StepResult } from '../types';
import { config } from '../config';
import * as fs from 'fs';
import * as path from 'path';

export class Reporter {
  generateReport(
    planId: string,
    goal: string,
    results: StepResult[],
    totalDuration: number
  ): TestReport {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(
      r => r.status === 'failed' || r.status === 'error'
    ).length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    let conclusion: 'passed' | 'failed' | 'partial';
    if (failed === 0 && skipped === 0) {
      conclusion = 'passed';
    } else if (passed === 0) {
      conclusion = 'failed';
    } else {
      conclusion = 'partial';
    }

    return {
      planId,
      goal,
      totalSteps: results.length,
      passedSteps: passed,
      failedSteps: failed,
      duration: totalDuration,
      stepResults: results,
      conclusion,
    };
  }

  async saveReport(report: TestReport, outputPath?: string): Promise<string> {
    const dir = config.report.outputDir;
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const format = config.report.format;
    const fileName = `test-report-${Date.now()}`;
    
    let filePath: string;
    let content: string;

    switch (format) {
      case 'json':
        filePath = path.join(dir, `${fileName}.json`);
        content = JSON.stringify(report, null, 2);
        break;
      case 'markdown':
        filePath = path.join(dir, `${fileName}.md`);
        content = this.toMarkdown(report);
        break;
      case 'html':
      default:
        filePath = outputPath || path.join(dir, `${fileName}.html`);
        content = this.toHtml(report);
        break;
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  private toHtml(report: TestReport): string {
    const rows = report.stepResults
      .map(r => {
        const statusIcon = this.getStatusIcon(r.status);
        const screenshotCell = r.screenshot 
          ? `<img src="${r.screenshot}" width="200" onclick="window.open('${r.screenshot}')"/>` 
          : '-';
        const errorCell = r.error 
          ? `<span class="error">${this.escapeHtml(r.error)}</span>` 
          : '-';
        const assertionsCell = r.assertionResults 
          ? r.assertionResults.map(a => 
              `<span class="${a.passed ? 'passed' : 'failed'}">${a.assertion.type}</span>`
            ).join(' ')
          : '-';

        return `
        <tr class="${r.status}">
          <td>${r.stepId}</td>
          <td>${statusIcon} ${r.status}</td>
          <td>${r.duration}ms</td>
          <td>${assertionsCell}</td>
          <td>${errorCell}</td>
          <td>${screenshotCell}</td>
        </tr>`;
      })
      .join('');

    const summaryClass = report.conclusion === 'passed' 
      ? 'summary-passed' 
      : report.conclusion === 'failed' 
        ? 'summary-failed' 
        : 'summary-partial';

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report - ${this.escapeHtml(report.goal)}</title>
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      max-width: 1400px;
      margin: 0 auto;
      background: #f5f5f5;
    }
    h1 { color: #333; margin-bottom: 10px; }
    .summary { 
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .summary-passed { border-left: 4px solid #4caf50; }
    .summary-failed { border-left: 4px solid #f44336; }
    .summary-partial { border-left: 4px solid #ff9800; }
    .stats { display: flex; gap: 20px; flex-wrap: wrap; }
    .stat { 
      background: #f9f9f9; 
      padding: 10px 15px; 
      border-radius: 4px;
      min-width: 100px;
    }
    .stat-label { color: #666; font-size: 12px; }
    .stat-value { font-size: 24px; font-weight: bold; }
    table { 
      border-collapse: collapse; 
      width: 100%;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td { 
      border: 1px solid #e0e0e0; 
      padding: 12px; 
      text-align: left;
    }
    th { background: #f5f5f5; font-weight: 600; }
    .passed { background: #e8f5e9; }
    .failed { background: #ffebee; }
    .error { background: #fff3e0; }
    .skipped { background: #f5f5f5; }
    .status-icon { font-size: 16px; }
    img { 
      cursor: pointer;
      border-radius: 4px;
      transition: transform 0.2s;
    }
    img:hover { transform: scale(1.05); }
    .error { color: #d32f2f; font-size: 12px; }
    .passed { color: #388e3c; }
    .failed { color: #d32f2f; }
    .conclusion { 
      font-size: 18px; 
      font-weight: bold;
      padding: 10px 20px;
      border-radius: 4px;
      display: inline-block;
      margin-top: 10px;
    }
    .conclusion.passed { background: #4caf50; color: white; }
    .conclusion.failed { background: #f44336; color: white; }
    .conclusion.partial { background: #ff9800; color: white; }
  </style>
</head>
<body>
  <h1>Test Report</h1>
  
  <div class="summary ${summaryClass}">
    <p><strong>Goal:</strong> ${this.escapeHtml(report.goal)}</p>
    <p><strong>Plan ID:</strong> ${report.planId}</p>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-label">Total Steps</div>
        <div class="stat-value">${report.totalSteps}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Passed</div>
        <div class="stat-value" style="color: #4caf50;">${report.passedSteps}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Failed</div>
        <div class="stat-value" style="color: #f44336;">${report.failedSteps}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Duration</div>
        <div class="stat-value">${this.formatDuration(report.duration)}</div>
      </div>
    </div>
    
    <div class="conclusion ${report.conclusion}">
      ${report.conclusion.toUpperCase()}
    </div>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Step ID</th>
        <th>Status</th>
        <th>Duration</th>
        <th>Assertions</th>
        <th>Error</th>
        <th>Screenshot</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
  }

  private toMarkdown(report: TestReport): string {
    const rows = report.stepResults
      .map(r => `| ${r.stepId} | ${r.status} | ${r.duration}ms | ${r.error || '-'} |`)
      .join('\n');

    return `# Test Report

## Summary
- **Goal:** ${report.goal}
- **Plan ID:** ${report.planId}
- **Total Steps:** ${report.totalSteps}
- **Passed:** ${report.passedSteps}
- **Failed:** ${report.failedSteps}
- **Duration:** ${this.formatDuration(report.duration)}
- **Conclusion:** ${report.conclusion}

## Steps

| Step ID | Status | Duration | Error |
|---------|--------|----------|-------|
${rows}
`;
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'passed': return '✅';
      case 'failed': return '❌';
      case 'error': return '⚠️';
      case 'skipped': return '⏭️';
      default: return '❓';
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
