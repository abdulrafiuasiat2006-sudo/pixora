import React, { useState, useEffect } from 'react';
import { ToolType, SavedProject } from '../../types';
import { ProjectPersistenceService } from '../../services/projectPersistenceService';
import { useAuth } from '../../context/AuthContext';
import {
  Cloud,
  Check,
  RefreshCw,
  FolderOpen,
  Plus,
  Trash2,
  Edit2,
  Clock,
  AlertCircle,
  X,
} from 'lucide-react';

interface ProjectWorkspaceBarProps {
  tool: ToolType;
  currentProjectId?: string;
  currentTitle: string;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt?: number;
  onRenameTitle: (newTitle: string) => void;
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
  onClearProject?: () => void;
  hasActiveProject?: boolean;
  onRetrySave?: () => void;
}

export const ProjectWorkspaceBar: React.FC<ProjectWorkspaceBarProps> = ({
  tool,
  currentProjectId,
  currentTitle,
  saveStatus,
  lastSavedAt,
  onRenameTitle,
  onSelectProject,
  onNewProject,
  onClearProject,
  hasActiveProject = false,
  onRetrySave,
}) => {
  const { user } = useAuth();
  const userId = user?.id || 'guest';
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(currentTitle);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [projectsList, setProjectsList] = useState<SavedProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    setTitleInput(currentTitle);
  }, [currentTitle]);

  const loadToolProjects = async () => {
    setLoadingProjects(true);
    try {
      const list = await ProjectPersistenceService.listProjects(userId, tool);
      setProjectsList(list);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleOpenModal = () => {
    loadToolProjects();
    setShowProjectsModal(true);
  };

  const handleSaveTitle = () => {
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== currentTitle) {
      onRenameTitle(trimmed);
    } else {
      setTitleInput(currentTitle);
    }
    setIsEditingTitle(false);
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this saved project? This action cannot be undone.')) {
      await ProjectPersistenceService.deleteProject(id, userId);
      await loadToolProjects();
      if (id === currentProjectId) {
        onNewProject();
      }
    }
  };

  const formatTimeAgo = (ts?: number) => {
    if (!ts) return 'Just now';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 10) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <>
      <div className="bg-white border border-[#171717]/15 rounded-xl px-3.5 sm:px-4 py-2.5 sm:py-3 mb-6 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        {/* Left: Project Title & Rename */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF6B35] bg-[#FF6B35]/10 px-2 py-0.5 rounded shrink-0">
            {tool}
          </span>

          {isEditingTitle ? (
            <div className="flex items-center gap-1.5 w-full max-w-sm min-w-0">
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') {
                    setTitleInput(currentTitle);
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
                className="text-xs sm:text-sm font-semibold text-[#171717] bg-white border border-[#FF6B35] rounded-lg px-2.5 py-1.5 focus:outline-none w-full min-w-0"
                placeholder="Project title..."
              />
              <button
                type="button"
                onClick={handleSaveTitle}
                className="p-1.5 min-h-[38px] min-w-[38px] flex items-center justify-center text-[#171717] hover:text-green-700 hover:bg-green-50 rounded-lg transition cursor-pointer shrink-0"
                title="Save title"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitleInput(currentTitle);
                  setIsEditingTitle(false);
                }}
                className="p-1.5 min-h-[38px] min-w-[38px] flex items-center justify-center text-[#171717]/60 hover:text-[#171717] rounded-lg transition cursor-pointer shrink-0"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <h2
                onClick={() => setIsEditingTitle(true)}
                className="text-xs sm:text-sm font-bold text-[#171717] truncate hover:text-[#FF6B35] cursor-pointer"
                title="Click to rename project"
              >
                {currentTitle || 'Untitled Project'}
              </h2>
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="text-[#171717]/40 hover:text-[#171717] p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition cursor-pointer shrink-0 active:scale-95"
                title="Rename Project"
                aria-label="Rename project"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Save Status & Project Switcher Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
          {/* Persistence status indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-[#171717]/70 font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#FF6B35]" />
                <span className="hidden sm:inline">Saving...</span>
              </span>
            )}

            {saveStatus === 'saved' && (
              <span
                className="flex items-center gap-1 text-emerald-700 font-medium"
                title={`Last saved at ${lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : 'just now'}`}
              >
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <Cloud className="w-3.5 h-3.5 text-emerald-600 hidden xs:inline" />
                <span className="hidden sm:inline">Saved ({formatTimeAgo(lastSavedAt)})</span>
              </span>
            )}

            {saveStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-amber-700 font-medium">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden sm:inline">Saved locally</span>
                {onRetrySave && (
                  <button
                    type="button"
                    onClick={onRetrySave}
                    className="text-xs text-[#FF6B35] font-semibold underline hover:no-underline cursor-pointer"
                  >
                    Retry Cloud Sync
                  </button>
                )}
              </span>
            )}

            {saveStatus === 'idle' && (
              <span className="flex items-center gap-1 text-[#171717]/50 text-xs">
                <Cloud className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Active</span>
              </span>
            )}
          </div>

          <div className="hidden xs:block h-4 w-px bg-[#171717]/15" />

          {/* All Projects for this tool */}
          <button
            type="button"
            onClick={handleOpenModal}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[38px] text-xs font-semibold text-[#171717] bg-[#171717]/5 hover:bg-[#171717]/10 rounded-lg border border-[#171717]/10 transition cursor-pointer active:scale-95"
            title="Open Saved Projects for this tool"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#FF6B35]" />
            <span>Projects</span>
          </button>

          {/* New Project Button */}
          <button
            type="button"
            onClick={onNewProject}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 min-h-[38px] text-xs font-semibold text-[#171717] bg-white hover:bg-[#171717]/5 rounded-lg border border-[#171717]/15 transition shadow-2xs cursor-pointer active:scale-95"
            title="Start a new blank project without losing this one"
          >
            <Plus className="w-3.5 h-3.5 text-[#FF6B35]" />
            <span>New</span>
          </button>

          {/* Explicit Clear / Cancel workspace button */}
          {hasActiveProject && onClearProject && (
            <button
              type="button"
              onClick={onClearProject}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 min-h-[38px] text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100/80 rounded-lg border border-red-200 transition shadow-2xs cursor-pointer active:scale-95"
              title="Clear current image and reset this workspace"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* MODAL: Switch or manage saved projects for this tool */}
      {showProjectsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/60 p-4">
          <div className="bg-[#F7F5F0] border border-[#171717]/20 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#171717]/10 bg-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#171717]">
                  {tool.charAt(0).toUpperCase() + tool.slice(1)} Projects
                </h3>
                <p className="text-xs text-[#171717]/65 mt-0.5">
                  Reopen any ongoing project, continue editing, or start fresh.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowProjectsModal(false);
                    onNewProject();
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-md transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#FF6B35]" />
                  <span>+ New Project</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowProjectsModal(false)}
                  className="p-1.5 text-[#171717]/60 hover:text-[#171717] rounded-lg transition cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Project list */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-2.5">
              {loadingProjects ? (
                <div className="py-12 flex flex-col items-center justify-center text-xs text-[#171717]/60">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#FF6B35] mb-2" />
                  <span>Loading saved projects...</span>
                </div>
              ) : projectsList.length === 0 ? (
                <div className="py-12 text-center">
                  <FolderOpen className="w-8 h-8 text-[#171717]/30 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-[#171717]">No saved projects for {tool} yet</p>
                  <p className="text-xs text-[#171717]/60 mt-1">
                    Upload an image and your work will automatically save here.
                  </p>
                </div>
              ) : (
                projectsList.map((p) => {
                  const isCurrent = p.id === currentProjectId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setShowProjectsModal(false);
                        onSelectProject(p.id);
                      }}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-[#FF6B35]/10 border-[#FF6B35] shadow-xs'
                          : 'bg-white border-[#171717]/10 hover:border-[#171717]/30 hover:bg-white/90 shadow-2xs'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-xs font-bold text-[#171717] truncate">
                            {p.title}
                          </h4>
                          {isCurrent && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B35] bg-[#FF6B35]/20 px-1.5 py-0.5 rounded">
                              Active
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              p.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {p.status || 'draft'}
                          </span>
                        </div>

                        <p className="text-[11px] text-[#171717]/70 truncate">
                          {p.configSummary || p.originalFileName || 'Draft configuration'}
                        </p>

                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[#171717]/50 font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(p.updatedAt || p.createdAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {p.originalWidth > 0 && (
                            <span>{p.originalWidth}×{p.originalHeight}px</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteProject(p.id, e)}
                          className="p-1.5 text-[#171717]/40 hover:text-red-700 hover:bg-red-50 rounded transition cursor-pointer"
                          title="Delete Project"
                          aria-label="Delete project"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-white border-t border-[#171717]/10 flex justify-end">
              <button
                type="button"
                onClick={() => setShowProjectsModal(false)}
                className="px-4 py-1.5 text-xs font-semibold text-[#171717] hover:bg-[#171717]/5 rounded-md transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
