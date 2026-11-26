'use client';

import React from 'react';
import { ChatWorkspace } from '../../components/chat/ChatWorkspace';

export default function ChatPage() {
  return (
    <div className="flex-1 flex flex-col min-w-0">
      <ChatWorkspace />
    </div>
  );
}
