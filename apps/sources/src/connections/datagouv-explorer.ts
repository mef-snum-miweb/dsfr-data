/**
 * data.gouv.fr explorer : parcourt les ressources d'une connexion `datagouv`
 * (cf. ADR-035). Une connexion data.gouv = 1 jeu de données (slug) exposant N
 * ressources ; seules celles interrogeables via l'API Tabular sont listées.
 *
 * Réutilise l'onglet « Ressources » (#tables-tree) et l'aperçu (#preview-table)
 * de l'explorateur. La sélection d'une ressource n'ajoute rien automatiquement :
 * l'utilisateur clique ensuite « en faire un jeu en ligne / local ».
 */

import {
  escapeHtml,
  httpErrorMessage,
  getProxiedUrl,
  dataGouvDatasetApiUrl,
  extractDataGouvResources,
  TABULAR_CONFIG,
} from '@dsfr-data/shared';
import type { DataGouvResource, Source } from '@dsfr-data/shared';

import { state } from '../state.js';
import { switchExplorerTab, setDatasetCandidate, renderPreviewMeta } from './connection-manager.js';

/** Ressources interrogeables du jeu data.gouv courant. */
let resources: DataGouvResource[] = [];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${bytes} o`;
}

/** Liste les ressources interrogeables de la connexion data.gouv sélectionnée. */
export async function loadDataGouvResources(): Promise<void> {
  const tree = document.getElementById('tables-tree');
  if (!tree) return;

  const conn = state.connections.find((c) => c.id === state.selectedConnectionId);
  const slug = conn ? (conn as Record<string, unknown>).datasetSlug : null;
  if (typeof slug !== 'string') {
    tree.innerHTML = '<p>Connexion data.gouv invalide.</p>';
    return;
  }

  tree.innerHTML = '<p>Chargement des ressources…</p>';
  try {
    const resp = await fetch(dataGouvDatasetApiUrl(slug));
    if (!resp.ok) throw new Error(httpErrorMessage(resp.status));
    const json: unknown = await resp.json();
    resources = extractDataGouvResources(json).filter((r) => r.tabularApiUrl);

    if (resources.length === 0) {
      tree.innerHTML =
        '<p class="fr-text--sm">Aucune ressource interrogeable via l\'API Tabular dans ce jeu de données.</p>';
      return;
    }

    tree.innerHTML = resources
      .map((r, i) => {
        const meta = [r.format || 'csv', r.size ? formatBytes(r.size) : null]
          .filter(Boolean)
          .join(' · ');
        return `<div class="tree-item" data-dg-idx="${i}" onclick="selectDataGouvResource(${i})">
          <i class="ri-table-line"></i> ${escapeHtml(r.title)} <span class="count">${escapeHtml(meta)}</span>
        </div>`;
      })
      .join('');
  } catch (error) {
    tree.innerHTML = `<p class="error-message">Erreur : ${(error as Error).message}</p>`;
  }
}

/** Prévisualise une ressource data.gouv (via Tabular) et arme les boutons d'ajout. */
export async function selectDataGouvResource(index: number): Promise<void> {
  const resource = resources[index];
  if (!resource?.tabularApiUrl) return;

  document.querySelectorAll('[data-dg-idx]').forEach((el) => el.classList.remove('selected'));
  document.querySelector(`[data-dg-idx="${index}"]`)?.classList.add('selected');

  switchExplorerTab('preview');
  const info = document.getElementById('preview-info');
  const table = document.getElementById('preview-table');
  if (!info || !table) return;
  info.textContent = 'Chargement…';
  const thead = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');
  if (thead) thead.innerHTML = '';
  if (tbody) tbody.innerHTML = '';

  try {
    const resp = await fetch(getProxiedUrl(`${resource.tabularApiUrl}?page_size=20`));
    if (!resp.ok) throw new Error(httpErrorMessage(resp.status));
    const json = (await resp.json()) as { data?: Record<string, unknown>[] };
    const rows = json.data ?? [];
    state.tableData = rows;

    if (rows.length === 0) {
      info.textContent = 'Aucune donnée';
      setDatasetCandidate(null);
      renderPreviewMeta(null);
      return;
    }

    const columns = Object.keys(rows[0]);
    if (thead) thead.innerHTML = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
    if (tbody) {
      tbody.innerHTML = rows
        .slice(0, 20)
        .map(
          (r) =>
            '<tr>' +
            columns.map((c) => `<td>${escapeHtml(String(r[c] ?? ''))}</td>`).join('') +
            '</tr>'
        )
        .join('');
    }
    info.textContent = `${resource.title} — aperçu (${rows.length} lignes)`;
    renderPreviewMeta({ kind: 'connexion', url: resource.tabularApiUrl, rows });

    const connectionId = state.selectedConnectionId;
    setDatasetCandidate({
      name: resource.title,
      toOnline: (): Source => ({
        id: `api_${connectionId}_${resource.id}`,
        name: resource.title,
        type: 'api',
        connectionId: connectionId ?? undefined,
        provider: 'tabular',
        apiUrl: resource.tabularApiUrl!,
        method: 'GET',
        headers: null,
        dataPath: TABULAR_CONFIG.response.dataPath,
        data: rows,
        recordCount: rows.length,
      }),
      localRows: rows,
    });
  } catch (error) {
    info.textContent = `Erreur : ${(error as Error).message}`;
    setDatasetCandidate(null);
    renderPreviewMeta(null);
  }
}
