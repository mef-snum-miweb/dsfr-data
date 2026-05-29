/**
 * Sonde empirique des capacites du gateway Albert (OpenGateLLM).
 *
 * Un parametre present dans l'OpenAPI d'Albert (tools, response_format
 * json_schema...) ne garantit pas qu'il fonctionne de bout en bout sur leur
 * deploiement vLLM. Ce script verifie, avec un vrai token, ce qui marche
 * REELLEMENT, pour decider quelles capacites activer dans builder-ia
 * (cf. apps/builder-ia/src/ia/albert-capabilities.ts).
 *
 * READ-ONLY : n'ecrit aucun fichier, imprime sur stdout.
 *
 * Usage :
 *   npx tsx scripts/probe-albert.ts --token <TOKEN> [--url <chat-url>] [--model openweight-large]
 *   IA_DEFAULT_TOKEN=xxx npx tsx scripts/probe-albert.ts
 */

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const TOKEN = getArg('--token') ?? process.env.IA_DEFAULT_TOKEN ?? '';
const CHAT_URL =
  getArg('--url') ?? 'https://albert.api.etalab.gouv.fr/v1/chat/completions';
const MODEL = getArg('--model') ?? 'openweight-large';

if (!TOKEN) {
  console.error('Erreur : token requis (--token <T> ou IA_DEFAULT_TOKEN).');
  process.exit(1);
}

const ORIGIN = (() => {
  try {
    return new URL(CHAT_URL).origin;
  } catch {
    return 'https://albert.api.etalab.gouv.fr';
  }
})();

const AUTH = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

interface ChatResult {
  ok: boolean;
  status: number;
  ms: number;
  body: Record<string, unknown> | null;
  error?: string;
}

async function chat(payload: Record<string, unknown>): Promise<ChatResult> {
  const start = Date.now();
  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(payload),
    });
    const ms = Date.now() - start;
    let body: Record<string, unknown> | null = null;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON */
    }
    return { ok: res.ok, status: res.status, ms, body };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - start, body: null, error: String(err) };
  }
}

function contentOf(r: ChatResult): string {
  const choices = (r.body?.choices as { message?: { content?: string } }[]) ?? [];
  return choices[0]?.message?.content ?? '';
}

function toolCallsOf(r: ChatResult): unknown[] {
  const choices = (r.body?.choices as { message?: { tool_calls?: unknown[] } }[]) ?? [];
  return choices[0]?.message?.tool_calls ?? [];
}

async function main() {
  console.log(`\n=== Sonde Albert ===`);
  console.log(`URL    : ${CHAT_URL}`);
  console.log(`Modele : ${MODEL}\n`);

  // 1) Identite modele / catalogue
  let resolved = MODEL;
  try {
    const res = await fetch(`${ORIGIN}/v1/models`, { headers: AUTH });
    if (res.ok) {
      const data = (await res.json()) as { data?: { id: string }[] };
      const ids = (data.data ?? []).map((m) => m.id);
      console.log(`1. Modeles disponibles (${ids.length}) : ${ids.join(', ') || '(liste vide)'}`);
      const match = ids.find((id) => id === MODEL || id.includes(MODEL));
      if (match) resolved = match;
    } else {
      console.log(`1. GET /v1/models -> HTTP ${res.status} (catalogue non lisible)`);
    }
  } catch (err) {
    console.log(`1. GET /v1/models -> erreur ${err}`);
  }

  // 2) Completion simple + latence
  const ping = await chat({
    model: MODEL,
    messages: [{ role: 'user', content: 'ping' }],
    max_completion_tokens: 5,
  });
  console.log(
    `2. Completion simple : ${ping.ok ? 'OK' : 'ECHEC'} (HTTP ${ping.status}, ${ping.ms} ms)` +
      (ping.error ? ` — ${ping.error}` : '')
  );

  // 3) response_format json_schema (Structured Outputs)
  const schema = {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
    additionalProperties: false,
  };
  const js = await chat({
    model: MODEL,
    messages: [{ role: 'user', content: 'Reponds avec {"ok": true}.' }],
    max_completion_tokens: 50,
    response_format: { type: 'json_schema', json_schema: { name: 'probe', schema, strict: true } },
  });
  let jsonSchema = false;
  if (js.ok) {
    try {
      const parsed = JSON.parse(contentOf(js));
      jsonSchema = typeof parsed === 'object' && parsed !== null && 'ok' in parsed;
    } catch {
      /* sortie non conforme */
    }
  }
  console.log(`3. response_format json_schema : ${jsonSchema ? 'OK' : 'ECHEC'} (HTTP ${js.status})`);

  // 3b) response_format json_object (echelon de repli)
  const jo = await chat({
    model: MODEL,
    messages: [{ role: 'user', content: 'Reponds en JSON : {"ok": true}.' }],
    max_completion_tokens: 50,
    response_format: { type: 'json_object' },
  });
  let jsonObject = false;
  if (jo.ok) {
    try {
      JSON.parse(contentOf(jo));
      jsonObject = true;
    } catch {
      /* */
    }
  }
  console.log(`   (repli) response_format json_object : ${jsonObject ? 'OK' : 'ECHEC'} (HTTP ${jo.status})`);

  // 4) Tool calling (auto puis force)
  const tool = {
    type: 'function',
    function: {
      name: 'ping',
      description: 'Repond ping',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  };
  const auto = await chat({
    model: MODEL,
    messages: [{ role: 'user', content: 'Appelle l outil ping.' }],
    max_completion_tokens: 50,
    tools: [tool],
    tool_choice: 'auto',
  });
  const autoOk = auto.ok && toolCallsOf(auto).length > 0;
  const forced = await chat({
    model: MODEL,
    messages: [{ role: 'user', content: 'Appelle l outil ping.' }],
    max_completion_tokens: 50,
    tools: [tool],
    tool_choice: { type: 'function', function: { name: 'ping' } },
  });
  const forcedOk = forced.ok && toolCallsOf(forced).length > 0;
  console.log(
    `4. Tool calling : auto=${autoOk ? 'OK' : 'ECHEC'} (HTTP ${auto.status}), force=${forcedOk ? 'OK' : 'ECHEC'} (HTTP ${forced.status})`
  );

  // Synthese : ligne AlbertCapabilities copiable
  const toolCalling = autoOk || forcedOk;
  console.log(`\n--- Synthese ---`);
  console.log(`Modele resolu : ${resolved}`);
  console.log(`A coller dans setCapabilities(...) ou pour decider du defaut serveur :`);
  console.log(
    JSON.stringify({ model: resolved, jsonSchema, toolCalling, probedAt: 0 }, null, 0)
  );
  console.log(
    `\nRecommandation : ${
      toolCalling
        ? 'tool-calling actif -> mode agentique incremental possible.'
        : jsonSchema
          ? 'structured outputs actif -> mode structure (boucle agentique indispo).'
          : jsonObject
            ? 'seul json_object marche -> rester sur le mode structure/legacy avec prudence.'
            : 'aucune capacite avancee confirmee -> mode legacy (parsing regex).'
    }`
  );
}

main().catch((err) => {
  console.error('Sonde : erreur fatale', err);
  process.exit(1);
});
