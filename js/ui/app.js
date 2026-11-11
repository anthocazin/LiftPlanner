// État de l'application : projet courant, résultat de calcul, persistance locale.
import { defaultProject, migrate, getPath, setPath } from '../state.js';
import { computeProject } from '../engine/compute.js';

const LS_KEY = 'liftplanner.project.v1';
const LS_INV = 'liftplanner.inventory.v1';

function safeLoad(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function safeSave(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const app = {
  project: null,
  result: null,
  drawingFile: null, // { kind, name, bytes | image } — non sérialisé par défaut
  listeners: new Set(),
  _timer: null,

  init() {
    const saved = safeLoad(LS_KEY);
    this.project = saved ? migrate(saved) : defaultProject();
    const inv = safeLoad(LS_INV);
    if (Array.isArray(inv) && !this.project.inventory?.length) this.project.inventory = inv;
    this.recompute(true);
  },
  get(path) {
    return getPath(this.project, path);
  },
  set(path, value, { silent = false } = {}) {
    setPath(this.project, path, value);
    if (!silent) this.schedule();
  },
  /** Modifie l'état via une fonction puis recalcule immédiatement. */
  mutate(fn) {
    fn(this.project);
    this.recompute();
  },
  schedule() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.recompute(), 120);
  },
  recompute(silentSave = false) {
    clearTimeout(this._timer);
    try {
      this.result = computeProject(this.project);
    } catch (err) {
      console.error(err);
      this.result = { error: String(err?.message || err), checks: [], steps: [], bom: [], rig: { error: String(err?.message || err) } };
    }
    this.persist(silentSave);
    for (const fn of this.listeners) {
      try {
        fn(this.result);
      } catch (e) {
        console.error(e);
      }
    }
  },
  persist() {
    const { drawing, ...rest } = this.project;
    const light = { ...rest, drawing: drawing ? { ...drawing, dataUrl: undefined } : null };
    safeSave(LS_KEY, light);
    safeSave(LS_INV, this.project.inventory || []);
  },
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  load(data) {
    this.project = migrate(data);
    this.recompute();
  },
  reset(project) {
    const inv = this.project?.inventory || [];
    this.project = project;
    if (!project.inventory?.length) project.inventory = inv;
    this.drawingFile = null;
    this.recompute();
  },
};
