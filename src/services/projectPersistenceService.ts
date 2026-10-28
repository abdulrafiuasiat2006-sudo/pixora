import { FullWorkspaceProject, SavedProject, ToolType } from '../types';
import { idbStorage } from '../utils/idbStorage';
import { StorageService } from './storageService';

export class ProjectPersistenceService {
  private static getAuthHeaders(): Record<string, string> {
    const token = StorageService.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

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
   * Saves a project locally (IndexedDB) and syncs to backend API.
   */
  static async saveProject(
    project: FullWorkspaceProject,
    syncFileToServer: boolean = false
  ): Promise<FullWorkspaceProject> {
    const updatedProject: FullWorkspaceProject = {
      ...project,
      updatedAt: Date.now(),
    };

    // 1. Save to local IndexedDB (guarantees instantaneous offline persistence)
    await idbStorage.saveProject(updatedProject);
    await idbStorage.setActiveProjectId(project.userId, project.tool, project.id);

    // 2. Also sync to localStorage list for quick dashboard references
    try {
      const summary: SavedProject = {
        id: updatedProject.id,
        createdAt: updatedProject.createdAt,
        updatedAt: updatedProject.updatedAt,
        title: updatedProject.title,
        tool: updatedProject.tool,
        status: updatedProject.status,
        originalFileName: updatedProject.originalFileName,
        originalWidth: updatedProject.originalWidth,
        originalHeight: updatedProject.originalHeight,
        originalSizeBytes: updatedProject.originalSizeBytes,
        originalMimeType: updatedProject.originalMimeType,
        exportCount: updatedProject.exportCount,
        configSummary: updatedProject.configSummary,
        thumbnailUrl: updatedProject.thumbnailUrl,
        hasStoredFile: updatedProject.hasStoredFile,
      };
      const existing = StorageService.getProjects();
      const filtered = existing.filter((p) => p.id !== summary.id);
      StorageService.saveProjects([summary, ...filtered]);
    } catch (e) {
      console.warn('Could not update localStorage project summary:', e);
    }

    // 3. Sync to backend API if user is authenticated
    const token = StorageService.getToken();
    if (token) {
      try {
        const resp = await fetch('/api/user/projects', {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            id: updatedProject.id,
            title: updatedProject.title,
            tool: updatedProject.tool,
            status: updatedProject.status,
            originalFileName: updatedProject.originalFileName,
            originalWidth: updatedProject.originalWidth,
            originalHeight: updatedProject.originalHeight,
            originalSizeBytes: updatedProject.originalSizeBytes,
            originalMimeType: updatedProject.originalMimeType,
            exportCount: updatedProject.exportCount,
            configSummary: updatedProject.configSummary,
            config: updatedProject.config,
            thumbnailDataUrl: updatedProject.thumbnailUrl,
            hasStoredFile: updatedProject.hasStoredFile,
          }),
        });

        if (resp.ok) {
          // If requested and dataUrl is present, upload file to server storage
          if (syncFileToServer && updatedProject.originalDataUrl) {
            this.uploadProjectFile(updatedProject.id, updatedProject.originalDataUrl, updatedProject.originalFileName)
              .catch((err) => console.warn('Background server file sync:', err));
          }
        }
      } catch (err) {
        console.warn('Server project sync deferred (offline or network error):', err);
      }
    }

    return updatedProject;
  }

  /**
   * Uploads project original image file to persistent server file storage.
   */
  static async uploadProjectFile(
    projectId: string,
    dataUrl: string,
    fileName?: string
  ): Promise<boolean> {
    const token = StorageService.getToken();
    if (!token) return false;

    try {
      const resp = await fetch(`/api/user/projects/${projectId}/file`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ dataUrl, fileName }),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /**
   * Gets the currently active project for a tool.
   */
  static async getActiveProject(
    userId: string,
    tool: ToolType
  ): Promise<FullWorkspaceProject | null> {
    // 1. Check local active project ID
    let activeId = await idbStorage.getActiveProjectId(userId, tool);

    // If not in local IndexedDB, check server active tools
    const token = StorageService.getToken();
    if (!activeId && token) {
      try {
        const res = await fetch('/api/user/active-tools', {
          headers: this.getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.activeTools && data.activeTools[tool]) {
            activeId = data.activeTools[tool];
          }
        }
      } catch (e) {
        console.warn('Could not fetch server active tools:', e);
      }
    }

    if (activeId) {
      const proj = await this.loadProject(activeId, userId);
      if (proj) {
        // If the project was already marked completed, clear active pointer and do not resurrect it
        if (proj.status === 'completed') {
          await this.setActiveProject(userId, tool, null);
          return null;
        }
        return proj;
      }
    }

    // Never resurrect old completed projects when active project is null or cleared
    return null;
  }

  /**
   * Loads a full project by ID, pulling image from server if missing locally.
   */
  static async loadProject(
    id: string,
    userId: string
  ): Promise<FullWorkspaceProject | null> {
    // 1. Try local IndexedDB first
    let project = await idbStorage.getProject(id);

    // 2. If not found locally or lacks image, try server
    const token = StorageService.getToken();
    if (!project && token) {
      try {
        const resp = await fetch(`/api/user/projects/${id}`, {
          headers: this.getAuthHeaders(),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.project) {
            project = {
              ...data.project,
              userId,
            };
          }
        }
      } catch (e) {
        console.warn('Failed to load project from server:', e);
      }
    }

    if (!project) return null;

    // 3. If project has stored file on server but no local originalDataUrl, download file
    if (!project.originalDataUrl && project.hasStoredFile && token) {
      try {
        const fileResp = await fetch(`/api/user/projects/${id}/file`, {
          headers: this.getAuthHeaders(),
        });
        if (fileResp.ok) {
          const blob = await fileResp.blob();
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          project.originalDataUrl = dataUrl;
          // Cache in IndexedDB for subsequent instant loads
          await idbStorage.saveProject(project);
        }
      } catch (e) {
        console.warn('Could not fetch stored file from server:', e);
      }
    }

    return project;
  }

  /**
   * Lists all projects for user (combining local IndexedDB and server).
   */
  static async listProjects(
    userId: string,
    tool?: ToolType
  ): Promise<SavedProject[]> {
    const localProjects = await idbStorage.listProjectsByUser(userId, tool);
    const localMap = new Map<string, SavedProject>();

    localProjects.forEach((p) => {
      localMap.set(p.id, {
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
        thumbnailUrl: p.thumbnailUrl,
        hasStoredFile: p.hasStoredFile,
      });
    });

    // Merge with server list
    const token = StorageService.getToken();
    if (token) {
      try {
        const resp = await fetch('/api/user/projects', {
          headers: this.getAuthHeaders(),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.projects)) {
            data.projects.forEach((sp: any) => {
              if (!tool || sp.tool === tool) {
                if (!localMap.has(sp.id)) {
                  localMap.set(sp.id, sp);
                }
              }
            });
          }
        }
      } catch (e) {
        console.warn('Could not fetch server projects:', e);
      }
    }

    const list = Array.from(localMap.values());
    list.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    return list;
  }

  /**
   * Sets the active project for a tool.
   */
  static async setActiveProject(
    userId: string,
    tool: ToolType,
    projectId: string | null
  ): Promise<void> {
    await idbStorage.setActiveProjectId(userId, tool, projectId);
    const token = StorageService.getToken();
    if (token) {
      fetch('/api/user/active-tools', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ tool, projectId }),
      }).catch(() => {});
    }
  }

  /**
   * Deletes a project from both local storage and server.
   */
  static async deleteProject(id: string, userId: string): Promise<void> {
    await idbStorage.deleteProject(id);
    StorageService.deleteProject(id);

    const token = StorageService.getToken();
    if (token) {
      try {
        await fetch(`/api/user/projects/${id}`, {
          method: 'DELETE',
          headers: this.getAuthHeaders(),
        });
      } catch (e) {
        console.warn('Could not delete project from server:', e);
      }
    }
  }
}
