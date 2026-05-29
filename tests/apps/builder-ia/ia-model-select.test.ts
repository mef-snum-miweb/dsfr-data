import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_MODEL,
  readModelValue,
  applyModelValue,
  onModelSelectChange,
} from '../../../apps/builder-ia/src/ia/ia-config';

function mountModelDom() {
  document.body.innerHTML = `
    <select id="ia-model">
      <option value="openweight-large">openweight-large</option>
      <option value="openweight-medium">openweight-medium</option>
      <option value="openweight-small">openweight-small</option>
      <option value="albert-large">albert-large</option>
      <option value="__custom__">Personnalise…</option>
    </select>
    <input id="ia-model-custom" style="display:none;" />
  `;
}

describe('builder-ia model select', () => {
  beforeEach(mountModelDom);

  it('DEFAULT_MODEL est openweight-large (gpt-oss-120b)', () => {
    expect(DEFAULT_MODEL).toBe('openweight-large');
  });

  it('applyModelValue selectionne un preset et masque le custom', () => {
    applyModelValue('openweight-medium');
    const select = document.getElementById('ia-model') as HTMLSelectElement;
    const custom = document.getElementById('ia-model-custom') as HTMLInputElement;
    expect(select.value).toBe('openweight-medium');
    expect(custom.style.display).toBe('none');
    expect(readModelValue()).toBe('openweight-medium');
  });

  it('applyModelValue bascule en custom pour un modele hors-preset', () => {
    applyModelValue('gpt-4o');
    const select = document.getElementById('ia-model') as HTMLSelectElement;
    const custom = document.getElementById('ia-model-custom') as HTMLInputElement;
    expect(select.value).toBe('__custom__');
    expect(custom.value).toBe('gpt-4o');
    expect(custom.style.display).toBe('');
    expect(readModelValue()).toBe('gpt-4o');
  });

  it('onModelSelectChange affiche/masque le champ custom', () => {
    const select = document.getElementById('ia-model') as HTMLSelectElement;
    const custom = document.getElementById('ia-model-custom') as HTMLInputElement;

    select.value = '__custom__';
    onModelSelectChange();
    expect(custom.style.display).toBe('');

    select.value = 'openweight-small';
    onModelSelectChange();
    expect(custom.style.display).toBe('none');
  });

  it('readModelValue retombe sur le defaut si le custom est vide', () => {
    const select = document.getElementById('ia-model') as HTMLSelectElement;
    select.value = '__custom__';
    (document.getElementById('ia-model-custom') as HTMLInputElement).value = '   ';
    expect(readModelValue()).toBe(DEFAULT_MODEL);
  });
});
