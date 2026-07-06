"use client";

import { Button } from 'antd';
import { useState } from 'react';
import ChatDrawer from './components/ChatDrawer';

export default function Home() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Web 自动化测试 Agent</h1>
      <Button type="primary" size="large" onClick={() => setDrawerOpen(true)}>
        打开测试面板
      </Button>
      <ChatDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
