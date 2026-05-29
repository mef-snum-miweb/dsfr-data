import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop } from '../../../apps/builder-ia/src/ia/agent-loop';

function toolCallMsg(name: string, args: unknown, content = '') {
  return {
    choices: [
      {
        message: {
          content,
          tool_calls: [
            {
              id: `call_${name}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

const baseOpts = {
  conversation: [{ role: 'user' as const, content: 'barres population par region' }],
  systemPrompt: 'system',
  source: null,
  model: 'openweight-large',
  temperature: 0.1,
};

describe('builder-ia agent-loop', () => {
  it('consulte un skill puis termine sur create_chart', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(toolCallMsg('get_relevant_skills', { message: 'barres population' }))
      .mockResolvedValueOnce(
        toolCallMsg(
          'create_chart',
          {
            message: 'Voici votre graphique',
            config: { type: 'bar', valueField: 'population', labelField: 'region' },
          },
          'Voici'
        )
      );
    let progress: string[] = [];

    const result = await runAgentLoop({
      ...baseOpts,
      post,
      onProgress: (steps) => {
        progress = steps;
      },
    });

    expect(post).toHaveBeenCalledTimes(2);
    expect(result.action?.action).toBe('createChart');
    expect(result.action?.config?.type).toBe('bar');
    expect(result.text).toBe('Voici votre graphique');
    // L'etape de consultation a ete humanisee, accumulee et exposee.
    expect(progress).toContain('Je cherche les bons réglages…');
    expect(result.steps).toContain('Je cherche les bons réglages…');

    // Le 2e appel contient un message role:"tool" (resultat du lookup) accumule.
    const secondBody = post.mock.calls[1][0] as { messages: { role: string }[] };
    expect(secondBody.messages.some((m) => m.role === 'tool')).toBe(true);
    expect(secondBody.messages.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('respecte MAX_ROUNDS si le modele boucle sur les lookups', async () => {
    // Renvoie toujours un lookup different (sinon le garde anti-repetition coupe avant).
    let n = 0;
    const post = vi.fn().mockImplementation(() => {
      n += 1;
      return Promise.resolve(toolCallMsg('get_relevant_skills', { message: `essai ${n}` }));
    });

    const result = await runAgentLoop({ ...baseOpts, post });

    expect(post).toHaveBeenCalledTimes(3); // MAX_ROUNDS
    expect(result.action).toBeNull();
  });

  it('retourne une reponse conversationnelle quand pas de tool_call', async () => {
    const post = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Bonjour, que veux-tu visualiser ?', tool_calls: [] } }],
    });

    const result = await runAgentLoop({ ...baseOpts, post });

    expect(post).toHaveBeenCalledTimes(1);
    expect(result.action).toBeNull();
    expect(result.text).toBe('Bonjour, que veux-tu visualiser ?');
  });
});
