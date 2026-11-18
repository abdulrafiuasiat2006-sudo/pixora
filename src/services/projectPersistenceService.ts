import { FullWorkspaceProject, SavedProject, ToolType } from '../types';
import { idbStorage } from '../utils/idbStorage';
import { StorageService } from './storageService';

/**
 * 100% Client-Side Local Project Persistence Service.
 * All workspace projects, image Blobs, and active tool states stay strictly inside
 * the user's browser (IndexedDB for binary File/Blob + config, localStorage for lightweight metadata).
 * Zero image files, thumbnails, base64 strings, or project image payloads are ever uploaded
 * to Firebase, Firestore, external servers, or backend storage.
 */
export class ProjectPersistenceService {
  /**
   * Generates a new draft project with unique ID.
   */
  static createNewProject(
    userId: string,
    tool: ToolType,
    title?: string
  ): FullWorkspaceProject {
    const now = Date.now();
    const id = 'proj_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    return {
      id,
      userId,
      tool,
      title: title || `Untitled ${tool.charAt(0).toUpperCase() + tool.slice(1)}`,
      createdAt: now,
      updatedAt: now,
      status: 'draft',
      originalFileName: '',
      originalWidth: 0,
      originalHeight: 0,
      originalSizeBytes: 0,
      exportCount: 0,
      configSummary: 'Draft configuration',
      config: {},
    };
  }

  /**
   * Saves a project 100% locally in browser IndexedDB (binary File/Blob) and
   * stores lightweight metadata (zero image data) in localStorage.
   * Never transmits images or project data over the network.
   */
  static async saveProject(
    project: FullWorkspaceProject,
    _syncFileToServer: boolean = false
  ): Promise<FullWorkspaceProject> {
    const now = Date.now();
    const hasBinaryBlob = project.originalBlob instanceof Blob && project.originalBlob.size > 0;

    // Prepare IndexedDB record: when binary originalBlob is present, avoid storing redundant
    // base64 strings or ephemeral blob: URLs; IndexedDB stores the Blob natively.
    const recordForIdb: FullWorkspaceProject = {
      ...project,
      updatedAt: now,
      thumbnailUrl: undefined,
      originalDataUrl: hasBinaryBlob
        ? undefined
        : project.originalDataUrl && !project.originalDataUrl.startsWith('blob:')
        ? project.originalDataUrl
        : undefined,
      hasStoredFile: hasBinaryBlob || Boolean(project.originalDataUrl),
    };

    // 1. Save to local IndexedDB
    await idbStorage.saveProject(recordForIdb);
    await idbStorage.setActiveProjectId(project.userId, project.tool, project.id);

    // 2. Sync metadata-only summary to localStorage (never store images/blobs/thumbnails in localStorage)
    try {
      const summary: SavedProject = {
        id: recordForIdb.id,
        createdAt: recordForIdb.createdAt,
        updatedAt: recordForIdb.updatedAt,
        title: recordForIdb.title,
        tool: recordForIdb.tool,
        status: recordForIdb.status,
        originalFileName: recordForIdb.originalFileName,
        originalWidth: recordForIdb.originalWidth,
        originalHeight: recordForIdb.originalHeight,
        originalSizeBytes: recordForIdb.originalSizeBytes,
        originalMimeType: recordForIdb.originalMimeType,
        exportCount: recordForIdb.exportCount,
        configSummary: recordForIdb.configSummary,
        hasStoredFile: recordForIdb.hasStoredFile,
      };
      const existing = StorageService.getProjects();
      const filtered = existing.filter((p) => p.id !== summary.id);
      StorageService.saveProjects([summary, ...filtered]);
    } catch (e) {
      console.warn('Could not update localStorage project summary:', e);
    }

    return {
      ...project,
      updatedAt: now,
      thumbnailUrl: undefined,
      hasStoredFile: recordForIdb.hasStoredFile,
    };
  }

  /**
   * Deprecated server upload stub retained for API compatibility.
   * Pixora guarantees 100% client-side processing and never uploads user images.
   */
  static async uploadProjectFile(
    _projectId: string,
    _dataUrl: string,
    _fileName?: string
  ): Promise<boolean> {
    return false;
  }

  /**
   * Gets the currently active project for a tool from local IndexedDB.
   */
  static async getActiveProject(
    userId: string,
    tool: ToolType
  ): Promise<FullWorkspaceProject | null> {
    const activeId = await idbStorage.getActiveProjectId(userId, tool);

    if (activeId) {
      const proj = await this.loadProject(activeId, userId);
      if (proj) {
        if (proj.status === 'completed') {
          await this.setActiveProject(userId, tool, null);
          return null;
        }
        return proj;
      }
    }

    return null;
  }

  /**
   * Loads a full project by ID strictly from local IndexedDB and hydrates a fresh Object URL
   * from its stored binary Blob if present.
   */
  static async loadProject(
    id: string,
    _userId: string
  ): Promise<FullWorkspaceProject | null> {
    const project = await idbStorage.getProject(id);
    if (!project) return null;

    if (project.originalBlob instanceof Blob && project.originalBlob.size > 0) {
      return {
        ...project,
        originalDataUrl: URL.createObjectURL(project.originalBlob),
      };
    }

    if (project.originalDataUrl && project.originalDataUrl.startsWith('blob:')) {
      return {
        ...project,
        originalDataUrl: undefined,
      };
    }

    return project;
  }

  /**
   * Lists all projects for user strictly from local IndexedDB.
   */
  static async listProjects(
    userId: string,
    tool?: ToolType
  ): Promise<SavedProject[]> {
    const localProjects = await idbStorage.listProjectsByUser(userId, tool);

    const list: SavedProject[] = localProjects.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      title: p.title,
      tool: p.tool,
      status: p.status,
      originalFileName: p.originalFileName,
      originalWidth: p.originalWidth,
      originalHeight: p.originalHeight,
      originalSizeBytes: p.originalSizeBytes,
      originalMimeType: p.originalMimeType,
      exportCount: p.exportCount,
      configSummary: p.configSummary,
      hasStoredFile: Boolean(p.originalBlob || p.hasStoredFile),
    }));

    list.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    return list;
  }

  /**
   * Sets the active project pointer for a tool in local IndexedDB.
   */
  static async setActiveProject(
    userId: string,
    tool: ToolType,
    projectId: string | null
  ): Promise<void> {
    await idbStorage.setActiveProjectId(userId, tool, projectId);
  }

  /**
   * Deletes a project strictly from local browser storage (IndexedDB + localStorage).
   */
  static async deleteProject(id: string, _userId: string): Promise<void> {
    await idbStorage.deleteProject(id);
    StorageService.deleteProject(id);
  }
}
