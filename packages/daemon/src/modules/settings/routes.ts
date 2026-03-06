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
