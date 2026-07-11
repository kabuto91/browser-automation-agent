"use client";

import { Drawer, Button, Card, Empty, Spin, Alert, Popconfirm, message, Tag } from 'antd';
import { useState, useEffect } from 'react';
import { getAllFixExperiences, deleteFixExperience, FixExperience } from '../utils/fixExperienceDB';

interface FixExperienceDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function FixExperienceDrawer({ open, onClose }: FixExperienceDrawerProps) {
  const [experiences, setExperiences] = useState<FixExperience[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      loadExperiences();
    }
  }, [open]);

  const loadExperiences = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAllFixExperiences();
      setExperiences(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载修复经验失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFixExperience(id);
      message.success('删除成功');
      loadExperiences();
    } catch (err) {
      message.error('删除失败');
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN');
  };

  const getErrorTypeColor = (errorType: string) => {
    const colors: Record<string, string> = {
      timeout: 'orange',
      element_not_found: 'red',
      login_required: 'blue',
      other: 'default',
    };
    return colors[errorType] || 'default';
  };

  const getErrorTypeLabel = (errorType: string) => {
    const labels: Record<string, string> = {
      timeout: '超时',
      element_not_found: '元素未找到',
      login_required: '需要登录',
      other: '其他',
    };
    return labels[errorType] || errorType;
  };

  return (
    <Drawer
      title="修复经验库"
      placement="right"
      size="large"
      width={800}
      onClose={onClose}
      open={open}
    >
      {error && (
        <Alert
          message="错误"
          description={error}
          type="error"
          showIcon
          closable
          className="mb-4"
          onClose={() => setError('')}
        />
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Spin size="large" />
        </div>
      ) : experiences.length === 0 ? (
        <Empty description="暂无修复经验" />
      ) : (
        <div className="space-y-4">
          {experiences.map((exp) => (
            <Card
              key={exp.id}
              title={
                <div className="flex items-center gap-2">
                  <Tag color={getErrorTypeColor(exp.errorType)}>
                    {getErrorTypeLabel(exp.errorType)}
                  </Tag>
                  <span className="text-sm text-gray-500">
                    复用 {exp.successCount} 次
                  </span>
                </div>
              }
              extra={
                <Popconfirm
                  title="确定要删除这条修复经验吗？"
                  onConfirm={() => handleDelete(exp.id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button danger size="small">删除</Button>
                </Popconfirm>
              }
            >
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">问题描述：</div>
                  <div className="text-sm text-gray-900 whitespace-pre-wrap">
                    {exp.problemDescription}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-500">
                    创建时间：{formatDate(exp.createdAt)}
                  </div>
                  {exp.lastUsedAt && (
                    <div className="text-sm text-gray-500">
                      最后使用：{formatDate(exp.lastUsedAt)}
                    </div>
                  )}
                </div>

                <div>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => toggleExpand(exp.id)}
                    className="p-0"
                  >
                    {expandedIds.has(exp.id) ? '收起' : '展开'}修复步骤 ({exp.fixSteps.length} 步)
                  </Button>

                  {expandedIds.has(exp.id) && (
                    <div className="mt-2 bg-gray-50 rounded p-3">
                      {exp.fixSteps.map((step, idx) => (
                        <div key={idx} className="text-xs mb-2 last:mb-0">
                          <span className="text-blue-600 font-medium">{idx + 1}.</span>
                          <span className="ml-2 font-mono">{step.toolName}</span>
                          {step.description && (
                            <span className="ml-2 text-gray-500">- {step.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Drawer>
  );
}
