import { Hono } from 'hono';
import type { PlatformRepository } from '../../core/platform-repository';
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

export function createSettingsRoutes(platformRepo: PlatformRepository) {
  const app = new Hono();

  app.get('/settings/agent', (c) => {
    const { provider, model } = readAgentConfig(platformRepo);
    return c.json({
      data: { provider, model },
      meta: {
        providers: VALID_AGENT_PROVIDERS,
        models: VALID_MODELS,
      },
    });
  });

  app.put('/settings/agent', async (c) => {
    const body = await c.req.json<{ provider?: string; model?: string }>();
    const current = readAgentConfig(platformRepo);

    if (body.provider !== undefined) {
      if (typeof body.provider !== 'string' || !isValidAgentProvider(body.provider)) {
        return c.json(
          { error: { code: 'INVALID_PROVIDER', message: `Invalid provider. Must be one of: ${VALID_AGENT_PROVIDERS.join(', ')}` } },
          400,
        );
      }
    }

    if (body.model !== undefined && typeof body.model !== 'string') {
      return c.json(
        { error: { code: 'INVALID_MODEL', message: 'Model must be a non-empty string' } },
        400,
      );
    }

    const provider = body.provider ?? current.provider;
    const model =
      body.model !== undefined
        ? body.model.trim()
        : body.provider !== undefined && body.provider !== current.provider
          ? getDefaultAgentModel(provider)
          : current.model;

    if (!model || !isValidModelForProvider(provider, model)) {
      return c.json(
        { error: { code: 'INVALID_MODEL', message: `Invalid model for provider '${provider}'. Must be one of: ${VALID_MODELS[provider].join(', ')}` } },
        400,
      );
    }

    platformRepo.transaction(() => {
      platformRepo.settings.set('agent.provider', provider);
      platformRepo.settings.set('agent.model', model);
    });

    return c.json({
      data: { provider, model },
      meta: {
        providers: VALID_AGENT_PROVIDERS,
        models: VALID_MODELS,
      },
    });
  });

  app.get('/settings/operator-agent', (c) => {
    const { agentProvider, modelProvider, model } = readOperatorAgentConfig(platformRepo);
    return c.json({
      data: { provider: agentProvider, modelProvider, model },
      meta: getOperatorProviderMeta(),
    });
  });

  app.put('/settings/operator-agent', async (c) => {
    const body = await c.req.json<{ provider?: string; modelProvider?: string | null; model?: string }>();
    const current = readOperatorAgentConfig(platformRepo);

    if (body.provider !== undefined && !normalizeOperatorAgentProvider(body.provider)) {
      const meta = getOperatorProviderMeta();
      return c.json(
        {
          error: {
            code: 'INVALID_PROVIDER',
            message: `Invalid provider. Must be one of: ${meta.providers.join(', ')}`,
          },
        },
        400,
      );
    }

    if (
      body.modelProvider !== undefined &&
      body.modelProvider !== null &&
      !normalizeOperatorModelProvider(body.modelProvider)
    ) {
      const meta = getOperatorProviderMeta();
      return c.json(
        {
          error: {
            code: 'INVALID_MODEL_PROVIDER',
            message: `Invalid model provider. Must be one of: ${meta.modelProviders.join(', ')}`,
          },
        },
        400,
      );
    }

    if (body.model !== undefined && typeof body.model !== 'string') {
      return c.json(
        { error: { code: 'INVALID_MODEL', message: 'Model must be a non-empty string' } },
        400,
      );
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
        return c.json(
          {
            error: {
              code: 'INVALID_MODEL',
              message:
                `Invalid model for provider '${provider}' and model provider '${resolvedModelProvider}'.`,
            },
          },
          400,
        );
      }

      platformRepo.transaction(() => {
        platformRepo.settings.set('operator.agent_provider', provider);
        platformRepo.settings.set('operator.model_provider', resolvedModelProvider);
        platformRepo.settings.set('operator.model', candidateModel);
      });

      return c.json({
        data: { provider, modelProvider: resolvedModelProvider, model: candidateModel },
        meta: getOperatorProviderMeta(),
      });
    }

    if (!candidateModel || !isValidOperatorModelForProvider(provider, candidateModel)) {
      const meta = getOperatorProviderMeta();
      return c.json(
        {
          error: {
            code: 'INVALID_MODEL',
            message: `Invalid model for provider '${provider}'. Must be one of: ${meta.models[provider].join(', ')}`,
          },
        },
        400,
      );
    }

    platformRepo.transaction(() => {
      platformRepo.settings.set('operator.agent_provider', provider);
      platformRepo.settings.delete('operator.model_provider');
      platformRepo.settings.set('operator.model', candidateModel);
    });

    return c.json({
      data: { provider, modelProvider: null, model: candidateModel },
      meta: getOperatorProviderMeta(),
    });
  });

  app.get('/settings/cozybase-agent', (c) => {
    const { agentProvider, modelProvider, model } = readCozyBaseAgentConfig(platformRepo);
    return c.json({
      data: { provider: agentProvider, modelProvider, model },
      meta: getCozyBaseProviderMeta(),
    });
  });

  app.put('/settings/cozybase-agent', async (c) => {
    const body = await c.req.json<{ provider?: string; modelProvider?: string | null; model?: string }>();
    const current = readCozyBaseAgentConfig(platformRepo);

    if (body.provider !== undefined && !normalizeCozyBaseAgentProvider(body.provider)) {
      const meta = getCozyBaseProviderMeta();
      return c.json(
        {
          error: {
            code: 'INVALID_PROVIDER',
            message: `Invalid provider. Must be one of: ${meta.providers.join(', ')}`,
          },
        },
        400,
      );
    }

    if (
      body.modelProvider !== undefined &&
      body.modelProvider !== null &&
      !normalizeCozyBaseModelProvider(body.modelProvider)
    ) {
      const meta = getCozyBaseProviderMeta();
      return c.json(
        {
          error: {
            code: 'INVALID_MODEL_PROVIDER',
            message: `Invalid model provider. Must be one of: ${meta.modelProviders.join(', ')}`,
          },
        },
        400,
      );
    }

    if (body.model !== undefined && typeof body.model !== 'string') {
      return c.json(
        { error: { code: 'INVALID_MODEL', message: 'Model must be a non-empty string' } },
        400,
      );
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
      return c.json(
        {
          error: {
            code: 'INVALID_MODEL',
            message: `Invalid model for provider '${provider}'. Must be one of: ${meta.models[provider].join(', ')}`,
          },
        },
        400,
      );
    }

    platformRepo.transaction(() => {
      platformRepo.settings.set('cozybase_agent.agent_provider', provider);
      platformRepo.settings.set('cozybase_agent.model_provider', modelProvider);
      platformRepo.settings.set('cozybase_agent.model', candidateModel);
    });

    return c.json({
      data: { provider, modelProvider, model: candidateModel },
      meta: getCozyBaseProviderMeta(),
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
