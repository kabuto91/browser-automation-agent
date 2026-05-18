'use client';

import { useState, useEffect } from 'react';

interface SavedStep {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  lastUsed: string;
  useCount: number;
  steps: any[];
  tags: string[];
  variables: string[];
  goal?: string;
}

interface StepLibraryProps {
  onSelectStep: (step: SavedStep) => void;
}

export default function StepLibrary({ onSelectStep }: StepLibraryProps) {
  const [steps, setSteps] = useState<SavedStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => {
    if (showLibrary) {
      loadSteps();
    }
  }, [showLibrary]);

  const loadSteps = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/steps?action=list');
      const data = await response.json();
      setSteps(data.steps || []);
    } catch (error) {
      console.error('Failed to load steps:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchSteps = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('action', 'search');
      if (searchQuery) params.append('query', searchQuery);
      if (selectedTags.length > 0) params.append('tags', selectedTags.join(','));

      const response = await fetch(`/api/steps?${params.toString()}`);
      const data = await response.json();
      setSteps(data.steps || []);
    } catch (error) {
      console.error('Failed to search steps:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteStep = async (stepId: string) => {
    if (!confirm('Are you sure you want to delete this step?')) return;

    try {
      const response = await fetch(`/api/steps?stepId=${stepId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      
      if (data.success) {
        setSteps(steps.filter(s => s.id !== stepId));
      }
    } catch (error) {
      console.error('Failed to delete step:', error);
    }
  };

  const getAllTags = (): string[] => {
    const tagSet = new Set<string>();
    steps.forEach(s => s.tags.forEach(t => tagSet.add(t)));
    return Array.from(tagSet);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!showLibrary) {
    return (
      <button
        onClick={() => setShowLibrary(true)}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          background: 'rgba(102, 126, 234, 0.1)',
          color: '#a5b4fc',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        📚 步骤库 ({steps.length || '...'})
      </button>
    );
  }

  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '16px',
      padding: '2rem',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      marginBottom: '2rem',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
      }}>
        <h2 style={{ fontSize: '1.5rem' }}>
          📚 步骤库
        </h2>
        <button
          onClick={() => setShowLibrary(false)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'transparent',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          ✕ 关闭
        </button>
      </div>

      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索步骤..."
          style={{
            flex: 1,
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(0, 0, 0, 0.3)',
            color: '#fff',
            fontSize: '1rem',
          }}
        />
        <button
          onClick={searchSteps}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          🔍 搜索
        </button>
      </div>

      {getAllTags().length > 0 && (
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
        }}>
          {getAllTags().map(tag => (
            <button
              key={tag}
              onClick={() => {
                if (selectedTags.includes(tag)) {
                  setSelectedTags(selectedTags.filter(t => t !== tag));
                } else {
                  setSelectedTags([...selectedTags, tag]);
                }
              }}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: selectedTags.includes(tag)
                  ? 'rgba(102, 126, 234, 0.3)'
                  : 'transparent',
                color: selectedTags.includes(tag) ? '#a5b4fc' : '#94a3b8',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(102, 126, 234, 0.3)',
            borderTop: '3px solid #667eea',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto',
          }} />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      ) : steps.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: '#94a3b8',
        }}>
          暂无保存的步骤。执行测试时勾选"保存成功步骤"即可自动保存。
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: '1rem',
        }}>
          {steps.map(step => (
            <div
              key={step.id}
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '12px',
                padding: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '0.75rem',
              }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                    {step.name}
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                    {step.description}
                  </p>
                </div>
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                }}>
                  <button
                    onClick={() => onSelectStep(step)}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    使用
                  </button>
                  <button
                    onClick={() => deleteStep(step.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      background: 'transparent',
                      color: '#fca5a5',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                marginBottom: '0.75rem',
              }}>
                {step.tags.map(tag => (
                  <span
                    key={tag}
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      background: 'rgba(102, 126, 234, 0.2)',
                      color: '#a5b4fc',
                      fontSize: '0.85rem',
                    }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              <div style={{
                display: 'flex',
                gap: '1.5rem',
                color: '#6b7280',
                fontSize: '0.85rem',
              }}>
                <span>使用次数: {step.useCount}</span>
                <span>创建: {formatDate(step.createdAt)}</span>
                <span>最后使用: {formatDate(step.lastUsed)}</span>
              </div>

              {step.steps.length > 0 && (
                <details style={{ marginTop: '0.75rem' }}>
                  <summary style={{
                    cursor: 'pointer',
                    color: '#94a3b8',
                    fontSize: '0.85rem',
                  }}>
                    查看步骤详情 ({step.steps.length} 个操作)
                  </summary>
                  <pre style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    overflow: 'auto',
                    maxHeight: '200px',
                  }}>
                    {JSON.stringify(step.steps, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
