import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
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

interface AdvancedAgentMeta extends AgentMeta {
  modelProviders: string[];
}

interface AdvancedAgentConfig extends AgentConfig {
  modelProvider: string | null;
}

interface ProviderOption {
  value: string;
  disabled: boolean;
  helperText: string;
}

interface AgentSettingsCardProps<TConfig extends AgentConfig> {
  title: string;
  description: string;
  providerDescription: string;
  modelDescription: string;
  config: TConfig;
  meta: AgentMeta | AdvancedAgentMeta;
  saving: boolean;
  saveSuccess: boolean;
  error: string | null;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onModelProviderChange?: (modelProvider: string) => void;
  onModelInputChange?: (value: string) => void;
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
  const [operatorConfig, setOperatorConfig] = useState<AdvancedAgentConfig | null>(null);
  const [operatorMeta, setOperatorMeta] = useState<AdvancedAgentMeta | null>(null);
  const [cozybaseConfig, setCozybaseConfig] = useState<AdvancedAgentConfig | null>(null);
  const [cozybaseMeta, setCozybaseMeta] = useState<AdvancedAgentMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBuilder, setSavingBuilder] = useState(false);
  const [savingOperator, setSavingOperator] = useState(false);
  const [savingCozybase, setSavingCozybase] = useState(false);
  const [builderSaveSuccess, setBuilderSaveSuccess] = useState(false);
  const [operatorSaveSuccess, setOperatorSaveSuccess] = useState(false);
  const [cozybaseSaveSuccess, setCozybaseSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchConfig();
  }, []);

  async function fetchConfig() {
    setLoading(true);
    setError(null);
    try {
      const [builderRes, operatorRes, cozybaseRes] = await Promise.all([
        fetch('/api/v1/settings/agent'),
        fetch('/api/v1/settings/operator-agent'),
        fetch('/api/v1/settings/cozybase-agent'),
      ]);
      if (!builderRes.ok) throw new Error(`HTTP ${builderRes.status}`);
      if (!operatorRes.ok) throw new Error(`HTTP ${operatorRes.status}`);
      if (!cozybaseRes.ok) throw new Error(`HTTP ${cozybaseRes.status}`);

      const builderJson = await builderRes.json();
      const operatorJson = await operatorRes.json();
      const cozybaseJson = await cozybaseRes.json();

      setBuilderConfig(builderJson.data);
      setBuilderMeta(builderJson.meta);
      setOperatorConfig(operatorJson.data);
      setOperatorMeta(operatorJson.meta);
      setCozybaseConfig(cozybaseJson.data);
      setCozybaseMeta(cozybaseJson.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings<TConfig extends AgentConfig, TMeta extends AgentMeta | AdvancedAgentMeta>(
    path: string,
    updates: Partial<TConfig>,
    setSaving: Dispatch<SetStateAction<boolean>>,
    setSaveSuccess: Dispatch<SetStateAction<boolean>>,
    setConfig: Dispatch<SetStateAction<TConfig | null>>,
    setMeta: Dispatch<SetStateAction<TMeta | null>>,
  ) {
    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const res = await fetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      setConfig(json.data);
      setMeta(json.meta);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleBuilderProviderChange(provider: string) {
    if (!builderMeta) return;
    const models = builderMeta.models[provider] ?? [];
    void saveSettings<AgentConfig, AgentMeta>(
      '/api/v1/settings/agent',
      { provider, model: models[0] ?? '' },
      setSavingBuilder,
      setBuilderSaveSuccess,
      setBuilderConfig,
      setBuilderMeta,
    );
  }

  function handleBuilderModelChange(model: string) {
    void saveSettings<AgentConfig, AgentMeta>(
      '/api/v1/settings/agent',
      { model },
      setSavingBuilder,
      setBuilderSaveSuccess,
      setBuilderConfig,
      setBuilderMeta,
    );
  }

  function handleOperatorProviderChange(provider: string) {
    if (!operatorMeta) return;
    const models = operatorMeta.models[provider] ?? [];
    void saveSettings<AdvancedAgentConfig, AdvancedAgentMeta>(
      '/api/v1/settings/operator-agent',
      {
        provider,
        modelProvider: provider === 'pi-agent-core' ? operatorMeta.modelProviders[0] ?? 'anthropic' : null,
        model: provider === 'pi-agent-core' ? 'claude-sonnet-4-20250514' : (models[0] ?? ''),
      },
      setSavingOperator,
      setOperatorSaveSuccess,
      setOperatorConfig,
      setOperatorMeta,
    );
  }

  function handleOperatorModelProviderChange(modelProvider: string) {
    if (!operatorConfig) return;
    void saveSettings<AdvancedAgentConfig, AdvancedAgentMeta>(
      '/api/v1/settings/operator-agent',
      { modelProvider, model: operatorConfig.model },
      setSavingOperator,
      setOperatorSaveSuccess,
      setOperatorConfig,
      setOperatorMeta,
    );
  }

  function handleOperatorModelChange(model: string) {
    void saveSettings<AdvancedAgentConfig, AdvancedAgentMeta>(
      '/api/v1/settings/operator-agent',
      { model },
      setSavingOperator,
      setOperatorSaveSuccess,
      setOperatorConfig,
      setOperatorMeta,
    );
  }

  function handleCozybaseProviderChange(provider: string) {
    if (!cozybaseMeta) return;
    const models = cozybaseMeta.models[provider] ?? [];
    void saveSettings<AdvancedAgentConfig, AdvancedAgentMeta>(
      '/api/v1/settings/cozybase-agent',
      { provider, model: models[0] ?? '' },
      setSavingCozybase,
      setCozybaseSaveSuccess,
      setCozybaseConfig,
      setCozybaseMeta,
    );
  }

  function handleCozybaseModelChange(model: string) {
    void saveSettings<AdvancedAgentConfig, AdvancedAgentMeta>(
      '/api/v1/settings/cozybase-agent',
      { model },
      setSavingCozybase,
      setCozybaseSaveSuccess,
      setCozybaseConfig,
      setCozybaseMeta,
    );
  }

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
        ) : error && !builderConfig && !operatorConfig && !cozybaseConfig ? (
          <div className="rounded-2xl border border-[#FECACA] bg-white p-6 text-sm text-[#B91C1C]">
            加载失败：{error}
          </div>
        ) : builderConfig && builderMeta && operatorConfig && operatorMeta && cozybaseConfig && cozybaseMeta ? (
          <div className="max-w-2xl space-y-6">
            <AgentSettingsCard
              title="Builder Agent 配置"
              description="选择 AI Agent 引擎和模型"
              providerDescription="选择使用哪种 AI Agent 来驱动代码生成"
              modelDescription={`选择 ${PROVIDER_LABELS[builderConfig.provider] ?? builderConfig.provider} 使用的具体模型`}
              config={builderConfig}
              meta={builderMeta}
              saving={savingBuilder}
              saveSuccess={builderSaveSuccess}
              error={error}
              onProviderChange={handleBuilderProviderChange}
              onModelChange={handleBuilderModelChange}
            />

            <AgentSettingsCard
              title="Operator Agent 配置"
              description="选择 APP 使用页聊天使用的 Agent 引擎和模型"
              providerDescription="选择 APP 使用阶段的聊天 Agent"
              modelDescription={`选择 ${PROVIDER_LABELS[operatorConfig.provider] ?? operatorConfig.provider} 使用的具体模型`}
              config={operatorConfig}
              meta={operatorMeta}
              saving={savingOperator}
              saveSuccess={operatorSaveSuccess}
              error={error}
              onProviderChange={handleOperatorProviderChange}
              onModelChange={handleOperatorModelChange}
              onModelProviderChange={handleOperatorModelProviderChange}
              onModelInputChange={(value) => setOperatorConfig((prev) => (prev ? { ...prev, model: value } : prev))}
            />

            <AgentSettingsCard
              title="CozyBase Agent 配置"
              description="选择平台级 CozyBase Agent 使用的引擎和模型"
              providerDescription="选择平台统一入口 CozyBase Agent 的执行引擎"
              modelDescription={`选择 ${PROVIDER_LABELS[cozybaseConfig.provider] ?? cozybaseConfig.provider} 使用的具体模型`}
              config={cozybaseConfig}
              meta={cozybaseMeta}
              saving={savingCozybase}
              saveSuccess={cozybaseSaveSuccess}
              error={error}
              onProviderChange={handleCozybaseProviderChange}
              onModelChange={handleCozybaseModelChange}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}

function AgentSettingsCard<TConfig extends AgentConfig>({
  title,
  description,
  providerDescription,
  modelDescription,
  config,
  meta,
  saving,
  saveSuccess,
  error,
  onProviderChange,
  onModelChange,
  onModelProviderChange,
  onModelInputChange,
}: AgentSettingsCardProps<TConfig>) {
  const providerOptions = buildProviderOptions(meta.providers, meta.models);
  const models = meta.models[config.provider] ?? [];
  const showPiCompatFields =
    config.provider === 'pi-agent-core'
    && 'modelProviders' in meta
    && Array.isArray(meta.modelProviders)
    && typeof onModelProviderChange === 'function'
    && typeof onModelInputChange === 'function';
  const advancedConfig = config as unknown as AdvancedAgentConfig;

  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white">
      <div className="flex items-center gap-3 border-b border-[#E2E8F0] px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EEF2FF]">
          <Bot className="h-5 w-5 text-[#4F46E5]" />
        </div>
        <div>
          <h2 className='m-0 font-["Outfit",sans-serif] text-base font-bold text-[#18181B]'>
            {title}
          </h2>
          <p className="m-0 text-xs text-[#94A3B8]">{description}</p>
        </div>
        {saveSuccess && (
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
            {providerDescription}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {providerOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={saving || option.disabled}
                onClick={() => onProviderChange(option.value)}
                className={`flex flex-col items-start gap-1 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                  config.provider === option.value
                    ? 'border-[#4F46E5] bg-[#EEF2FF]'
                    : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
                } ${saving || option.disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <span className="text-sm font-bold text-[#18181B]">
                  {PROVIDER_LABELS[option.value] ?? option.value}
                </span>
                <span className="text-xs text-[#94A3B8]">
                  {option.helperText}
                </span>
              </button>
            ))}
          </div>
        </div>

        {showPiCompatFields ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-[#334155]">
                模型提供方
              </label>
              <div className="relative">
                <select
                  value={advancedConfig.modelProvider ?? ''}
                  disabled={saving}
                  onChange={(e) => onModelProviderChange(e.target.value)}
                  className={`h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-white px-3 pr-8 text-sm text-[#334155] outline-none transition-colors focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] ${saving ? 'opacity-60' : ''}`}
                >
                  {meta.modelProviders.map((value) => (
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
                value={config.model}
                disabled={saving}
                onChange={(e) => onModelInputChange(e.target.value)}
                onBlur={() => onModelChange(config.model)}
                className={`h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-[#334155] outline-none transition-colors focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] ${saving ? 'opacity-60' : ''}`}
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
              {modelDescription}
            </p>
            <div className="relative">
              <select
                value={config.model}
                disabled={saving}
                onChange={(e) => onModelChange(e.target.value)}
                className={`h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-white px-3 pr-8 text-sm text-[#334155] outline-none transition-colors focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] ${saving ? 'opacity-60' : ''}`}
              >
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function buildProviderOptions(
  providers: string[],
  models: Record<string, string[]>,
): ProviderOption[] {
  const ordered = [...providers];
  if (!ordered.includes('pi-agent-core')) {
    ordered.push('pi-agent-core');
  }

  return ordered.map((value) => ({
    value,
    disabled: value === 'pi-agent-core',
    helperText:
      value === 'pi-agent-core'
        ? '即将支持'
        : `${models[value]?.length ?? 0} 个模型可用`,
  }));
}
