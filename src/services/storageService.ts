import { SavedProject, UserPreferences, UserProfile } from '../types';

const STORAGE_KEYS = {
  USER: 'pixora_auth_user',
  TOKEN: 'pixora_auth_token',
  PREFERENCES: 'pixora_user_preferences',
  PROJECTS: 'pixora_saved_projects',
  EXPORT_HISTORY: 'pixora_export_history',
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultFormat: 'image/jpeg',
  defaultJpegQuality: 85,
  defaultNamingTemplate: '{name}-{tool}-{index}',
  autoClearHistoryDays: 30,
  highPrecisionMode: true,
};

// Initial default projects to show when a user opens the projects tab
const INITIAL_DEMO_PROJECTS: SavedProject[] = [
  {
    id: 'demo-proj-1',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2, // 2 days ago
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    title: 'Instagram 3×3 Giant Banner Split',
    tool: 'splitter',
    originalFileName: 'tokyo_cityscape_ultra.jpg',
    originalWidth: 3240,
    originalHeight: 3240,
    originalSizeBytes: 4892014,
    exportCount: 9,
    configSummary: '3×3 Grid Split (9 tiles @ 1080×1080 px)',
  },
  {
    id: 'demo-proj-2',
    createdAt: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
    updatedAt: Date.now() - 1000 * 60 * 60 * 48,
    title: 'YouTube Thumbnail Strict Compression',
    tool: 'compressor',
    originalFileName: 'tech_keynote_presentation.png',
    originalWidth: 1920,
    originalHeight: 1080,
    originalSizeBytes: 4210984,
    exportCount: 1,
    configSummary: 'Target Size: 1.85 MB (56% reduction)',
  },
  {
    id: 'demo-proj-3',
    createdAt: Date.now() - 1000 * 60 * 60 * 12, // 12 hours ago
    updatedAt: Date.now() - 1000 * 60 * 60 * 12,
    title: 'LinkedIn Document Carousel 5-Slide',
    tool: 'splitter',
    originalFileName: 'market_strategy_deck.jpg',
    originalWidth: 5400,
    originalHeight: 1350,
    originalSizeBytes: 6814200,
    exportCount: 5,
    configSummary: '5-Slide Seamless Carousel @ 4:5 Aspect',
  },
];

export class StorageService {
  /**
   * Retrieves the current user profile or null.
   */
  static getUser(): UserProfile | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USER);
      if (!data) return null;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Saves or updates the current user profile.
   */
  static saveUser(user: UserProfile): void {
    try {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to save user profile', e);
    }
  }

  /**
   * Retrieves the stored auth session token.
   */
  static getToken(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS.TOKEN);
    } catch {
      return null;
    }
  }

  /**
   * Sets or removes the stored auth session token.
   */
  static setToken(token: string | null): void {
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      } else {
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
      }
    } catch (e) {
      console.error('Failed to set auth token', e);
    }
  }

  /**
   * Clears user session and token (Sign out).
   */
  static clearUser(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.USER);
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
    } catch (e) {
      console.error('Failed to clear user', e);
    }
  }

  /**
   * Retrieves user preferences.
   */
  static getPreferences(): UserPreferences {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      if (!data) return DEFAULT_PREFERENCES;
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(data) };
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }

  /**
   * Saves user preferences.
   */
  static savePreferences(prefs: UserPreferences): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(prefs));
    } catch (e) {
      console.error('Failed to save preferences', e);
    }
  }

  /**
   * Retrieves saved projects.
   */
  static getProjects(): SavedProject[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (!data) {
        // Seed initial demo projects on first visit
        this.saveProjects(INITIAL_DEMO_PROJECTS);
        return INITIAL_DEMO_PROJECTS;
      }
      return JSON.parse(data);
    } catch {
      return INITIAL_DEMO_PROJECTS;
    }
  }

  /**
   * Saves projects array.
   */
  static saveProjects(projects: SavedProject[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    } catch (e) {
      console.error('Failed to save projects', e);
    }
  }

  /**
   * Adds a new project record.
   */
  static addProject(project: Omit<SavedProject, 'id' | 'createdAt' | 'updatedAt'>): SavedProject {
    const projects = this.getProjects();
    const newProject: SavedProject = {
      ...project,
      id: 'proj_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newProject, ...projects];
    this.saveProjects(updated);
    return newProject;
  }

  /**
   * Deletes a project by ID.
   */
  static deleteProject(id: string): void {
    const projects = this.getProjects();
    const updated = projects.filter((p) => p.id !== id);
    this.saveProjects(updated);
  }

  /**
   * Complete account deletion and local cache purge.
   */
  static purgeAllData(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.USER);
      localStorage.removeItem(STORAGE_KEYS.PREFERENCES);
      localStorage.removeItem(STORAGE_KEYS.PROJECTS);
      localStorage.removeItem(STORAGE_KEYS.EXPORT_HISTORY);
      sessionStorage.clear();
    } catch (e) {
      console.error('Failed to purge data', e);
    }
  }
}
