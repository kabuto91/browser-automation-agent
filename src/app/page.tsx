'use client';

import { useState, useCallback, useEffect } from 'react';
import StepLibrary from './components/StepLibrary';
import { indexedDBStorage, SavedTestFlow } from '../storage/indexedDBStorage';

interface TestStep {
  id: string;
  description: string;
  action: any;
  expectedResult: string;
  assertions?: any[];
}

interface TestPlan {
  id: string;
  goal: string;
  steps: TestStep[];
}

interface StepResult {
  stepId: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  error?: string;
  screenshot?: string;
  pageState?: string;
  action?: any;
  description?: string;
}

interface TestReport {
  planId?: string;
  goal: string;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  duration: number;
  conclusion: 'passed' | 'failed' | 'partial';
  stepResults: StepResult[];
  logs?: string[];
  stepDetails?: any[];
  finalPageState?: string;
}

type AppPhase = 'input' | 'planning' | 'review' | 'executing' | 'result';
type ExecutionMode = 'static' | 'dynamic';

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>('input');
  const [testGoal, setTestGoal] = useState('');
  const [plan, setPlan] = useState<TestPlan | null>(null);
  const [report, setReport] = useState<TestReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [headless, setHeadless] = useState(false);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('dynamic');
  const [currentPageState, setCurrentPageState] = useState<string>('');
  const [savingWholeFlow, setSavingWholeFlow] = useState(false);
  const [wholeFlowDialogOpen, setWholeFlowDialogOpen] = useState(false);
  const [wholeFlowName, setWholeFlowName] = useState('');
  const [wholeFlowTags, setWholeFlowTags] = useState('');

  useEffect(() => {
    indexedDBStorage.init().catch(console.error);
  }, []);

  const generatePlan = useCallback(async () => {
    if (!testGoal.trim()) {
      setError('Please enter a test goal');
      return;
    }

    if (executionMode === 'dynamic') {
      await executeDynamicTest();
      return;
    }

    setPhase('planning');
    setError(null);

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: testGoal }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate plan');
      }

      setPlan(data.plan);
      setPhase('review');
    } catch (err: any) {
      setError(err.message);
      setPhase('input');
    }
  }, [testGoal, executionMode]);

  const executeDynamicTest = useCallback(async (predefinedSteps?: any[]) => {
    setPhase('executing');
    setExecutionLogs(['Starting dynamic test execution...']);
    setError(null);

    try {
      const requestBody: any = { goal: testGoal, headless };
      
      if (predefinedSteps && predefinedSteps.length > 0) {
        requestBody.predefinedSteps = predefinedSteps;
        setExecutionLogs(prev => [...prev, `📋 使用 ${predefinedSteps.length} 个预定义步骤`]);
      }

      const response = await fetch('/api/dynamic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute dynamic test');
      }

      setExecutionLogs(data.logs || []);
      setReport({
        goal: data.goal,
        totalSteps: data.totalSteps,
        passedSteps: data.passedSteps,
        failedSteps: data.failedSteps,
        duration: data.duration,
        conclusion: data.conclusion,
        stepResults: data.stepResults,
        logs: data.logs,
        stepDetails: data.stepDetails,
        finalPageState: data.finalPageState,
      });
      setPhase('result');
    } catch (err: any) {
      setError(err.message);
      setPhase('input');
    }
  }, [testGoal, headless]);

  const executeTest = useCallback(async () => {
    if (!plan) return;

    setPhase('executing');
    setExecutionLogs(['Starting test execution...']);
    setError(null);

    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, headless }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute test');
      }

      setReport(data.report);
      setExecutionLogs(prev => [...prev, `Test completed: ${data.report?.conclusion}`]);
      setPhase('result');
    } catch (err: any) {
      setError(err.message);
      setPhase('review');
    }
  }, [plan, headless]);

  const reset = useCallback(() => {
    setPhase('input');
    setTestGoal('');
    setPlan(null);
    setReport(null);
    setError(null);
    setExecutionLogs([]);
    setCurrentPageState('');
    setSavingWholeFlow(false);
    setWholeFlowDialogOpen(false);
    setWholeFlowName('');
    setWholeFlowTags('');
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return '#22c55e';
      case 'failed': return '#ef4444';
      case 'error': return '#f97316';
      case 'skipped': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return '✅';
      case 'failed': return '❌';
      case 'error': return '⚠️';
      case 'skipped': return '⏭️';
      default: return '❓';
    }
  };

  const openWholeFlowSaveDialog = () => {
    if (!report) return;
    setWholeFlowName(testGoal);
    setWholeFlowTags('');
    setWholeFlowDialogOpen(true);
  };

  const saveWholeFlowToLibrary = async () => {
    if (!report || !wholeFlowName.trim()) return;

    const passedSteps = report.stepResults.filter(r => r.status === 'passed' && r.action);
    if (passedSteps.length === 0) {
      setExecutionLogs(prev => [...prev, '⚠️ 没有成功的步骤可以保存']);
      return;
    }

    setSavingWholeFlow(true);
    try {
      const flow: SavedTestFlow = {
        id: `flow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: wholeFlowName,
        description: `包含 ${passedSteps.length} 个步骤的测试流程`,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        useCount: 0,
        steps: passedSteps.map(r => r.action),
        tags: wholeFlowTags.split(',').map(t => t.trim()).filter(t => t),
        variables: [],
        goal: testGoal,
      };

      await indexedDBStorage.saveFlow(flow);
      setExecutionLogs(prev => [...prev, `✅ 测试流程 "${wholeFlowName}" 已保存到步骤库（${passedSteps.length} 个步骤）`]);
    } catch (error) {
      console.error('Failed to save whole flow:', error);
      setExecutionLogs(prev => [...prev, '❌ 保存测试流程失败']);
    } finally {
      setSavingWholeFlow(false);
      setWholeFlowDialogOpen(false);
    }
  };

  const handleLoadFlow = async (flow: SavedTestFlow) => {
    setTestGoal(flow.goal || flow.description);
    setExecutionLogs(prev => [...prev, `✅ 已加载测试流程: ${flow.name}`]);
    
    if (flow.steps && flow.steps.length > 0) {
      const confirmExecute = window.confirm(
        `是否直接执行此测试流程？\n\n包含 ${flow.steps.length} 个步骤\n\n点击"确定"直接执行，点击"取消"仅加载目标`
      );
      
      if (confirmExecute) {
        if (executionMode === 'dynamic') {
          await executeDynamicTest(flow.steps);
        } else {
          const testSteps = flow.steps.map((action, index) => ({
            id: `step-${index}`,
            description: `Step ${index + 1}`,
            action,
            expectedResult: '',
            assertions: [],
            timeout: 10000,
          }));
          
          setPlan({
            id: `plan-${Date.now()}`,
            goal: flow.goal || flow.description,
            steps: testSteps,
          });
          setPhase('review');
          setExecutionLogs(prev => [...prev, `📋 已加载 ${testSteps.length} 个步骤，请审核后执行`]);
        }
      }
    }
  };

  return (
    <main style={{
      minHeight: '100vh',
      padding: '2rem',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: '#fff',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <header style={{
          textAlign: 'center',
          marginBottom: '3rem',
        }}>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 'bold',
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem',
          }}>
            Browser Automation Agent
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem' }}>
            Plan-and-Execute Browser Testing with AI
          </p>
        </header>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#fca5a5',
          }}>
            ⚠️ {error}
          </div>
        )}

        {phase === 'input' && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '16px',
            padding: '2rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
              📝 Enter Test Goal
            </h2>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
              Describe what you want to test in natural language. The AI will interact with the page dynamically.
            </p>
            <textarea
              value={testGoal}
              onChange={(e) => setTestGoal(e.target.value)}
              placeholder="Example: Test the GitHub login page:
1. Navigate to https://github.com/login
2. Verify the page contains 'Sign in' text
3. Verify the login form is visible
4. Take a screenshot"
              style={{
                width: '100%',
                minHeight: '200px',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(0, 0, 0, 0.3)',
                color: '#fff',
                fontSize: '1rem',
                resize: 'vertical',
                marginBottom: '1rem',
              }}
            />
            
            <div style={{
              background: 'rgba(102, 126, 234, 0.1)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              border: '1px solid rgba(102, 126, 234, 0.3)',
            }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#a5b4fc' }}>
                🔄 Execution Mode
              </h3>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: executionMode === 'dynamic' ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                  border: `1px solid ${executionMode === 'dynamic' ? '#22c55e' : 'rgba(255, 255, 255, 0.2)'}`,
                }}>
                  <input
                    type="radio"
                    name="executionMode"
                    value="dynamic"
                    checked={executionMode === 'dynamic'}
                    onChange={() => setExecutionMode('dynamic')}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '500' }}>🤖 Dynamic Mode</div>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                      AI observes page after each action and decides next step
                    </div>
                  </div>
                </label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: executionMode === 'static' ? 'rgba(102, 126, 234, 0.2)' : 'transparent',
                  border: `1px solid ${executionMode === 'static' ? '#667eea' : 'rgba(255, 255, 255, 0.2)'}`,
                }}>
                  <input
                    type="radio"
                    name="executionMode"
                    value="static"
                    checked={executionMode === 'static'}
                    onChange={() => setExecutionMode('static')}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '500' }}>📋 Static Mode</div>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                      Generate plan first, then execute all steps
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={headless}
                  onChange={(e) => setHeadless(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <span>Headless Mode (run browser in background)</span>
              </label>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <StepLibrary onLoadFlow={handleLoadFlow} />
            </div>

            <button
              onClick={generatePlan}
              disabled={!testGoal.trim()}
              style={{
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                borderRadius: '8px',
                border: 'none',
                background: testGoal.trim()
                  ? executionMode === 'dynamic'
                    ? 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)'
                    : 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)'
                  : '#4b5563',
                color: '#fff',
                cursor: testGoal.trim() ? 'pointer' : 'not-allowed',
                transition: 'transform 0.2s',
              }}
            >
              {executionMode === 'dynamic' ? '🚀 Start Dynamic Test' : '🔮 Generate Test Plan'}
            </button>
          </div>
        )}

        {phase === 'planning' && (
          <div style={{
            textAlign: 'center',
            padding: '4rem 2rem',
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              border: '4px solid rgba(102, 126, 234, 0.3)',
              borderTop: '4px solid #667eea',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1.5rem',
            }} />
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              🤔 Analyzing Test Requirements...
            </h2>
            <p style={{ color: '#94a3b8' }}>
              AI is generating a structured test plan based on your goal.
            </p>
          </div>
        )}

        {phase === 'review' && plan && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '16px',
            padding: '2rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              📋 Generated Test Plan
            </h2>
            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
              Goal: {plan.goal}
            </p>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
                Test Steps ({plan.steps.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {plan.steps.map((step, index) => (
                  <div
                    key={step.id}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '8px',
                      padding: '1rem',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginBottom: '0.5rem',
                    }}>
                      <span style={{
                        background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                      }}>
                        {index + 1}
                      </span>
                      <span style={{ fontWeight: '500' }}>{step.description}</span>
                    </div>
                    <div style={{
                      marginLeft: '2.5rem',
                      color: '#94a3b8',
                      fontSize: '0.9rem',
                    }}>
                      <div>Action: <code style={{
                        background: 'rgba(102, 126, 234, 0.2)',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                      }}>{step.action.type}</code></div>
                      {step.expectedResult && (
                        <div style={{ marginTop: '0.25rem' }}>
                          Expected: {step.expectedResult}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={reset}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                ← Back
              </button>
              <button
                onClick={executeTest}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                ▶ Execute Test
              </button>
            </div>
          </div>
        )}

        {phase === 'executing' && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '16px',
            padding: '2rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
              ⚡ Executing Test...
            </h2>
            <div style={{
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              padding: '1rem',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              maxHeight: '400px',
              overflowY: 'auto',
            }}>
              {executionLogs.map((log, index) => (
                <div key={index} style={{ marginBottom: '0.25rem' }}>
                  <span style={{ color: '#6b7280' }}>[{new Date().toLocaleTimeString()}]</span> {log}
                </div>
              ))}
            </div>
          </div>
        )}

        {phase === 'result' && report && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '16px',
            padding: '2rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '2rem',
            }}>
              <h2 style={{ fontSize: '1.5rem' }}>
                📊 Test Results
              </h2>
              <div style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontWeight: 'bold',
                background: report.conclusion === 'passed'
                  ? 'rgba(34, 197, 94, 0.2)'
                  : report.conclusion === 'failed'
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(249, 115, 22, 0.2)',
                color: report.conclusion === 'passed'
                  ? '#22c55e'
                  : report.conclusion === 'failed'
                    ? '#ef4444'
                    : '#f97316',
              }}>
                {report.conclusion.toUpperCase()}
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem',
            }}>
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                  {report.totalSteps}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Total Steps</div>
              </div>
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#22c55e' }}>
                  {report.passedSteps}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Passed</div>
              </div>
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>
                  {report.failedSteps}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Failed</div>
              </div>
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                  {(report.duration / 1000).toFixed(1)}s
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Duration</div>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}>
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>
                Step Details
              </h3>
              {report.passedSteps > 0 && (
                <button
                  onClick={openWholeFlowSaveDialog}
                  disabled={savingWholeFlow}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    cursor: savingWholeFlow ? 'wait' : 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    opacity: savingWholeFlow ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span>💾</span>
                  <span>{savingWholeFlow ? '保存中...' : '保存整个测试流程'}</span>
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {report.stepResults.map((result, index) => {
                return (
                <div
                  key={result.stepId}
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    padding: '1rem',
                    borderLeft: `4px solid ${getStatusColor(result.status)}`,
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span>{getStatusIcon(result.status)}</span>
                      <span style={{ fontWeight: '500' }}>{result.description || result.stepId}</span>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                    }}>
                      <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                        {result.duration}ms
                      </span>
                      <span style={{
                        color: getStatusColor(result.status),
                        textTransform: 'capitalize',
                        fontSize: '0.9rem',
                      }}>
                        {result.status}
                      </span>
                    </div>
                  </div>
                  {result.error && (
                    <div style={{
                      marginTop: '0.5rem',
                      color: '#fca5a5',
                      fontSize: '0.9rem',
                    }}>
                      {result.error}
                    </div>
                  )}
                  {result.pageState && (
                    <details style={{ marginTop: '0.5rem' }}>
                      <summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '0.85rem' }}>
                        View Page State
                      </summary>
                      <pre style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        overflow: 'auto',
                        maxHeight: '200px',
                      }}>
                        {result.pageState}
                      </pre>
                    </details>
                  )}
                </div>
              )})}
            </div>

            {report.finalPageState && (
              <details style={{ marginTop: '1.5rem' }}>
                <summary style={{ 
                  cursor: 'pointer', 
                  color: '#a5b4fc', 
                  fontSize: '1rem',
                  fontWeight: '500',
                }}>
                  🔍 Final Page State
                </summary>
                <pre style={{
                  marginTop: '0.75rem',
                  padding: '1rem',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  overflow: 'auto',
                  maxHeight: '300px',
                }}>
                  {report.finalPageState}
                </pre>
              </details>
            )}

            <div style={{
              marginTop: '2rem',
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={reset}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                ← New Test
              </button>
            </div>
          </div>
        )}
      </div>

      {wholeFlowDialogOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            borderRadius: '16px',
            padding: '2rem',
            width: '90%',
            maxWidth: '500px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>
              💾 保存整个测试流程
            </h2>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#94a3b8',
                fontSize: '0.9rem',
              }}>
                流程名称 *
              </label>
              <input
                type="text"
                value={wholeFlowName}
                onChange={(e) => setWholeFlowName(e.target.value)}
                placeholder="输入测试流程名称"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: '#fff',
                  fontSize: '1rem',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#94a3b8',
                fontSize: '0.9rem',
              }}>
                标签 (用逗号分隔)
              </label>
              <input
                type="text"
                value={wholeFlowTags}
                onChange={(e) => setWholeFlowTags(e.target.value)}
                placeholder="例如: e2e, smoke-test, critical"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: '#fff',
                  fontSize: '1rem',
                }}
              />
            </div>

            {report && (
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                background: 'rgba(16, 185, 129, 0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}>
                <div style={{ color: '#6ee7b7', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  流程信息:
                </div>
                <div style={{ color: '#fff', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                  测试目标: {report.goal}
                </div>
                <div style={{ color: '#fff', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                  成功步骤: {report.passedSteps} / {report.totalSteps}
                </div>
                <div style={{ color: '#fff', fontSize: '0.95rem' }}>
                  执行时长: {(report.duration / 1000).toFixed(1)}s
                </div>
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => {
                  setWholeFlowDialogOpen(false);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                取消
              </button>
              <button
                onClick={saveWholeFlowToLibrary}
                disabled={!wholeFlowName.trim() || savingWholeFlow}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: wholeFlowName.trim() && !savingWholeFlow
                    ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
                    : '#4b5563',
                  color: '#fff',
                  cursor: wholeFlowName.trim() && !savingWholeFlow ? 'pointer' : 'not-allowed',
                  fontSize: '1rem',
                  fontWeight: '500',
                }}
              >
                {savingWholeFlow ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
