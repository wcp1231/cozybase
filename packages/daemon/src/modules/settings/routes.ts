import { Hono } from 'hono';
import type { PlatformRepository } from '../../core/platform-repository';
import { DAEMON_LOG_LEVELS, type DaemonLogLevel } from '../../core/daemon-logger';
import { resolveDaemonLogFilePath } from '../../runtime-paths';
import {
  VALID_AGENT_PROVIDERS,
  VALID_MODELS,
  getDefaultAgentModel,
  isValidAgentProvider,
  isValidModelForProvider,
  resolveEffectiveAgentConfig,
} from './agent-config';
import {
  getDefaultOperatorModel,
  getOperatorProviderMeta,
  isValidOperatorModelForProvider,
  isValidPiAgentModel,
  normalizeOperatorAgentProvider,
  normalizeOperatorModelProvider,
  resolveEffectiveOperatorAgentConfig,
} from './operator-agent-config';
import {
  getCozyBaseProviderMeta,
  getDefaultCozyBaseModel,
  normalizeCozyBaseAgentProvider,
  normalizeCozyBaseModelProvider,
  resolveEffectiveCozyBaseAgentConfig,
  isValidCozyBaseModelForProvider,
} from './cozybase-agent-config';
import {
  configureAcpxForCozybase,
  ensureOpenClawSkillsDir,
  type OpenClawStatus,
  readOpenClawStatus,
} from './openclaw';

class SettingsValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function createSettingsRoutes(platformRepo: PlatformRepository) {
  const app = new Hono();

  app.get('/settings/general', (c) => {
    return c.json(readGeneralSettingsResponse(platformRepo));
  });

  app.put('/settings/general', async (c) => {
    const body = await c.req.json<{ logLevel?: string }>();
    try {
      updateGeneralSettings(platformRepo, body);
      return c.json(readGeneralSettingsResponse(platformRepo));
    } catch (error) {
      if (error instanceof SettingsValidationError) {
        return c.json({ error: { code: error.code, message: error.message } }, 400);
      }
      throw error;
    }
  });

  app.get('/settings/agent', (c) => {
    return c.json(readBuilderAgentSettingsResponse(platformRepo));
  });

  app.get('/settings/agents', (c) => {
    return c.json({
      data: {
        builder: readBuilderAgentSettingsResponse(platformRepo),
        operator: readOperatorAgentSettingsResponse(platformRepo),
        cozybase: readCozyBaseAgentSettingsResponse(platformRepo),
      },
    });
  });

  app.put('/settings/agents', async (c) => {
    const body = await c.req.json<{
      builder?: { provider?: string; model?: string };
      operator?: { provider?: string; modelProvider?: string | null; model?: string };
      cozybase?: { provider?: string; modelProvider?: string | null; model?: string };
    }>();

    try {
      if (body.builder) {
        updateBuilderAgentSettings(platformRepo, body.builder);
      }
      if (body.operator) {
        updateOperatorAgentSettings(platformRepo, body.operator);
      }
      if (body.cozybase) {
        updateCozyBaseAgentSettings(platformRepo, body.cozybase);
      }
    } catch (error) {
      if (error instanceof SettingsValidationError) {
        return c.json({ error: { code: error.code, message: error.message } }, 400);
      }
      throw error;
    }

    return c.json({
      data: {
        builder: readBuilderAgentSettingsResponse(platformRepo),
        operator: readOperatorAgentSettingsResponse(platformRepo),
        cozybase: readCozyBaseAgentSettingsResponse(platformRepo),
      },
    });
  });

  app.put('/settings/agent', async (c) => {
    const body = await c.req.json<{ provider?: string; model?: string }>();
    try {
      updateBuilderAgentSettings(platformRepo, body);
      return c.json(readBuilderAgentSettingsResponse(platformRepo));
    } catch (error) {
      if (error instanceof SettingsValidationError) {
        return c.json({ error: { code: error.code, message: error.message } }, 400);
      }
      throw error;
    }
  });

  app.get('/settings/operator-agent', (c) => {
    return c.json(readOperatorAgentSettingsResponse(platformRepo));
  });

  app.put('/settings/operator-agent', async (c) => {
    const body = await c.req.json<{ provider?: string; modelProvider?: string | null; model?: string }>();
    try {
      updateOperatorAgentSettings(platformRepo, body);
      return c.json(readOperatorAgentSettingsResponse(platformRepo));
    } catch (error) {
      if (error instanceof SettingsValidationError) {
        return c.json({ error: { code: error.code, message: error.message } }, 400);
      }
      throw error;
    }
  });

  app.get('/settings/cozybase-agent', (c) => {
    return c.json(readCozyBaseAgentSettingsResponse(platformRepo));
  });

  app.put('/settings/cozybase-agent', async (c) => {
    const body = await c.req.json<{ provider?: string; modelProvider?: string | null; model?: string }>();
    try {
      updateCozyBaseAgentSettings(platformRepo, body);
      return c.json(readCozyBaseAgentSettingsResponse(platformRepo));
    } catch (error) {
      if (error instanceof SettingsValidationError) {
        return c.json({ error: { code: error.code, message: error.message } }, 400);
      }
      throw error;
    }
  });

  app.get('/settings/openclaw', (c) => {
    return c.json({
      data: readOpenClawSettings(platformRepo),
    });
  });

  app.put('/settings/openclaw', async (c) => {
    const body = await c.req.json<{ enabled?: boolean }>();
    if (typeof body.enabled !== 'boolean') {
      return c.json(
        {
          error: {
            code: 'INVALID_ENABLED',
            message: '`enabled` must be a boolean.',
          },
        },
        400,
      );
    }

    platformRepo.settings.set('openclaw.enabled', body.enabled ? 'true' : 'false');

    return c.json({
      data: readOpenClawSettings(platformRepo),
    });
  });

  app.post('/settings/openclaw/configure-acpx', (c) => {
    try {
      return c.json({
        data: {
          ...readOpenClawSettings(platformRepo),
          ...configureAcpxForCozybase(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '配置 ~/.acpx/config.json 失败。';
      return c.json(
        {
          error: {
            code: 'OPENCLAW_CONFIGURE_ACPX_FAILED',
            message,
          },
        },
        400,
      );
    }
  });

  app.post('/settings/openclaw/create-skills-dir', (c) => {
    const status = readOpenClawStatus();
    if (!status.openClawDirExists) {
      return c.json(
        {
          error: {
            code: 'OPENCLAW_DIR_NOT_FOUND',
            message: '未检测到 ~/.openclaw 目录，无法创建 CozyBase skills 目录。',
          },
        },
        400,
      );
    }

    return c.json({
      data: {
        ...readOpenClawSettings(platformRepo),
        ...ensureOpenClawSkillsDir(),
      },
    });
  });

  return app;
}

function readAgentConfig(platformRepo: PlatformRepository) {
  return resolveEffectiveAgentConfig({
    storedProvider: platformRepo.settings.get('agent.provider'),
    storedModel: platformRepo.settings.get('agent.model'),
    envProvider: process.env.COZYBASE_AGENT_PROVIDER,
    envModel: process.env.COZYBASE_AGENT_MODEL,
  });
}

function readOperatorAgentConfig(platformRepo: PlatformRepository) {
  return resolveEffectiveOperatorAgentConfig({
    agentProvider: platformRepo.settings.get('operator.agent_provider'),
    modelProvider: platformRepo.settings.get('operator.model_provider'),
    model: platformRepo.settings.get('operator.model'),
  });
}

function readCozyBaseAgentConfig(platformRepo: PlatformRepository) {
  return resolveEffectiveCozyBaseAgentConfig({
    agentProvider: platformRepo.settings.get('cozybase_agent.agent_provider'),
    modelProvider: platformRepo.settings.get('cozybase_agent.model_provider'),
    model: platformRepo.settings.get('cozybase_agent.model'),
    envAgentProvider: process.env.COZYBASE_AGENT_PROVIDER,
    envModelProvider: process.env.COZYBASE_AGENT_MODEL_PROVIDER,
    envModel: process.env.COZYBASE_AGENT_MODEL,
  });
}

function readOpenClawSettings(platformRepo: PlatformRepository): OpenClawStatus & { enabled: boolean } {
  return {
    enabled: platformRepo.settings.get('openclaw.enabled') === 'true',
    ...readOpenClawStatus(),
  };
}

function readGeneralSettingsResponse(platformRepo: PlatformRepository) {
  const stored = platformRepo.settings.get('daemon.log_level');
  const logLevel = isDaemonLogLevel(stored) ? stored : 'INFO';

  return {
    data: {
      logLevel,
      logFilePath: resolveDaemonLogFilePath(),
    },
    meta: {
      logLevels: [...DAEMON_LOG_LEVELS],
    },
  };
}

function updateGeneralSettings(
  platformRepo: PlatformRepository,
  body: { logLevel?: string },
) {
  if (!isDaemonLogLevel(body.logLevel)) {
    throw new SettingsValidationError(
      'INVALID_LOG_LEVEL',
      `Invalid log level. Must be one of: ${DAEMON_LOG_LEVELS.join(', ')}`,
    );
  }

  platformRepo.settings.set('daemon.log_level', body.logLevel);
}

function updateBuilderAgentSettings(
  platformRepo: PlatformRepository,
  body: { provider?: string; model?: string },
) {
  const current = readAgentConfig(platformRepo);

  if (body.provider !== undefined) {
    if (typeof body.provider !== 'string' || !isValidAgentProvider(body.provider)) {
      throw new SettingsValidationError(
        'INVALID_PROVIDER',
        `Invalid provider. Must be one of: ${VALID_AGENT_PROVIDERS.join(', ')}`,
      );
    }
  }

  if (body.model !== undefined && typeof body.model !== 'string') {
    throw new SettingsValidationError('INVALID_MODEL', 'Model must be a non-empty string');
  }

  const provider = body.provider ?? current.provider;
  const model =
    body.model !== undefined
      ? body.model.trim()
      : body.provider !== undefined && body.provider !== current.provider
        ? getDefaultAgentModel(provider)
        : current.model;

  if (!model || !isValidModelForProvider(provider, model)) {
    throw new SettingsValidationError(
      'INVALID_MODEL',
      `Invalid model for provider '${provider}'. Must be one of: ${VALID_MODELS[provider].join(', ')}`,
    );
  }

  platformRepo.transaction(() => {
    platformRepo.settings.set('agent.provider', provider);
    platformRepo.settings.set('agent.model', model);
  });
}

function updateOperatorAgentSettings(
  platformRepo: PlatformRepository,
  body: { provider?: string; modelProvider?: string | null; model?: string },
) {
  const current = readOperatorAgentConfig(platformRepo);

  if (body.provider !== undefined && !normalizeOperatorAgentProvider(body.provider)) {
    const meta = getOperatorProviderMeta();
    throw new SettingsValidationError(
      'INVALID_PROVIDER',
      `Invalid provider. Must be one of: ${meta.providers.join(', ')}`,
    );
  }

  if (
    body.modelProvider !== undefined &&
    body.modelProvider !== null &&
    !normalizeOperatorModelProvider(body.modelProvider)
  ) {
    const meta = getOperatorProviderMeta();
    throw new SettingsValidationError(
      'INVALID_MODEL_PROVIDER',
      `Invalid model provider. Must be one of: ${meta.modelProviders.join(', ')}`,
    );
  }

  if (body.model !== undefined && typeof body.model !== 'string') {
    throw new SettingsValidationError('INVALID_MODEL', 'Model must be a non-empty string');
  }

  const provider = normalizeOperatorAgentProvider(body.provider) ?? current.agentProvider;
  const providerChanged = provider !== current.agentProvider;
  const modelProvider =
    provider === 'pi-agent-core'
      ? normalizeOperatorModelProvider(body.modelProvider ?? undefined) ??
        (providerChanged ? null : current.modelProvider)
      : null;
  const candidateModel =
    body.model !== undefined
      ? body.model.trim()
      : providerChanged
        ? getDefaultOperatorModel(provider)
        : current.model;

  if (provider === 'pi-agent-core') {
    const resolvedModelProvider = modelProvider ?? current.modelProvider ?? 'anthropic';
    if (!candidateModel || !isValidPiAgentModel(resolvedModelProvider, candidateModel)) {
      throw new SettingsValidationError(
        'INVALID_MODEL',
        `Invalid model for provider '${provider}' and model provider '${resolvedModelProvider}'.`,
      );
    }

    platformRepo.transaction(() => {
      platformRepo.settings.set('operator.agent_provider', provider);
      platformRepo.settings.set('operator.model_provider', resolvedModelProvider);
      platformRepo.settings.set('operator.model', candidateModel);
    });
    return;
  }

  if (!candidateModel || !isValidOperatorModelForProvider(provider, candidateModel)) {
    const meta = getOperatorProviderMeta();
    throw new SettingsValidationError(
      'INVALID_MODEL',
      `Invalid model for provider '${provider}'. Must be one of: ${meta.models[provider].join(', ')}`,
    );
  }

  platformRepo.transaction(() => {
    platformRepo.settings.set('operator.agent_provider', provider);
    platformRepo.settings.delete('operator.model_provider');
    platformRepo.settings.set('operator.model', candidateModel);
  });
}

function updateCozyBaseAgentSettings(
  platformRepo: PlatformRepository,
  body: { provider?: string; modelProvider?: string | null; model?: string },
) {
  const current = readCozyBaseAgentConfig(platformRepo);

  if (body.provider !== undefined && !normalizeCozyBaseAgentProvider(body.provider)) {
    const meta = getCozyBaseProviderMeta();
    throw new SettingsValidationError(
      'INVALID_PROVIDER',
      `Invalid provider. Must be one of: ${meta.providers.join(', ')}`,
    );
  }

  if (
    body.modelProvider !== undefined &&
    body.modelProvider !== null &&
    !normalizeCozyBaseModelProvider(body.modelProvider)
  ) {
    const meta = getCozyBaseProviderMeta();
    throw new SettingsValidationError(
      'INVALID_MODEL_PROVIDER',
      `Invalid model provider. Must be one of: ${meta.modelProviders.join(', ')}`,
    );
  }

  if (body.model !== undefined && typeof body.model !== 'string') {
    throw new SettingsValidationError('INVALID_MODEL', 'Model must be a non-empty string');
  }

  const provider = normalizeCozyBaseAgentProvider(body.provider) ?? current.agentProvider;
  const modelProvider =
    normalizeCozyBaseModelProvider(body.modelProvider ?? undefined)
    ?? current.modelProvider
    ?? 'anthropic';
  const candidateModel =
    body.model !== undefined
      ? body.model.trim()
      : body.provider !== undefined && provider !== current.agentProvider
        ? getDefaultCozyBaseModel(provider)
        : current.model;

  if (!candidateModel || !isValidCozyBaseModelForProvider(provider, candidateModel)) {
    const meta = getCozyBaseProviderMeta();
    throw new SettingsValidationError(
      'INVALID_MODEL',
      `Invalid model for provider '${provider}'. Must be one of: ${meta.models[provider].join(', ')}`,
    );
  }

  platformRepo.transaction(() => {
    platformRepo.settings.set('cozybase_agent.agent_provider', provider);
    platformRepo.settings.set('cozybase_agent.model_provider', modelProvider);
    platformRepo.settings.set('cozybase_agent.model', candidateModel);
  });
}

function readBuilderAgentSettingsResponse(platformRepo: PlatformRepository) {
  const { provider, model } = readAgentConfig(platformRepo);
  return {
    data: { provider, model },
    meta: {
      providers: VALID_AGENT_PROVIDERS,
      models: VALID_MODELS,
    },
  };
}

function readOperatorAgentSettingsResponse(platformRepo: PlatformRepository) {
  const { agentProvider, modelProvider, model } = readOperatorAgentConfig(platformRepo);
  return {
    data: { provider: agentProvider, modelProvider, model },
    meta: getOperatorProviderMeta(),
  };
}

function readCozyBaseAgentSettingsResponse(platformRepo: PlatformRepository) {
  const { agentProvider, modelProvider, model } = readCozyBaseAgentConfig(platformRepo);
  return {
    data: { provider: agentProvider, modelProvider, model },
    meta: getCozyBaseProviderMeta(),
  };
}

function isDaemonLogLevel(value: string | null | undefined): value is DaemonLogLevel {
  return value === 'DEBUG' || value === 'INFO' || value === 'WARNING' || value === 'ERROR';
}
