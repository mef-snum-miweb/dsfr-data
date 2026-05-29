/**
 * Construction du system prompt selon le mode d'exploitation des skills.
 *
 * - legacy    : prompt actuel verbatim (tout empile). Comportement identique
 *               quand le gateway ne supporte ni json_schema ni tools.
 * - structured: prompt court + note "reponds par un seul objet action" +
 *               dataContext + skill createChart (central, petit). Le contrat de
 *               sortie est garanti par response_format json_schema, donc on
 *               supprime la liste complete des skills, buildSkillsContext et le
 *               gros actionReminder en MAJUSCULES.
 * - tools     : prompt court + consigne d'aller chercher les skills a la demande
 *               (get_relevant_skills / get_skill) + dataContext + skill
 *               createChart. C'est le mode incremental/agentique (mirroir MCP).
 *
 * Sortir les chaines de prompt de chat.ts permet de les tester et de les faire
 * evoluer sans toucher a la logique d'appel.
 */

import { SKILLS } from '../skills.js';

export type PromptMode = 'legacy' | 'structured' | 'tools';

export interface BuildSystemPromptOptions {
  mode: PromptMode;
  /** Preambule de role — le textarea utilisateur (config.systemPrompt). */
  basePrompt: string;
  /** Contexte de données (noms de champs, exemple d'enregistrement). Non fetchable. */
  dataContext: string;
  /** Liste des skills disponibles — utilise uniquement en mode legacy. */
  skillsList?: string;
  /** Skills injectees integralement — utilise uniquement en mode legacy. */
  skillsContext?: string;
  /** Rappel de format — utilise uniquement en mode legacy. */
  actionReminder?: string;
}

/** Skill createChart : centrale et petite, gardee dans tous les modes avances. */
const CREATE_CHART_SKILL = SKILLS.createChartAction?.content ?? '';

const STRUCTURED_NOTE = `

---
FORMAT DE REPONSE : reponds par UN SEUL objet action conforme au schema impose.
Champs : "action" ("createChart" | "reloadData" | "resetChart"), "message" (phrase
courte en francais affichee a l'utilisateur), et selon l'action "config" (createChart)
ou "query" (reloadData). N'invente jamais de nom de champ : utilise EXACTEMENT ceux du
contexte de données. Pour changer la couleur/palette d'un graphique existant, regenere
un createChart avec la palette voulue.`;

const TOOLS_NOTE = `

---
TU DISPOSES D'OUTILS. Quand tu as besoin du detail d'un composant, d'un type de
graphique ou d'une syntaxe avant de générer, appelle d'abord get_relevant_skills
(matching par mots-clés) ou get_skill (par id) — ne devine pas. Quand tu es pret,
appelle l'outil final create_chart, reload_data ou reset_chart. Chaque outil final
prend un champ "message" (phrase courte en francais). N'invente jamais de nom de
champ : utilise EXACTEMENT ceux du contexte de données.`;

/**
 * Assemble le system prompt pour le mode demande.
 *
 * En mode legacy l'ordre de concatenation reproduit exactement l'assemblage
 * historique de chat.ts (basePrompt + skillsList + dataContext + skillsContext
 * + actionReminder) pour garantir l'absence de regression.
 */
export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
  const { mode, basePrompt, dataContext } = opts;

  if (mode === 'legacy') {
    return (
      basePrompt +
      `\n\nSKILLS DISPONIBLES (seront injectes si pertinents):\n${opts.skillsList ?? ''}` +
      dataContext +
      (opts.skillsContext ?? '') +
      (opts.actionReminder ?? '')
    );
  }

  const note = mode === 'tools' ? TOOLS_NOTE : STRUCTURED_NOTE;
  return (
    basePrompt +
    note +
    dataContext +
    '\n\n---\nReference (action createChart) :\n' +
    CREATE_CHART_SKILL
  );
}

export interface FewShotMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Exemples few-shot (tours user/assistant prefixes a la conversation).
 *
 * Fournis uniquement pour le mode `structured` : l'assistant y demontre la
 * sortie attendue (objet action JSON avec message). En mode `tools`, demontrer
 * un appel d'outil necessiterait une sequence assistant(tool_calls)+tool(result)
 * fragile a injecter — la consigne textuelle de TOOLS_NOTE est preferee.
 */
export function buildFewShot(mode: PromptMode): FewShotMessage[] {
  if (mode !== 'structured') return [];
  return [
    {
      role: 'user',
      content: 'Un diagramme en barres de la population par region, top 5.',
    },
    {
      role: 'assistant',
      content: JSON.stringify({
        action: 'createChart',
        message: 'Voici le top 5 des regions par population.',
        config: {
          type: 'bar',
          labelField: 'region',
          valueField: 'population',
          aggregation: 'sum',
          limit: 5,
          sortOrder: 'desc',
          title: 'Top 5 regions par population',
        },
      }),
    },
  ];
}
