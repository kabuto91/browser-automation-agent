'use client';

import { useState, useEffect } from 'react';
import { indexedDBStorage, SavedTestFlow } from '../../storage/indexedDBStorage';

interface StepLibraryProps {
  onLoadFlow?: (flow: SavedTestFlow) => void;
}

export default function StepLibrary({ onLoadFlow }: StepLibraryProps) {
  const [flows, setFlows] = useState<SavedTestFlow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportData, setExportData] = useState('');

  useEffect(() => {
    loadFlows();
    indexedDBStorage.init().catch(console.error);
  }, []);

  const loadFlows = async () => {
    try {
      setLoading(true);
      await indexedDBStorage.init();
      const allFlows = await indexedDBStorage.getAllFlows();
      setFlows(allFlows);
    } catch (error) {
      console.error('Failed to load flows:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    try {
      const results = await indexedDBStorage.searchFlows(searchQuery, selectedTags);
      setFlows(results);
    } catch (error) {
      console.error('Failed to search flows:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个测试流程吗？')) return;
    
    try {
      await indexedDBStorage.deleteFlow(id);
      await loadFlows();
    } catch (error) {
      console.error('Failed to delete flow:', error);
    }
  };

  const handleLoad = async (flow: SavedTestFlow) => {
    try {
      await indexedDBStorage.updateFlowUsage(flow.id);
      if (onLoadFlow) {
        onLoadFlow(flow);
      }
    } catch (error) {
      console.error('Failed to load flow:', error);
    }
  };

  const handleExport = async () => {
    try {
      const data = await indexedDBStorage.exportFlows();
      setExportData(data);
      setExportDialogOpen(true);
    } catch (error) {
      console.error('Failed to export flows:', error);
    }
  };

  const handleImport = async () => {
    if (!importData.trim()) return;
    
    try {
      const count = await indexedDBStorage.importFlows(importData);
      alert(`成功导入 ${count} 个测试流程`);
      setImportDialogOpen(false);
      setImportData('');
      await loadFlows();
    } catch (error: any) {
      alert('导入失败: ' + error.message);
    }
  };

  const handleCopyExport = () => {
    navigator.clipboard.writeText(exportData);
    alert('已复制到剪贴板');
  };

  const handleDownloadExport = () => {
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-flows-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportData(content);
    };
    reader.readAsText(file);
  };

  const allTags = Array.from(new Set(flows.flatMap(f => f.tags)));

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
      }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
          📚 步骤库
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setImportDialogOpen(true)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            📥 导入
          </button>
          <button
            onClick={handleExport}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            📤 导出
          </button>
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <input
          type="text"
          placeholder="搜索测试流程..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
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
          onClick={handleSearch}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          搜索
        </button>
      </div>

      {allTags.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            标签筛选:
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => {
                  if (selectedTags.includes(tag)) {
                    setSelectedTags(selectedTags.filter(t => t !== tag));
                  } else {
                    setSelectedTags([...selectedTags, tag]);
                  }
                  handleSearch();
                }}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '999px',
                  border: '1px solid',
                  borderColor: selectedTags.includes(tag) ? '#667eea' : 'rgba(255, 255, 255, 0.2)',
                  background: selectedTags.includes(tag) ? 'rgba(102, 126, 234, 0.2)' : 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
          加载中...
        </div>
      ) : flows.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          color: '#94a3b8',
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
          <div>暂无保存的测试流程</div>
          <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
            执行测试后点击"保存整个测试流程"按钮来保存
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {flows.map(flow => (
            <div
              key={flow.id}
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                padding: '1rem',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
              }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>
                    {flow.name}
                  </h3>
                  <p style={{
                    margin: '0 0 0.75rem 0',
                    color: '#94a3b8',
                    fontSize: '0.9rem',
                  }}>
                    {flow.description}
                  </p>
                  <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginBottom: '0.75rem',
                  }}>
                    {flow.tags.map(tag => (
                      <span
                        key={tag}
                        style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          background: 'rgba(102, 126, 234, 0.2)',
                          color: '#a5b4fc',
                          fontSize: '0.8rem',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '1rem',
                    fontSize: '0.85rem',
                    color: '#64748b',
                  }}>
                    <span>📦 {flow.steps.length} 个步骤</span>
                    <span>🕐 {new Date(flow.createdAt).toLocaleDateString()}</span>
                    <span>👁️ {flow.useCount} 次使用</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleLoad(flow)}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    使用
                  </button>
                  <button
                    onClick={() => handleDelete(flow.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      background: 'transparent',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {importDialogOpen && (
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
            maxWidth: '600px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>
              📥 导入测试流程
            </h2>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                color: '#94a3b8',
                fontSize: '0.9rem',
              }}>
                选择文件
              </label>
              <input
                type="file"
                accept=".json"
                onChange={handleFileImport}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: '#fff',
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
                或粘贴 JSON 数据
              </label>
              <textarea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder='粘贴导出的 JSON 数据...'
                rows={6}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => {
                  setImportDialogOpen(false);
                  setImportData('');
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={!importData.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: importData.trim() 
                    ? 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)'
                    : '#4b5563',
                  color: '#fff',
                  cursor: importData.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                导入
              </button>
            </div>
          </div>
        </div>
      )}

      {exportDialogOpen && (
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
            maxWidth: '600px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>
              📤 导出测试流程
            </h2>

            <div style={{ marginBottom: '1.5rem' }}>
              <textarea
                value={exportData}
                readOnly
                rows={10}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={handleCopyExport}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                📋 复制
              </button>
              <button
                onClick={handleDownloadExport}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                💾 下载
              </button>
              <button
                onClick={() => setExportDialogOpen(false)}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
