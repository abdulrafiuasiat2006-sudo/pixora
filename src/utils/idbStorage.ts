import { FullWorkspaceProject, ToolType } from '../types';

const DB_NAME = 'pixora_workspace_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_ACTIVE_TOOLS = 'active_tools';

class IdbStorageEngine {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryFallbackProjects: Map<string, FullWorkspaceProject> = new Map();
  private memoryFallbackActive: Map<string, string> = new Map();

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    if (typeof window === 'undefined' || !window.indexedDB) {
      return Promise.reject(new Error('IndexedDB not supported'));
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          const projectStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
          projectStore.createIndex('userId', 'userId', { unique: false });
          projectStore.createIndex('tool', 'tool', { unique: false });
          projectStore.createIndex('user_tool', ['userId', 'tool'], { unique: false });
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_ACTIVE_TOOLS)) {
          db.createObjectStore(STORE_ACTIVE_TOOLS, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  async saveProject(project: FullWorkspaceProject): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, 'readwrite');
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.put(project);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      this.memoryFallbackProjects.set(project.id, project);
    }
  }

  async getProject(id: string): Promise<FullWorkspaceProject | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, 'readonly');
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.get(id);
        req.onsuccess = () => resolve((req.result as FullWorkspaceProject) || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memoryFallbackProjects.get(id) || null;
    }
  }

  async listProjectsByUser(userId: string, tool?: ToolType): Promise<FullWorkspaceProject[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, 'readonly');
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.getAll();

        req.onsuccess = () => {
          let list = (req.result as FullWorkspaceProject[]) || [];
          list = list.filter((p) => p.userId === userId);
          if (tool) {
            list = list.filter((p) => p.tool === tool);
          }
          list.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      let list = Array.from(this.memoryFallbackProjects.values()).filter((p) => p.userId === userId);
      if (tool) list = list.filter((p) => p.tool === tool);
      list.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
      return list;
    }
  }

  async deleteProject(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, 'readwrite');
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      this.memoryFallbackProjects.delete(id);
    }
  }

  async getActiveProjectId(userId: string, tool: ToolType): Promise<string | null> {
    const key = `${userId}_${tool}`;
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_ACTIVE_TOOLS, 'readonly');
        const store = tx.objectStore(STORE_ACTIVE_TOOLS);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result?.projectId || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memoryFallbackActive.get(key) || null;
    }
  }

  async setActiveProjectId(userId: string, tool: ToolType, projectId: string | null): Promise<void> {
    const key = `${userId}_${tool}`;
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_ACTIVE_TOOLS, 'readwrite');
        const store = tx.objectStore(STORE_ACTIVE_TOOLS);
        if (projectId) {
          const req = store.put({ key, projectId, updatedAt: Date.now() });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        } else {
          const req = store.delete(key);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        }
      });
    } catch {
      if (projectId) {
        this.memoryFallbackActive.set(key, projectId);
      } else {
        this.memoryFallbackActive.delete(key);
      }
    }
  }
}

export const idbStorage = new IdbStorageEngine();
