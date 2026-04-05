import React, { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../api.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://apixam.holiceo.com';
const ROOT     = '__root__';
const LS_KEY   = 'xamiot_media_folders';

function fmtSize(b) {
  if (!b) return '—';
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
  return `${(b / 1024 / 1024).toFixed(1)} Mo`;
}
function mimeIcon(type) {
  if (type?.startsWith('image/')) return '🖼';
  if (type === 'application/pdf') return '📄';
  if (type?.startsWith('video/')) return '🎬';
  return '📎';
}
function isValidFolder(f) { return f && f !== '/' && f.trim().length > 0; }
function loadSavedFolders() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]').filter(isValidFolder); } catch { return []; }
}
function persistFolders(list) { localStorage.setItem(LS_KEY, JSON.stringify(list)); }

// ── Modal suppression dossier ─────────────────────────────────────────────────
function DeleteFolderModal({ folderName, otherFolders, fileCount, onDelete, onMove, onClose }) {
  const [moveTarget, setMoveTarget] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, boxShadow: '0 20px 40px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Supprimer « {folderName} »</h3>
        <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 20px' }}>
          Ce dossier contient <strong>{fileCount} fichier{fileCount !== 1 ? 's' : ''}</strong>.
          Que souhaitez-vous faire ?
        </p>

        {otherFolders.length > 0 && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#0369a1' }}>Déplacer les fichiers vers…</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)}
                style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                <option value="">— Médiathèque (racine) —</option>
                {otherFolders.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <button onClick={() => onMove(moveTarget || ROOT)}
                style={{ padding: '6px 14px', background: '#0369a1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                Déplacer
              </button>
            </div>
          </div>
        )}

        {otherFolders.length === 0 && fileCount > 0 && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
            <div style={{ fontSize: 13, color: '#0369a1' }}>
              Aucun autre dossier disponible. Les fichiers seront déplacés vers la Médiathèque (racine).
            </div>
            <button onClick={() => onMove(ROOT)}
              style={{ marginTop: 8, padding: '6px 14px', background: '#0369a1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              Déplacer à la racine
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onDelete}
            style={{ flex: 1, padding: '8px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            🗑 Supprimer {fileCount > 0 ? `+ ${fileCount} fichier${fileCount !== 1 ? 's' : ''}` : 'le dossier'}
          </button>
          <button onClick={onClose}
            style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MediaLibrary({ embedded } = {}) {
  const [files, setFiles]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [selected, setSelected]     = useState(null);
  const [editAlt, setEditAlt]       = useState('');
  const [msg, setMsg]               = useState(null);
  const [filter, setFilter]         = useState('');
  const [currentFolder, setCurrentFolder] = useState(ROOT);
  const [savedFolders, setSavedFolders]   = useState(loadSavedFolders);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(null); // nom du dossier en cours de renommage
  const [renameValue, setRenameValue]       = useState('');
  const [deletingFolder, setDeletingFolder] = useState(null); // nom du dossier à supprimer
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const [draggingFile, setDraggingFile] = useState(null);
  const inputRef = useRef();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setFiles(await apiFetch('/admin/cms/media')); }
    catch (e) { setMsg({ type: 'error', text: e?.data?.error || e.message }); }
    finally { setLoading(false); }
  }

  const folders = [...new Set([
    ...savedFolders,
    ...files.map(f => f.folder).filter(isValidFolder),
  ])].sort();

  const visibleFiles = files.filter(f => {
    const inFolder = currentFolder === ROOT
      ? !isValidFolder(f.folder)
      : f.folder === currentFolder;
    if (!inFolder) return false;
    if (!filter) return true;
    return f.original_name.toLowerCase().includes(filter.toLowerCase())
        || f.mime_type?.includes(filter.toLowerCase());
  });

  // ── Upload ─────────────────────────────────────────────────────────────────
  async function uploadFile(file) {
    if (!file) return;
    setUploading(true); setMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('xamiot_admin_token');
      const resp = await fetch(`${API_BASE}/admin/cms/media/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.error || 'upload_failed'); }
      const created = await resp.json();
      if (currentFolder !== ROOT) {
        const updated = await apiFetch(`/admin/cms/media/${created.id}`, { method: 'PATCH', body: { folder: currentFolder } });
        setFiles(prev => [updated, ...prev]);
      } else {
        setFiles(prev => [created, ...prev]);
      }
      setMsg({ type: 'success', text: `${file.name} uploadé.` });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onInputChange(e) { uploadFile(e.target.files?.[0]); }

  const onDragOver = useCallback((e) => {
    if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropZoneActive(true); }
  }, []);
  const onDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDropZoneActive(false);
  }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault(); setDropZoneActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [currentFolder]); // eslint-disable-line

  // ── Déplacer un fichier ────────────────────────────────────────────────────
  async function moveFileTo(fileId, targetFolder) {
    try {
      const updated = await apiFetch(`/admin/cms/media/${fileId}`, {
        method: 'PATCH',
        body: { folder: targetFolder === ROOT ? '' : targetFolder },
      });
      setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
      if (selected?.id === updated.id) setSelected(updated);
    } catch (e) { setMsg({ type: 'error', text: e?.data?.error || e.message }); }
  }

  // ── Drag fichier → dossier ─────────────────────────────────────────────────
  function onFileDragStart(e, file) {
    e.dataTransfer.setData('application/xamiot-media-id', file.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingFile(file.id);
  }
  function onFileDragEnd() { setDraggingFile(null); setDragOverFolder(null); }
  function onFolderDragOver(e, folder) {
    if (e.dataTransfer.types.includes('application/xamiot-media-id')) {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverFolder(folder);
    }
  }
  function onFolderDragLeave() { setDragOverFolder(null); }
  async function onFolderDrop(e, folder) {
    e.preventDefault();
    const id = e.dataTransfer.getData('application/xamiot-media-id');
    setDragOverFolder(null);
    if (id) await moveFileTo(id, folder);
  }

  // ── Créer un dossier ───────────────────────────────────────────────────────
  function createFolder() {
    const name = newFolderName.trim();
    if (!name || !isValidFolder(name) || folders.includes(name)) {
      setShowNewFolder(false); setNewFolderName(''); return;
    }
    const updated = [...savedFolders, name];
    setSavedFolders(updated); persistFolders(updated);
    setCurrentFolder(name);
    setShowNewFolder(false); setNewFolderName('');
    setMsg({ type: 'success', text: `Dossier "${name}" créé.` });
  }

  // ── Renommer un dossier ───────────────────────────────────────────────────
  async function commitRename() {
    const oldName = renamingFolder;
    const newName = renameValue.trim();
    if (!newName || !isValidFolder(newName) || newName === oldName) {
      setRenamingFolder(null); return;
    }
    if (folders.includes(newName)) {
      setMsg({ type: 'error', text: `Un dossier "${newName}" existe déjà.` });
      setRenamingFolder(null); return;
    }
    // Mettre à jour tous les fichiers du dossier
    const toUpdate = files.filter(f => f.folder === oldName);
    try {
      const updated = await Promise.all(
        toUpdate.map(f => apiFetch(`/admin/cms/media/${f.id}`, { method: 'PATCH', body: { folder: newName } }))
      );
      setFiles(prev => {
        const map = Object.fromEntries(updated.map(u => [u.id, u]));
        return prev.map(f => map[f.id] || f);
      });
      // Mettre à jour localStorage
      const newSaved = savedFolders.map(f => f === oldName ? newName : f);
      if (!newSaved.includes(newName)) newSaved.push(newName);
      const finalSaved = newSaved.filter(f => f !== oldName || toUpdate.length === 0);
      setSavedFolders(finalSaved.filter(isValidFolder));
      persistFolders(finalSaved.filter(isValidFolder));
      if (currentFolder === oldName) setCurrentFolder(newName);
      setMsg({ type: 'success', text: `Dossier renommé en "${newName}".` });
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
    setRenamingFolder(null);
  }

  // ── Supprimer un dossier ──────────────────────────────────────────────────
  async function handleDeleteFolder(folderName, action, targetFolder) {
    const filesInFolder = files.filter(f => f.folder === folderName);
    try {
      if (action === 'delete') {
        // Supprimer tous les fichiers
        await Promise.all(filesInFolder.map(f => apiFetch(`/admin/cms/media/${f.id}`, { method: 'DELETE' })));
        setFiles(prev => prev.filter(f => f.folder !== folderName));
        if (selected && filesInFolder.some(f => f.id === selected.id)) setSelected(null);
      } else {
        // Déplacer les fichiers
        const updated = await Promise.all(
          filesInFolder.map(f => apiFetch(`/admin/cms/media/${f.id}`, {
            method: 'PATCH',
            body: { folder: targetFolder === ROOT ? '' : targetFolder },
          }))
        );
        setFiles(prev => {
          const map = Object.fromEntries(updated.map(u => [u.id, u]));
          return prev.map(f => map[f.id] || f);
        });
      }
      // Supprimer le dossier de localStorage
      const newSaved = savedFolders.filter(f => f !== folderName);
      setSavedFolders(newSaved); persistFolders(newSaved);
      if (currentFolder === folderName) setCurrentFolder(ROOT);
      setMsg({ type: 'success', text: `Dossier "${folderName}" supprimé.` });
    } catch (e) {
      setMsg({ type: 'error', text: e?.data?.error || e.message });
    }
    setDeletingFolder(null);
  }

  // ── Alt text + delete fichier ─────────────────────────────────────────────
  async function saveAlt() {
    try {
      const updated = await apiFetch(`/admin/cms/media/${selected.id}`, { method: 'PATCH', body: { alt_text: editAlt } });
      setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
      setSelected(updated);
      setMsg({ type: 'success', text: 'Alt text mis à jour.' });
    } catch (e) { setMsg({ type: 'error', text: e?.data?.error || e.message }); }
  }
  async function deleteFile(id) {
    if (!confirm('Supprimer ce fichier ? Cette action est irréversible.')) return;
    try {
      await apiFetch(`/admin/cms/media/${id}`, { method: 'DELETE' });
      setFiles(prev => prev.filter(f => f.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (e) { setMsg({ type: 'error', text: e?.data?.error || e.message }); }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────
  const content = (
    <div style={{ position: 'relative' }} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>

      {dropZoneActive && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(37,99,235,.12)', border: '3px dashed #2563eb', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', color: '#2563eb', fontWeight: 700, fontSize: 18 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📂</div>
            Déposer ici{currentFolder !== ROOT && <div style={{ fontSize: 14, fontWeight: 400, marginTop: 4 }}>dans « {currentFolder} »</div>}
          </div>
        </div>
      )}

      {deletingFolder && (
        <DeleteFolderModal
          folderName={deletingFolder}
          otherFolders={folders.filter(f => f !== deletingFolder)}
          fileCount={files.filter(f => f.folder === deletingFolder).length}
          onDelete={() => handleDeleteFolder(deletingFolder, 'delete')}
          onMove={target => handleDeleteFolder(deletingFolder, 'move', target)}
          onClose={() => setDeletingFolder(null)}
        />
      )}

      {/* Barre supérieure */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        {!embedded && <h2 style={{ margin: 0 }}>Médiathèque</h2>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrer…"
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: 180 }} />
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
            {uploading ? 'Upload…' : '+ Upload'}
          </button>
          <input ref={inputRef} type="file" accept="image/*,application/pdf,video/mp4" onChange={onInputChange} style={{ display: 'none' }} />
        </div>
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 8, background: msg.type === 'success' ? '#dcfce7' : '#fee2e2', color: msg.type === 'success' ? '#15803d' : '#b91c1c', fontSize: 14 }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, minHeight: 400 }}>

        {/* ── Sidebar dossiers ── */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: '.06em', marginBottom: 8 }}>Dossiers</div>

          {/* Médiathèque (racine) */}
          <FolderItem label="Médiathèque" icon="🏠" active={currentFolder === ROOT} over={dragOverFolder === ROOT}
            onClick={() => setCurrentFolder(ROOT)}
            onDragOver={e => onFolderDragOver(e, ROOT)} onDragLeave={onFolderDragLeave} onDrop={e => onFolderDrop(e, ROOT)} />

          {/* Dossiers utilisateur */}
          {folders.map(f => (
            renamingFolder === f ? (
              <div key={f} style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingFolder(null); }}
                  style={{ flex: 1, padding: '4px 7px', border: '1px solid #2563eb', borderRadius: 5, fontSize: 12 }}
                />
                <button onClick={commitRename}
                  style={{ fontSize: 11, padding: '3px 7px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✓</button>
                <button onClick={() => setRenamingFolder(null)}
                  style={{ fontSize: 11, padding: '3px 6px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}>✕</button>
              </div>
            ) : (
              <FolderItem key={f} label={f} icon="📁" active={currentFolder === f} over={dragOverFolder === f}
                onClick={() => setCurrentFolder(f)}
                onDragOver={e => onFolderDragOver(e, f)} onDragLeave={onFolderDragLeave} onDrop={e => onFolderDrop(e, f)}
                onRename={() => { setRenamingFolder(f); setRenameValue(f); }}
                onDelete={() => setDeletingFolder(f)}
              />
            )
          ))}

          {/* Nouveau dossier */}
          {showNewFolder ? (
            <div style={{ marginTop: 8 }}>
              <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); } }}
                placeholder="Nom du dossier"
                style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1px solid #2563eb', borderRadius: 5, fontSize: 12 }} />
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <button onClick={createFolder} style={{ flex: 1, fontSize: 11, padding: '3px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Créer</button>
                <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} style={{ fontSize: 11, padding: '3px 6px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewFolder(true)}
              style={{ marginTop: 10, width: '100%', fontSize: 12, padding: '5px 8px', background: 'none', border: '1px dashed #d1d5db', borderRadius: 6, cursor: 'pointer', color: '#6b7280', textAlign: 'left' }}>
              + Nouveau dossier
            </button>
          )}

          {draggingFile && (
            <div style={{ marginTop: 12, fontSize: 11, color: '#6b7280', fontStyle: 'italic', textAlign: 'center' }}>Glisser vers un dossier</div>
          )}
        </div>

        {/* ── Contenu principal ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            <span style={{ cursor: 'pointer', color: '#2563eb' }} onClick={() => setCurrentFolder(ROOT)}>Médiathèque</span>
            {currentFolder !== ROOT && <> / <strong style={{ color: '#111827' }}>{currentFolder}</strong></>}
            <span style={{ marginLeft: 8, color: '#9ca3af' }}>({visibleFiles.length} fichier{visibleFiles.length !== 1 ? 's' : ''})</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 300px' : '1fr', gap: 16 }}>
            <div>
              {loading ? (
                <p style={{ color: '#6b7280' }}>Chargement…</p>
              ) : visibleFiles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', border: '2px dashed #e5e7eb', borderRadius: 10 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
                  <div style={{ fontSize: 14 }}>{filter ? 'Aucun résultat' : currentFolder === ROOT ? 'Aucun fichier à la racine' : `Dossier "${currentFolder}" vide`}</div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>Glissez des images ici ou cliquez sur + Upload</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                  {visibleFiles.map(f => (
                    <div key={f.id} draggable
                      onDragStart={e => onFileDragStart(e, f)} onDragEnd={onFileDragEnd}
                      onClick={() => { setSelected(f); setEditAlt(f.alt_text || ''); }}
                      style={{ border: selected?.id === f.id ? '2px solid #2563eb' : '2px solid transparent', borderRadius: 8, cursor: 'grab', background: '#f9fafb', overflow: 'hidden', transition: 'border-color .15s, opacity .15s', opacity: draggingFile === f.id ? 0.5 : 1 }}>
                      {f.mime_type?.startsWith('image/') ? (
                        <img src={`${API_BASE}${f.url_path}`} alt={f.alt_text || f.original_name}
                          style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }}
                          onError={e => { e.target.style.display = 'none'; }} />
                      ) : (
                        <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>{mimeIcon(f.mime_type)}</div>
                      )}
                      <div style={{ padding: '5px 7px' }}>
                        <div style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.original_name}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>{fmtSize(f.size_bytes)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selected && (
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, border: '1px solid #e5e7eb', height: 'fit-content' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Détail</span>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>✕</button>
                </div>
                {selected.mime_type?.startsWith('image/') && (
                  <img src={`${API_BASE}${selected.url_path}`} alt={selected.alt_text || selected.original_name}
                    style={{ width: '100%', maxHeight: 140, objectFit: 'contain', borderRadius: 6, marginBottom: 10, background: '#fff' }} />
                )}
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 10 }}>
                  <div style={{ marginBottom: 3 }}><strong>Nom :</strong> {selected.original_name}</div>
                  <div style={{ marginBottom: 3 }}><strong>Type :</strong> {selected.mime_type}</div>
                  <div style={{ marginBottom: 3 }}><strong>Taille :</strong> {fmtSize(selected.size_bytes)}</div>
                  {selected.width_px && <div style={{ marginBottom: 3 }}><strong>Dimensions :</strong> {selected.width_px}×{selected.height_px}px</div>}
                  <div style={{ marginBottom: 3 }}><strong>Dossier :</strong> {isValidFolder(selected.folder) ? selected.folder : '— Médiathèque —'}</div>
                  <div style={{ wordBreak: 'break-all', marginBottom: 3 }}>
                    <strong>URL :</strong>{' '}<code style={{ fontSize: 10 }}>{selected.url_path}</code>
                    <button onClick={() => { navigator.clipboard.writeText(`${API_BASE}${selected.url_path}`); setMsg({ type: 'success', text: 'URL copiée !' }); }}
                      style={{ marginLeft: 4, fontSize: 10, padding: '1px 5px', background: '#e5e7eb', border: 'none', borderRadius: 3, cursor: 'pointer' }}>Copier</button>
                  </div>
                </div>

                <label style={{ display: 'block', fontWeight: 500, fontSize: 12, marginBottom: 4 }}>Déplacer vers</label>
                <select value={isValidFolder(selected.folder) ? selected.folder : ''}
                  onChange={async e => await moveFileTo(selected.id, e.target.value || ROOT)}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, marginBottom: 10 }}>
                  <option value="">— Médiathèque (racine) —</option>
                  {folders.map(f => <option key={f} value={f}>{f}</option>)}
                </select>

                <label style={{ display: 'block', fontWeight: 500, fontSize: 12, marginBottom: 4 }}>Alt text</label>
                <input value={editAlt} onChange={e => setEditAlt(e.target.value)} placeholder="Description de l'image…"
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={saveAlt} style={{ flex: 1, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5, padding: '6px', fontSize: 12, cursor: 'pointer' }}>Enregistrer</button>
                  <button onClick={() => deleteFile(selected.id)} style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 5, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>Suppr.</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) return content;
  return <div className="container">{content}</div>;
}

function FolderItem({ label, icon, active, over, onClick, onDragOver, onDragLeave, onDrop, onRename, onDelete }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 2, fontSize: 13, fontWeight: active ? 600 : 400, background: over ? '#dbeafe' : active ? '#eff6ff' : hovered ? '#f9fafb' : 'transparent', color: active ? '#2563eb' : '#374151', border: over ? '1px solid #93c5fd' : '1px solid transparent', transition: 'background .1s', userSelect: 'none' }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {onRename && (hovered || active) && (
        <>
          <button onClick={e => { e.stopPropagation(); onRename(); }} title="Renommer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#6b7280', padding: '1px 3px', borderRadius: 3, lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>✏️</button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} title="Supprimer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#ef4444', padding: '1px 3px', borderRadius: 3, lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>🗑</button>
        </>
      )}
    </div>
  );
}
