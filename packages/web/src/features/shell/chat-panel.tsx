import { useEffect, useRef, useState } from 'react';
import { Bot, ChevronRight, Loader2, SendHorizontal, Square, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AppMode } from '../../pages/content-slot';
import { useChatStore, type ChatMessage, type ChatToolMessage } from '../../stores/chat-store';

const CHAT_INPUT_MAX_HEIGHT = 132;

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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeInput = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    const nextHeight = Math.min(element.scrollHeight, CHAT_INPUT_MAX_HEIGHT);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > CHAT_INPUT_MAX_HEIGHT ? 'auto' : 'hidden';
  };

  useEffect(() => {
    const container = document.getElementById('cz-chat-scroll');
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    if (!inputRef.current) return;
    resizeInput(inputRef.current);
  }, [input]);

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
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              resizeInput(event.currentTarget);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend(input);
              }
            }}
            placeholder="告诉 AI 如何修改这个应用..."
            disabled={!connected}
            className="min-h-[38px] max-h-[132px] min-w-0 flex-1 resize-none rounded-[20px] border border-[#E2E8F0] bg-white px-4 py-[9px] text-sm leading-5 text-[#27272A] outline-none placeholder:text-[#A1A1AA] focus:border-[#94A3B8] disabled:opacity-60"
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
        <div className="max-w-[85%] rounded-[12px] rounded-tr-[2px] bg-[#18181B] px-3.5 py-2.5 text-sm leading-relaxed text-white whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'tool') {
    return <ToolBubble message={message} />;
  }

  return <AssistantBubble text={message.content} />;
}

function ToolBubble({ message }: { message: ChatToolMessage }) {
  const [expanded, setExpanded] = useState(message.status === 'error');

  if (message.status === 'running') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#64748B]">
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#94A3B8]" />
        <span className="font-medium text-[#334155]">{message.toolName}</span>
      </div>
    );
  }

  if (message.status === 'error') {
    return (
      <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs">
        <div className="font-medium text-[#DC2626]">{message.toolName}</div>
        {message.summary && <div className="mt-1 text-[#B91C1C]">{message.summary}</div>}
      </div>
    );
  }

  // done status — collapsible
  return (
    <button
      type="button"
      onClick={() => setExpanded((prev) => !prev)}
      className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-left text-xs text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
    >
      <div className="flex items-center gap-1.5">
        <ChevronRight className={`h-3 w-3 shrink-0 text-[#94A3B8] transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span className="font-medium text-[#334155]">{message.toolName}</span>
        {!expanded && message.summary && (
          <span className="min-w-0 flex-1 truncate text-[#94A3B8]">{message.summary}</span>
        )}
      </div>
      {expanded && message.summary && (
        <div className="mt-1.5 pl-[18px] text-[#64748B] whitespace-pre-wrap">{message.summary}</div>
      )}
    </button>
  );
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#18181B] text-white">
        <Bot className="h-3.5 w-3.5" />
      </span>
      <div
        className="max-w-[calc(100%-38px)] rounded-[12px] rounded-tl-[2px] bg-[#F4F4F5] px-3.5 py-2.5 text-sm leading-relaxed text-[#27272A]
          [&_p]:m-0 [&_p+p]:mt-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
          [&_li]:my-0.5 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[#D4D4D8] [&_blockquote]:pl-3 [&_blockquote]:text-[#52525B]
          [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-[#E4E4E7] [&_pre]:p-2
          [&_code]:rounded [&_code]:bg-[#E4E4E7] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px]
          [&_pre>code]:bg-transparent [&_pre>code]:p-0
          [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-[#D4D4D8] [&_th]:px-2 [&_th]:py-1
          [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-[#D4D4D8] [&_td]:px-2 [&_td]:py-1
          [&_a]:text-[#1D4ED8] [&_a]:underline [&_a]:underline-offset-2"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}
