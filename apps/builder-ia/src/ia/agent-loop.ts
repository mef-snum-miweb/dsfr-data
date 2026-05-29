/**
 * Boucle agentique incrementale pour la branche OpenAI-compatible (Albert).
 *
 * Au lieu d'empiler tous les skills dans le prompt, on expose des outils que le
 * modele appelle a la demande (get_relevant_skills / get_skill) avant d'appeler
 * l'outil final (create_chart / reload_data / reset_chart) qui termine la boucle.
 * C'est l'analogue navigateur du MCP server (mcp-server/src/index.ts), qui sert
 * le meme pattern a Claude.
 *
 * Le transport HTTP est injecte (`post`) : chat.ts garde la propriete du choix
 * serveur-defaut vs config-utilisateur, et la boucle reste testable (post mocke).
 */

import type { Source } from '../state.js';
import { SKILLS, getRelevantSkills, buildSkillsContext } from '../skills.js';
import {
  SKILL_LOOKUP_TOOLS,
  FINAL_ACTION_TOOLS,
  FINAL_TOOL_NAMES,
  toolNameToAction,
  validateAction,
  type ActionResult,
} from './action-schema.js';

/** Forme minimale d'un tool_call OpenAI. */
interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** Forme minimale d'un message de reponse OpenAI. */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** Forme minimale d'une reponse chat/completions OpenAI-compatible. */
export interface OpenAIResponse {
  choices: { message: ChatMessage }[];
}

/** Fonction de transport injectee : POST le body et renvoie la reponse parsee. */
export type PostChat = (body: Record<string, unknown>) => Promise<OpenAIResponse>;

export interface AgentLoopOptions {
  /** Conversation deja construite (sans le system), ex: state.messages.slice(-10). */
  conversation: { role: 'user' | 'assistant'; content: string }[];
  systemPrompt: string;
  source: Source | null;
  post: PostChat;
  /** Callback de progression : recoit la liste cumulative des etapes franchies. */
  onProgress?: (steps: string[]) => void;
  model: string;
  temperature: number;
  seed?: number;
  /** Parametres extra (max_completion_tokens, etc.) fusionnes dans le body. */
  extra?: Record<string, unknown>;
}

export interface AgentLoopResult {
  action: ActionResult | null;
  text: string;
  /** Etapes de raisonnement franchies (humanisees), pour affichage persistant. */
  steps: string[];
}

/** Humanise un appel d'outil de lookup pour l'affichage utilisateur. */
function humanizeStep(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'get_relevant_skills':
      return 'Je cherche les bons reglages…';
    case 'get_skill': {
      const id = typeof args.skill_id === 'string' ? args.skill_id : '';
      return id ? `Je consulte la fiche « ${id} »…` : 'Je consulte la documentation du composant…';
    }
    default:
      return `Consultation : ${name}`;
  }
}

const MAX_ROUNDS = 3;
const ALL_TOOLS = [...SKILL_LOOKUP_TOOLS, ...FINAL_ACTION_TOOLS];

/**
 * Dispatch d'un outil de lookup. Renvoie le texte a remettre au modele.
 */
function dispatchLookup(
  name: string,
  args: Record<string, unknown>,
  source: Source | null
): string {
  if (name === 'get_relevant_skills') {
    const message = typeof args.message === 'string' ? args.message : '';
    const matched = getRelevantSkills(message, source);
    if (matched.length === 0) {
      return 'Aucune skill ne correspond. Essaie des mots-cles plus larges ou get_skill par id.';
    }
    return buildSkillsContext(matched);
  }
  if (name === 'get_skill') {
    const id = typeof args.skill_id === 'string' ? args.skill_id : '';
    const skill = SKILLS[id];
    if (!skill) {
      const ids = Object.keys(SKILLS).join(', ');
      return `Skill "${id}" introuvable. Ids disponibles : ${ids}`;
    }
    return skill.content;
  }
  return `Outil inconnu : ${name}`;
}

/** Parse les arguments JSON d'un tool_call de facon tolerante. */
function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Execute la boucle agentique. Retourne l'action finale (validee) + le texte a
 * afficher, ou {action:null, text} pour une reponse purement conversationnelle.
 */
export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const { conversation, systemPrompt, source, post, onProgress, model, temperature, seed, extra } =
    opts;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversation.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];

  // Garde-fou anti-boucle : ne pas rappeler indefiniment le meme lookup.
  const lookupCalls = new Set<string>();
  // Etapes de raisonnement franchies (humanisees), conservees pour affichage.
  const steps: string[] = [];
  let lastContent = '';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body: Record<string, unknown> = {
      model,
      messages,
      tools: ALL_TOOLS,
      tool_choice: 'auto',
      temperature,
      ...(seed !== undefined ? { seed } : {}),
      ...(extra ?? {}),
    };

    const data = await post(body);
    const msg = data.choices?.[0]?.message;
    if (!msg) return { action: null, text: lastContent, steps };
    lastContent = msg.content ?? lastContent;

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Reponse conversationnelle pure (pas d'action).
      return { action: null, text: msg.content ?? '', steps };
    }

    // Empile le message assistant porteur des tool_calls.
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls });

    // 1) Un tool_call final termine la boucle.
    for (const call of toolCalls) {
      if (FINAL_TOOL_NAMES.has(call.function.name)) {
        const actionName = toolNameToAction(call.function.name);
        const args = parseArgs(call.function.arguments);
        const result = validateAction({ action: actionName, ...args });
        const text = (typeof args.message === 'string' && args.message) || msg.content || '';
        return { action: result, text, steps };
      }
    }

    // 2) Sinon, ce sont des lookups : on repond a chacun et on reboucle.
    for (const call of toolCalls) {
      const key = `${call.function.name}:${call.function.arguments}`;
      const args = parseArgs(call.function.arguments);
      // Accumule l'etape humanisee et notifie la progression (liste cumulative).
      steps.push(humanizeStep(call.function.name, args));
      onProgress?.(steps);
      let result: string;
      if (lookupCalls.has(key)) {
        result = "Deja fourni ci-dessus. Genere maintenant l'action finale.";
      } else {
        lookupCalls.add(key);
        result = dispatchLookup(call.function.name, args, source);
      }
      messages.push({ role: 'tool', content: result, tool_call_id: call.id });
    }
  }

  // Budget de rounds epuise sans action finale.
  return { action: null, text: lastContent, steps };
}
