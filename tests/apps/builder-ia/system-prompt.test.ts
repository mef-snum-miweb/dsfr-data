import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildFewShot } from '../../../apps/builder-ia/src/ia/system-prompt';

const BASE = 'Tu es un assistant.';
const DATA = '\n\nDonnees actuelles : Champs : region (texte), population (nombre)';

describe('builder-ia system-prompt', () => {
  describe('mode legacy', () => {
    it('reproduit l ordre historique (base + skillsList + data + skillsContext + reminder)', () => {
      const prompt = buildSystemPrompt({
        mode: 'legacy',
        basePrompt: BASE,
        dataContext: DATA,
        skillsList: '- skillA: desc',
        skillsContext: '\n\nSKILLS INJECTES : ...',
        actionReminder: '\n\nREGLE ABSOLUE ...',
      });
      expect(prompt).toContain('SKILLS DISPONIBLES');
      expect(prompt).toContain('- skillA: desc');
      expect(prompt).toContain('REGLE ABSOLUE');
      expect(prompt.indexOf(BASE)).toBeLessThan(prompt.indexOf('SKILLS DISPONIBLES'));
      expect(prompt.indexOf(DATA)).toBeLessThan(prompt.indexOf('REGLE ABSOLUE'));
    });
  });

  describe('mode tools', () => {
    it('exclut la liste complete des skills et le bloc CAPS, inclut la consigne outils', () => {
      const prompt = buildSystemPrompt({ mode: 'tools', basePrompt: BASE, dataContext: DATA });
      expect(prompt).not.toContain('SKILLS DISPONIBLES');
      expect(prompt).not.toContain('REGLE ABSOLUE');
      expect(prompt).toContain('get_relevant_skills');
      expect(prompt).toContain('create_chart');
      expect(prompt).toContain(DATA);
    });
  });

  describe('mode structured', () => {
    it('exclut le bloc CAPS, impose un objet action, garde le dataContext', () => {
      const prompt = buildSystemPrompt({ mode: 'structured', basePrompt: BASE, dataContext: DATA });
      expect(prompt).not.toContain('REGLE ABSOLUE');
      expect(prompt).not.toContain('SKILLS DISPONIBLES');
      expect(prompt).toContain('UN SEUL objet action');
      expect(prompt).toContain(DATA);
    });
  });

  describe('buildFewShot', () => {
    it('fournit un exemple user/assistant en mode structured', () => {
      const shots = buildFewShot('structured');
      expect(shots.length).toBe(2);
      expect(shots[0].role).toBe('user');
      expect(shots[1].role).toBe('assistant');
      const parsed = JSON.parse(shots[1].content);
      expect(parsed.action).toBe('createChart');
      expect(parsed.config.type).toBe('bar');
    });

    it('ne fournit pas de few-shot message en mode tools (consigne textuelle preferee)', () => {
      expect(buildFewShot('tools')).toEqual([]);
      expect(buildFewShot('legacy')).toEqual([]);
    });
  });
});
