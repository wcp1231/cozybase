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

type SettingsTabId = 'general' | 'openclaw' | 'agent';

interface SettingsTab {
  id: SettingsTabId;
  label: string;
}

interface OpenClawStatus {
  enabled: boolean;
  openClawDirPath: string;
  skillsDirPath: string;
  skillFilePath: string;
  acpxConfigPath: string;
  openClawDirExists: boolean;
  skillsDirExists: boolean;
  skillFileExists: boolean;
  acpxExecutableExists: boolean;
  acpxExecutablePath: string | null;
  acpxConfigExists: boolean;
  acpxConfigValid: boolean;
  acpxConfigIssue: string | null;
}

interface AgentSettingsBundle {
  builder: {
    data: AgentConfig;
    meta: AgentMeta;
  };
  operator: {
    data: AdvancedAgentConfig;
    meta: AdvancedAgentMeta;
  };
  cozybase: {
    data: AdvancedAgentConfig;
    meta: AdvancedAgentMeta;
  };
}

type AgentKind = keyof AgentSettingsBundle;

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

const SETTINGS_TABS: SettingsTab[] = [
  { id: 'general', label: '通用设置' },
  { id: 'openclaw', label: 'OpenClaw' },
  { id: 'agent', label: 'Agents' },
];

export function SettingsPage() {
  const { toggleSidebar, sidebarVisible } = useAppContext();

  const [activeTab, setActiveTab] = useState<SettingsTabId>('agent');
  const [openClawEnabled, setOpenClawEnabled] = useState(false);
  const [openClawStatus, setOpenClawStatus] = useState<OpenClawStatus | null>(null);
  const [openClawLoading, setOpenClawLoading] = useState(true);
  const [openClawToggleSaving, setOpenClawToggleSaving] = useState(false);
  const [openClawActionLoading, setOpenClawActionLoading] = useState<'configure-acpx' | 'create-skills-dir' | null>(null);
  const [openClawError, setOpenClawError] = useState<string | null>(null);
  const [openClawSuccess, setOpenClawSuccess] = useState<string | null>(null);
  const [builderConfig, setBuilderConfig] = useState<AgentConfig | null>(null);
  const [builderMeta, setBuilderMeta] = useState<AgentMeta | null>(null);
  const [operatorConfig, setOperatorConfig] = useState<AdvancedAgentConfig | null>(null);
  const [operatorMeta, setOperatorMeta] = useState<AdvancedAgentMeta | null>(null);
  const [cozybaseConfig, setCozybaseConfig] = useState<AdvancedAgentConfig | null>(null);
  const [cozybaseMeta, setCozybaseMeta] = useState<AdvancedAgentMeta | null>(null);
  const [agentLoading, setAgentLoading] = useState(true);
  const [savingBuilder, setSavingBuilder] = useState(false);
  const [savingOperator, setSavingOperator] = useState(false);
  const [savingCozybase, setSavingCozybase] = useState(false);
  const [builderSaveSuccess, setBuilderSaveSuccess] = useState(false);
  const [operatorSaveSuccess, setOperatorSaveSuccess] = useState(false);
  const [cozybaseSaveSuccess, setCozybaseSaveSuccess] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([fetchAgentConfig(), fetchOpenClawStatus()]);
  }, []);

  useEffect(() => {
    if (!openClawEnabled || !openClawStatus?.openClawDirExists || openClawActionLoading) {
      return;
    }

    if (!openClawStatus.acpxExecutableExists) {
      return;
    }

    if (!openClawStatus.acpxConfigExists || !openClawStatus.acpxConfigValid) {
      void runOpenClawAction(
        '/api/v1/settings/openclaw/configure-acpx',
        'configure-acpx',
        '已自动更新 ~/.acpx/config.json。',
      );
      return;
    }

    if (!openClawStatus.skillFileExists) {
      void runOpenClawAction(
        '/api/v1/settings/openclaw/create-skills-dir',
        'create-skills-dir',
        '已自动创建 ~/.openclaw/skills/cozybase，并复制模板文件。',
      );
    }
  }, [openClawActionLoading, openClawEnabled, openClawStatus]);

  async function fetchAgentConfig() {
    setAgentLoading(true);
    setAgentError(null);
    try {
      const res = await fetch('/api/v1/settings/agents');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json() as { data: AgentSettingsBundle };
      setBuilderConfig(json.data.builder.data);
      setBuilderMeta(json.data.builder.meta);
      setOperatorConfig(json.data.operator.data);
      setOperatorMeta(json.data.operator.meta);
      setCozybaseConfig(json.data.cozybase.data);
      setCozybaseMeta(json.data.cozybase.meta);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentLoading(false);
    }
  }

  async function fetchOpenClawStatus() {
    setOpenClawLoading(true);
    setOpenClawError(null);
    try {
      const res = await fetch('/api/v1/settings/openclaw');
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      const nextStatus = json.data as OpenClawStatus;
      setOpenClawStatus(nextStatus);
      setOpenClawEnabled(nextStatus.enabled && nextStatus.openClawDirExists);
    } catch (err) {
      setOpenClawError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpenClawLoading(false);
    }
  }

  async function saveOpenClawEnabled(enabled: boolean) {
    setOpenClawToggleSaving(true);
    setOpenClawError(null);
    try {
      const res = await fetch('/api/v1/settings/openclaw', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      const nextStatus = json.data as OpenClawStatus;
      setOpenClawStatus(nextStatus);
      setOpenClawEnabled(nextStatus.enabled && nextStatus.openClawDirExists);
    } catch (err) {
      setOpenClawError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpenClawToggleSaving(false);
    }
  }

  async function saveSettings<TConfig extends AgentConfig, TMeta extends AgentMeta | AdvancedAgentMeta>(
    kind: AgentKind,
    updates: Partial<TConfig>,
    setSaving: Dispatch<SetStateAction<boolean>>,
    setSaveSuccess: Dispatch<SetStateAction<boolean>>,
    setConfig: Dispatch<SetStateAction<TConfig | null>>,
    setMeta: Dispatch<SetStateAction<TMeta | null>>,
  ) {
    setSaving(true);
    setSaveSuccess(false);
    setAgentError(null);
    try {
      const res = await fetch('/api/v1/settings/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [kind]: updates }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }

      const json = await res.json() as { data: AgentSettingsBundle };
      setConfig(json.data[kind].data as TConfig);
      setMeta(json.data[kind].meta as TMeta);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function runOpenClawAction(
    path: '/api/v1/settings/openclaw/configure-acpx' | '/api/v1/settings/openclaw/create-skills-dir',
    action: 'configure-acpx' | 'create-skills-dir',
    successMessage: string,
  ) {
    setOpenClawActionLoading(action);
    setOpenClawError(null);
    setOpenClawSuccess(null);

    try {
      const res = await fetch(path, { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      setOpenClawStatus(json.data as OpenClawStatus);
      setOpenClawSuccess(successMessage);
      setTimeout(() => setOpenClawSuccess(null), 2500);
    } catch (err) {
      setOpenClawError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpenClawActionLoading(null);
    }
  }

  function handleBuilderProviderChange(provider: string) {
    if (!builderMeta) return;
    const models = builderMeta.models[provider] ?? [];
    void saveSettings<AgentConfig, AgentMeta>(
      'builder',
      { provider, model: models[0] ?? '' },
      setSavingBuilder,
      setBuilderSaveSuccess,
      setBuilderConfig,
      setBuilderMeta,
    );
  }

  function handleBuilderModelChange(model: string) {
    void saveSettings<AgentConfig, AgentMeta>(
      'builder',
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
      'operator',
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
      'operator',
      { modelProvider, model: operatorConfig.model },
      setSavingOperator,
      setOperatorSaveSuccess,
      setOperatorConfig,
      setOperatorMeta,
    );
  }

  function handleOperatorModelChange(model: string) {
    void saveSettings<AdvancedAgentConfig, AdvancedAgentMeta>(
      'operator',
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
      'cozybase',
      { provider, model: models[0] ?? '' },
      setSavingCozybase,
      setCozybaseSaveSuccess,
      setCozybaseConfig,
      setCozybaseMeta,
    );
  }

  function handleCozybaseModelChange(model: string) {
    void saveSettings<AdvancedAgentConfig, AdvancedAgentMeta>(
      'cozybase',
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
        <div className="space-y-6">
          <div className="sticky top-0 z-10 -mx-1 overflow-x-auto px-1 pb-1">
            <div
              role="tablist"
              aria-label="设置分类"
              className="inline-flex min-w-full rounded-2xl border border-[#E2E8F0] bg-white p-1 shadow-sm md:min-w-0"
            >
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  id={`settings-tab-${tab.id}`}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`settings-panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[#18181B] text-white'
                      : 'text-[#475569] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <section
            id={`settings-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`settings-tab-${activeTab}`}
            className="max-w-2xl"
          >
            {activeTab === 'general' ? (
              <div className="min-h-64 rounded-2xl border border-dashed border-[#CBD5E1] bg-white/70 p-10" />
            ) : null}

            {activeTab === 'openclaw' ? (
              openClawLoading ? (
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 text-sm text-[#64748B]">
                  正在检测 OpenClaw 环境...
                </div>
              ) : openClawError && !openClawStatus ? (
                <div className="rounded-2xl border border-[#FECACA] bg-white p-6 text-sm text-[#B91C1C]">
                  检测失败：{openClawError}
                </div>
              ) : openClawStatus ? (
                <div className="space-y-6">
                  <section className="rounded-2xl border border-[#E2E8F0] bg-white">
                    <div className="flex items-center justify-between gap-4 px-6 py-5">
                      <div className="space-y-1">
                        <h2 className='m-0 font-["Outfit",sans-serif] text-base font-bold text-[#18181B]'>
                          连接 OpenClaw
                        </h2>
                        <p className="m-0 text-sm text-[#94A3B8]">
                          打开后展示 OpenClaw 所需环境的检测结果，并自动完成可修复项。
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-label="连接 OpenClaw"
                        aria-checked={openClawEnabled}
                        disabled={!openClawStatus.openClawDirExists || openClawToggleSaving}
                        onClick={() => void saveOpenClawEnabled(!openClawEnabled)}
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                          openClawEnabled ? 'bg-[#18181B]' : 'bg-[#CBD5E1]'
                        } ${!openClawStatus.openClawDirExists || openClawToggleSaving ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                            openClawEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {!openClawStatus.openClawDirExists ? (
                      <div className="border-t border-[#FEE2E2] bg-[#FFF7ED] px-6 py-4 text-sm text-[#9A3412]">
                        未检测到 OpenClaw 目录 <code className="rounded bg-white px-1 py-0.5 text-xs">{openClawStatus.openClawDirPath}</code>，当前无法开启 OpenClaw 功能。
                      </div>
                    ) : null}
                  </section>

                  {openClawEnabled ? (
                    <div className="space-y-4">
                      {openClawError ? (
                        <div className="rounded-2xl border border-[#FECACA] bg-white p-4 text-sm text-[#B91C1C]">
                          {openClawError}
                        </div>
                      ) : null}

                      {openClawSuccess ? (
                        <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-sm text-[#166534]">
                          {openClawSuccess}
                        </div>
                      ) : null}

                      <OpenClawStatusCard
                        title="acpx 环境与配置"
                        ok={openClawStatus.acpxExecutableExists && openClawStatus.acpxConfigExists && openClawStatus.acpxConfigValid}
                        pathLabel={openClawStatus.acpxConfigPath}
                        successText="已检测到 acpx 可执行文件，且 CozyBase ACP 配置可用。"
                        failureText={
                          !openClawStatus.acpxExecutableExists
                            ? '未检测到 acpx 可执行文件。请先按照 OpenClaw / acpx 官方安装说明完成安装，并确保 `acpx` 已加入 PATH。'
                            : openClawActionLoading === 'configure-acpx'
                              ? '已检测到 acpx，正在自动检测并修复 ~/.acpx/config.json。'
                              : (openClawStatus.acpxConfigIssue ?? '正在自动检测 ~/.acpx/config.json。')
                        }
                      />

                      {openClawStatus.acpxExecutableExists && openClawStatus.acpxConfigExists && openClawStatus.acpxConfigValid ? (
                        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                          <div className="flex items-center gap-2">
                            <h3 className="m-0 text-sm font-semibold text-[#18181B]">CozyBase skills 模板</h3>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              openClawStatus.skillFileExists
                                ? 'bg-[#DCFCE7] text-[#166534]'
                                : 'bg-[#FEF3C7] text-[#92400E]'
                            }`}>
                              {openClawStatus.skillFileExists ? '已就绪' : '自动准备中'}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-[#64748B]">
                            路径：
                            <code className="ml-1 rounded bg-[#F8FAFC] px-1.5 py-0.5 text-[11px] text-[#334155]">{openClawStatus.skillFilePath}</code>
                          </p>
                          <p className="mb-0 mt-2 text-sm text-[#475569]">
                            {openClawStatus.skillFileExists
                              ? '已准备好 CozyBase skills 模板文件。'
                              : openClawActionLoading === 'create-skills-dir'
                                ? '正在自动创建 skills 目录并复制 SKILL.md 模板。'
                                : 'acpx 配置通过后，将自动创建 skills 目录并复制 SKILL.md 模板。'}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null
            ) : null}

            {activeTab === 'agent' ? (
              agentLoading ? (
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 text-sm text-[#64748B]">
                  正在加载设置...
                </div>
              ) : agentError && !builderConfig && !operatorConfig && !cozybaseConfig ? (
                <div className="rounded-2xl border border-[#FECACA] bg-white p-6 text-sm text-[#B91C1C]">
                  加载失败：{agentError}
                </div>
              ) : builderConfig && builderMeta && operatorConfig && operatorMeta && cozybaseConfig && cozybaseMeta ? (
                <div className="space-y-6">
                  <AgentSettingsCard
                    title="Builder Agent 配置"
                    description="选择 AI Agent 引擎和模型"
                    providerDescription="选择使用哪种 AI Agent 来驱动代码生成"
                    modelDescription={`选择 ${PROVIDER_LABELS[builderConfig.provider] ?? builderConfig.provider} 使用的具体模型`}
                    config={builderConfig}
                    meta={builderMeta}
                    saving={savingBuilder}
                    saveSuccess={builderSaveSuccess}
                    error={agentError}
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
                    error={agentError}
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
                    error={agentError}
                    onProviderChange={handleCozybaseProviderChange}
                    onModelChange={handleCozybaseModelChange}
                  />
                </div>
              ) : null
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

function OpenClawStatusCard({
  title,
  ok,
  pathLabel,
  successText,
  failureText,
}: {
  title: string;
  ok: boolean;
  pathLabel?: string | null;
  successText: string;
  failureText: string;
}) {
  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-sm font-semibold text-[#18181B]">{title}</h3>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#B91C1C]'}`}>
            {ok ? '已就绪' : '待处理'}
          </span>
        </div>
        {pathLabel ? (
          <p className="m-0 text-xs text-[#64748B]">
            路径：
            <code className="ml-1 rounded bg-[#F8FAFC] px-1.5 py-0.5 text-[11px] text-[#334155]">{pathLabel}</code>
          </p>
        ) : null}
        <p className={`m-0 text-sm ${ok ? 'text-[#166534]' : 'text-[#92400E]'}`}>
          {ok ? successText : failureText}
        </p>
      </div>
    </section>
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
