import { useEffect, useState } from 'react';
import { Bot, Check, ChevronDown } from 'lucide-react';
import { useAppContext } from './app-layout';

interface AgentMeta {
  providers: string[];
  models: Record<string, string[]>;
}

interface AgentConfig {
  provider: string;
  model: string;
}

interface OperatorAgentMeta {
  providers: string[];
  modelProviders: string[];
  models: Record<string, string[]>;
}

interface OperatorAgentConfig {
  provider: string;
  modelProvider: string | null;
  model: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  'claude-code': 'Claude Code',
  'pi-agent-core': 'PI Agent',
};

export function SettingsPage() {
  const { toggleSidebar, sidebarVisible } = useAppContext();

  const [builderConfig, setBuilderConfig] = useState<AgentConfig | null>(null);
  const [builderMeta, setBuilderMeta] = useState<AgentMeta | null>(null);
  const [operatorConfig, setOperatorConfig] = useState<OperatorAgentConfig | null>(null);
  const [operatorMeta, setOperatorMeta] = useState<OperatorAgentMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBuilder, setSavingBuilder] = useState(false);
  const [savingOperator, setSavingOperator] = useState(false);
  const [builderSaveSuccess, setBuilderSaveSuccess] = useState(false);
  const [operatorSaveSuccess, setOperatorSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchConfig();
  }, []);

  async function fetchConfig() {
    setLoading(true);
    setError(null);
    try {
      const [builderRes, operatorRes] = await Promise.all([
        fetch('/api/v1/settings/agent'),
        fetch('/api/v1/settings/operator-agent'),
      ]);
      if (!builderRes.ok) throw new Error(`HTTP ${builderRes.status}`);
      if (!operatorRes.ok) throw new Error(`HTTP ${operatorRes.status}`);
      const builderJson = await builderRes.json();
      const operatorJson = await operatorRes.json();
      setBuilderConfig(builderJson.data);
      setBuilderMeta(builderJson.meta);
      setOperatorConfig(operatorJson.data);
      setOperatorMeta(operatorJson.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleBuilderSave(updates: Partial<AgentConfig>) {
    setSavingBuilder(true);
    setBuilderSaveSuccess(false);
    setError(null);
    try {
      const res = await fetch('/api/v1/settings/agent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setBuilderConfig(json.data);
      setBuilderMeta(json.meta);
      setBuilderSaveSuccess(true);
      setTimeout(() => setBuilderSaveSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingBuilder(false);
    }
  }

  async function handleOperatorSave(updates: Partial<OperatorAgentConfig>) {
    setSavingOperator(true);
    setOperatorSaveSuccess(false);
    setError(null);
    try {
      const res = await fetch('/api/v1/settings/operator-agent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setOperatorConfig(json.data);
      setOperatorMeta(json.meta);
      setOperatorSaveSuccess(true);
      setTimeout(() => setOperatorSaveSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingOperator(false);
    }
  }

  function handleBuilderProviderChange(provider: string) {
    if (!builderMeta) return;
    const models = builderMeta.models[provider] ?? [];
    const model = models[0] ?? '';
    void handleBuilderSave({ provider, model });
  }

  function handleBuilderModelChange(model: string) {
    void handleBuilderSave({ model });
  }

  function handleOperatorProviderChange(provider: string) {
    if (!operatorMeta) return;
    const models = operatorMeta.models[provider] ?? [];
    void handleOperatorSave({
      provider,
      modelProvider: provider === 'pi-agent-core' ? operatorMeta.modelProviders[0] ?? 'anthropic' : null,
      model: provider === 'pi-agent-core' ? 'claude-sonnet-4-20250514' : (models[0] ?? ''),
    });
  }

  function handleOperatorModelProviderChange(modelProvider: string) {
    if (!operatorConfig) return;
    void handleOperatorSave({ modelProvider, model: operatorConfig.model });
  }

  function handleOperatorModelChange(model: string) {
    void handleOperatorSave({ model });
  }

  const builderProviders = builderMeta?.providers ?? [];
  const builderModels = builderConfig ? (builderMeta?.models[builderConfig.provider] ?? []) : [];
  const operatorProviders = operatorMeta?.providers ?? [];
  const operatorModels = operatorConfig ? (operatorMeta?.models[operatorConfig.provider] ?? []) : [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="sticky top-0 z-20 bg-[#F3F5F9] px-4 pb-2 pt-4 md:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Toggle sidebar"
            onClick={toggleSidebar}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#475569] shadow-sm transition-colors hover:bg-[#F8FAFC] md:inline-flex"
          >
            {sidebarVisible ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/></svg>
            )}
          </button>
          <h1 className='m-0 font-["Outfit",sans-serif] text-[26px] font-extrabold tracking-[-0.02em] text-[#18181B]'>
            设置
          </h1>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-4 pb-6 pt-2 md:px-8 md:pb-8">
        {loading ? (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 text-sm text-[#64748B]">
            正在加载设置...
          </div>
        ) : error && !builderConfig && !operatorConfig ? (
          <div className="rounded-2xl border border-[#FECACA] bg-white p-6 text-sm text-[#B91C1C]">
            加载失败：{error}
          </div>
        ) : builderConfig && operatorConfig ? (
          <div className="max-w-2xl space-y-6">
            <section className="rounded-2xl border border-[#E2E8F0] bg-white">
              <div className="flex items-center gap-3 border-b border-[#E2E8F0] px-6 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EEF2FF]">
                  <Bot className="h-5 w-5 text-[#4F46E5]" />
                </div>
                <div>
                  <h2 className='m-0 font-["Outfit",sans-serif] text-base font-bold text-[#18181B]'>
                    Builder Agent 配置
                  </h2>
                  <p className="m-0 text-xs text-[#94A3B8]">选择 AI Agent 引擎和模型</p>
                </div>
                {builderSaveSuccess && (
                  <div className="ml-auto flex items-center gap-1 text-xs font-semibold text-[#16A34A]">
                    <Check className="h-3.5 w-3.5" />
                    已保存
                  </div>
                )}
              </div>

              <div className="space-y-5 p-6">
                {error && (
                  <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-2.5 text-xs text-[#B91C1C]">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-[#334155]">
                    Agent 引擎
                  </label>
                  <p className="m-0 text-xs text-[#94A3B8]">
                    选择使用哪种 AI Agent 来驱动代码生成
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {builderProviders.map((p) => (
                      <button
                        key={p}
                        type="button"
                        disabled={savingBuilder}
                        onClick={() => handleBuilderProviderChange(p)}
                        className={`flex flex-col items-start gap-1 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                          builderConfig.provider === p
                            ? 'border-[#4F46E5] bg-[#EEF2FF]'
                            : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
                        } ${savingBuilder ? 'opacity-60' : ''}`}
                      >
                        <span className="text-sm font-bold text-[#18181B]">
                          {PROVIDER_LABELS[p] ?? p}
                        </span>
                        <span className="text-xs text-[#94A3B8]">
                          {(builderMeta?.models[p] ?? []).length} 个模型可用
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="agent-model-select"
                    className="block text-sm font-semibold text-[#334155]"
                  >
                    模型
                  </label>
                  <p className="m-0 text-xs text-[#94A3B8]">
                    选择 {PROVIDER_LABELS[builderConfig.provider] ?? builderConfig.provider} 使用的具体模型
                  </p>
                  <div className="relative">
                    <select
                      id="agent-model-select"
                      value={builderConfig.model}
                      disabled={savingBuilder}
                      onChange={(e) => handleBuilderModelChange(e.target.value)}
                      className={`h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-white px-3 pr-8 text-sm text-[#334155] outline-none transition-colors focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] ${savingBuilder ? 'opacity-60' : ''}`}
                    >
                      {builderModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#E2E8F0] bg-white">
              <div className="flex items-center gap-3 border-b border-[#E2E8F0] px-6 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EEF2FF]">
                  <Bot className="h-5 w-5 text-[#4F46E5]" />
                </div>
                <div>
                  <h2 className='m-0 font-["Outfit",sans-serif] text-base font-bold text-[#18181B]'>
                    Operator Agent 配置
                  </h2>
                  <p className="m-0 text-xs text-[#94A3B8]">选择 APP 使用页聊天使用的 Agent 引擎和模型</p>
                </div>
                {operatorSaveSuccess && (
                  <div className="ml-auto flex items-center gap-1 text-xs font-semibold text-[#16A34A]">
                    <Check className="h-3.5 w-3.5" />
                    已保存
                  </div>
                )}
              </div>

              <div className="space-y-5 p-6">
                {error && (
                  <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-2.5 text-xs text-[#B91C1C]">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-[#334155]">
                    Agent 引擎
                  </label>
                  <p className="m-0 text-xs text-[#94A3B8]">
                    选择 APP 使用阶段的聊天 Agent
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {operatorProviders.map((p) => (
                      <button
                        key={p}
                        type="button"
                        disabled={savingOperator}
                        onClick={() => handleOperatorProviderChange(p)}
                        className={`flex flex-col items-start gap-1 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                          operatorConfig.provider === p
                            ? 'border-[#4F46E5] bg-[#EEF2FF]'
                            : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
                        } ${savingOperator ? 'opacity-60' : ''}`}
                      >
                        <span className="text-sm font-bold text-[#18181B]">
                          {PROVIDER_LABELS[p] ?? p}
                        </span>
                        <span className="text-xs text-[#94A3B8]">
                          {p === 'pi-agent-core' ? '兼容路径' : `${(operatorMeta?.models[p] ?? []).length} 个模型可用`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {operatorConfig.provider === 'pi-agent-core' ? (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-[#334155]">
                        模型提供方
                      </label>
                      <div className="relative">
                        <select
                          value={operatorConfig.modelProvider ?? ''}
                          disabled={savingOperator}
                          onChange={(e) => handleOperatorModelProviderChange(e.target.value)}
                          className={`h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-white px-3 pr-8 text-sm text-[#334155] outline-none transition-colors focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] ${savingOperator ? 'opacity-60' : ''}`}
                        >
                          {(operatorMeta?.modelProviders ?? []).map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-[#334155]">
                        模型
                      </label>
                      <input
                        value={operatorConfig.model}
                        disabled={savingOperator}
                        onChange={(e) => setOperatorConfig((prev) => (prev ? { ...prev, model: e.target.value } : prev))}
                        onBlur={() => handleOperatorModelChange(operatorConfig.model)}
                        className={`h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-[#334155] outline-none transition-colors focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] ${savingOperator ? 'opacity-60' : ''}`}
                      />
                      <p className="m-0 text-xs text-[#94A3B8]">
                        PI Agent 兼容路径使用自由模型字符串，由对应 model provider 解析。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-[#334155]">
                      模型
                    </label>
                    <p className="m-0 text-xs text-[#94A3B8]">
                      选择 {PROVIDER_LABELS[operatorConfig.provider] ?? operatorConfig.provider} 使用的具体模型
                    </p>
                    <div className="relative">
                      <select
                        value={operatorConfig.model}
                        disabled={savingOperator}
                        onChange={(e) => handleOperatorModelChange(e.target.value)}
                        className={`h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-white px-3 pr-8 text-sm text-[#334155] outline-none transition-colors focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] ${savingOperator ? 'opacity-60' : ''}`}
                      >
                        {operatorModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
