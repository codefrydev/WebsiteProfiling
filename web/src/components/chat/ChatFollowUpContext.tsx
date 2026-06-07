'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface ChatFollowUpContextValue {
  suggestFollowUp: (prompt: string) => void;
}

const ChatFollowUpContext = createContext<ChatFollowUpContextValue | null>(null);

export function ChatFollowUpProvider({
  children,
  suggestFollowUp,
}: {
  children: ReactNode;
  suggestFollowUp: (prompt: string) => void;
}) {
  return (
    <ChatFollowUpContext.Provider value={{ suggestFollowUp }}>{children}</ChatFollowUpContext.Provider>
  );
}

export function useChatFollowUp(): ChatFollowUpContextValue {
  const ctx = useContext(ChatFollowUpContext);
  return ctx ?? { suggestFollowUp: () => {} };
}
