import { useEffect, useState } from 'react';
import { Bot, Loader2, SendHorizontal, Square, X } from 'lucide-react';
import type { AppMode } from '../../pages/content-slot';
import { useChatStore, type ChatMessage } from '../../stores/chat-store';

export function ChatPanel({
  mode,
  appName,
  onClose,
  dismissible,
}: {
  mode: AppMode;
  appName?: string;
  onClose?: () => void;
  dismissible: boolean;
}) {
  // Stable mode: placeholder UI
  if (mode === 'stable') {
    return (
      <ChatShell title="AI 助手" dismissible={dismissible} onClose={onClose}>
        <PlaceholderMessage text="Home 模式暂不支持 AI 助手" />
      </ChatShell>
    );
  }

  // Draft mode without an app selected: prompt UI
  if (!appName) {
    return (
      <ChatShell title="AI Builder" dismissible={dismissible} onClose={onClose}>
        <PlaceholderMessage text="请先选择或创建一个应用" />
      </ChatShell>
    );
  }

  // Draft mode with an app selected: full chat UI
  return (
    <ActiveChat appName={appName} dismissible={dismissible} onClose={onClose} />
  );
}

/** Full chat UI — only rendered when draft + appName is present */
function ActiveChat({
  appName,
  onClose,
  dismissible,
}: {
  appName: string;
  onClose?: () => void;
  dismissible: boolean;
}) {
  const { messages, streaming, connected, send, cancel } = useChatStore();
  const [input, setInput] = useState('');

  useEffect(() => {
    const container = document.getElementById('cz-chat-scroll');
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, streaming]);

  const suggestions = ['新增页面', '生成表单', '调整布局'];
  const introMessage = `我可以继续帮你修改「${appName}」的界面、组件和交互。`;

  const handleSend = (value: string) => {
    if (!value.trim() || streaming || !connected) return;
    send(value);
    setInput('');
  };

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex h-[60px] items-center gap-3 border-b border-[#EEF2F7] px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#18181B] text-white">
          <Bot className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className='truncate font-["Outfit",sans-serif] text-base font-bold text-[#18181B]'>AI Builder</div>
        </div>
        {!connected && <span className="rounded bg-[#FEF2F2] px-1.5 py-0.5 text-[10px] text-[#DC2626]">离线</span>}
        {dismissible && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div id="cz-chat-scroll" className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] px-5 py-4">
        {messages.length === 0 && <AssistantBubble text={introMessage} />}
        {messages.map((message, index) => (
          <ChatBubble key={index} message={message} />
        ))}
        {!messages.length && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSend(suggestion)}
                className="inline-flex h-8 items-center rounded-full border border-[#E2E8F0] bg-white px-3 text-xs font-medium text-[#71717A] transition-colors hover:bg-[#F1F5F9]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {streaming && (
          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            思考中...
          </div>
        )}
      </div>

      <div className="border-t border-[#EEF2F7] px-5 pb-4 pt-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend(input);
              }
            }}
            placeholder="告诉 AI 如何修改这个应用..."
            disabled={!connected}
            className="h-[38px] min-w-0 flex-1 rounded-full border border-[#E2E8F0] bg-white px-4 text-sm text-[#27272A] outline-none placeholder:text-[#A1A1AA] focus:border-[#94A3B8] disabled:opacity-60"
          />

          {streaming ? (
            <button
              type="button"
              onClick={cancel}
              className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#DC2626] text-white transition-colors hover:bg-[#B91C1C]"
              aria-label="Cancel"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSend(input)}
              disabled={!input.trim() || !connected}
              className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#111827] text-white transition-colors hover:bg-[#0B1220] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Lightweight shell with header — used for placeholder states */
function ChatShell({
  title,
  dismissible,
  onClose,
  children,
}: {
  title: string;
  dismissible: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex h-[60px] items-center gap-3 border-b border-[#EEF2F7] px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#18181B] text-white">
          <Bot className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className='truncate font-["Outfit",sans-serif] text-base font-bold text-[#18181B]'>{title}</div>
        </div>
        {dismissible && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** Centered placeholder message for inactive states */
function PlaceholderMessage({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-[#F8FAFC] px-5">
      <div className="text-center text-sm text-[#94A3B8]">{text}</div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[280px] rounded-[12px] rounded-tr-[2px] bg-[#18181B] px-3.5 py-2.5 text-sm leading-relaxed text-white whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'tool') {
    return (
      <div className="rounded-xl bg-white px-3 py-2 text-xs text-[#64748B] shadow-sm">
        <div className="font-semibold text-[#334155]">{message.toolName}</div>
        {message.summary && <div className="mt-1 text-[#94A3B8]">{message.summary}</div>}
      </div>
    );
  }

  return <AssistantBubble text={message.content} />;
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#18181B] text-white">
        <Bot className="h-3.5 w-3.5" />
      </span>
      <div className="max-w-[300px] rounded-[12px] rounded-tl-[2px] bg-[#F4F4F5] px-3.5 py-2.5 text-sm leading-relaxed text-[#27272A] whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}
