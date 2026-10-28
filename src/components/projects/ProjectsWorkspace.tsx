import React, { useState, useEffect } from 'react';
import { SavedProject, ToolType } from '../../types';
import { ProjectPersistenceService } from '../../services/projectPersistenceService';
import { useAuth } from '../../context/AuthContext';
import { formatBytes } from '../../utils/imageEngine';
import {
  FolderOpen,
  Trash2,
  ExternalLink,
  Plus,
  Grid,
  Sliders,
  Crop,
  Layers,
  Search,
  Clock,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

interface ProjectsWorkspaceProps {
  onOpenProject: (project: SavedProject) => void;
  onNavigate: (tab: string) => void;
}

export const ProjectsWorkspace: React.FC<ProjectsWorkspaceProps> = ({
  onOpenProject,
  onNavigate,
}) => {
  const { user } = useAuth();
  const userId = user?.id || 'guest';
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTool, setFilterTool] = useState<ToolType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadAllProjects = async () => {
    setLoading(true);
    try {
      const list = await ProjectPersistenceService.listProjects(userId);
      setProjects(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllProjects();
  }, [userId]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this project?')) {
      await ProjectPersistenceService.deleteProject(id, userId);
      await loadAllProjects();
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to delete all saved projects? This will permanently remove them.')) {
      for (const p of projects) {
        await ProjectPersistenceService.deleteProject(p.id, userId);
      }
      setProjects([]);
    }
  };

  const handleOpen = async (p: SavedProject) => {
    await ProjectPersistenceService.setActiveProject(userId, p.tool, p.id);
    onOpenProject(p);
  };

  const filteredProjects = projects.filter((p) => {
    if (filterTool !== 'all' && p.tool !== filterTool) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.originalFileName.toLowerCase().includes(q) ||
        p.configSummary.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getToolIcon = (tool: ToolType) => {
    switch (tool) {
      case 'splitter':
        return <Grid className="w-3.5 h-3.5 text-[#FF6B35]" />;
      case 'compressor':
        return <Sliders className="w-3.5 h-3.5 text-[#FF6B35]" />;
      case 'resizer':
        return <Layers className="w-3.5 h-3.5 text-[#FF6B35]" />;
      case 'cropper':
        return <Crop className="w-3.5 h-3.5 text-[#FF6B35]" />;
      default:
        return <FolderOpen className="w-3.5 h-3.5 text-[#FF6B35]" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#171717]/10 mb-8">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#171717]/60">
            <span>Workspace</span>
            <span>/</span>
            <span className="text-[#171717] font-medium">Projects & History</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#171717] mt-1">
            Saved Projects
          </h1>
          <p className="mt-1 text-sm text-[#171717]/70">
            Saved split grids, compressed deliverables, and custom crop jobs stored privately in your local browser sandbox.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {projects.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-md transition-colors"
            >
              Clear All Projects
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-md transition-colors shadow-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-[#FF6B35]" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
          <input
            type="text"
            placeholder="Search projects by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#171717]/20 rounded-md focus:border-[#FF6B35] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-white border border-[#171717]/15 p-1 rounded-xl text-xs overflow-x-auto shadow-2xs">
          {[
            { id: 'all', label: 'All' },
            { id: 'splitter', label: 'Splitter' },
            { id: 'compressor', label: 'Compressor' },
            { id: 'resizer', label: 'Resizer' },
            { id: 'cropper', label: 'Cropper' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilterTool(t.id as any)}
              className={`px-3.5 py-2 min-h-[38px] rounded-lg transition-colors whitespace-nowrap cursor-pointer active:scale-95 ${
                filterTool === t.id
                  ? 'bg-[#171717] text-white font-semibold shadow-xs'
                  : 'text-[#171717]/70 hover:text-[#171717]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16 bg-white/40 border border-[#171717]/10 rounded-xl px-4">
          <FolderOpen className="w-10 h-10 text-[#171717]/30 mx-auto mb-2" />
          <p className="text-sm font-semibold text-[#171717]">No saved projects found</p>
          <p className="text-xs text-[#171717]/60 mt-1 max-w-sm mx-auto">
            When you configure an image split, compression, or crop, tap "Save Project" to keep your work in this workspace.
          </p>
          <button
            onClick={() => onNavigate('dashboard')}
            className="mt-4 px-5 py-2.5 min-h-[42px] text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-xl transition-colors shadow-xs active:scale-95 cursor-pointer"
          >
            Open Tools Dashboard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredProjects.map((p) => {
            const dateStr = new Date(p.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <div
                key={p.id}
                className="bg-white/80 border border-[#171717]/12 rounded-xl p-4 sm:p-5 shadow-xs hover:border-[#FF6B35]/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-[#171717]/60 mb-2">
                    <div className="flex items-center gap-1.5 font-medium capitalize text-[#171717]">
                      {getToolIcon(p.tool)}
                      <span className="font-semibold">{p.tool}</span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-[11px]">
                      <Clock className="w-3 h-3 text-[#171717]/40" />
                      <span>{dateStr}</span>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-[#171717] line-clamp-1">
                    {p.title}
                  </h3>

                  <p className="text-xs text-[#171717]/65 mt-1 font-mono">
                    {p.configSummary}
                  </p>

                  <div className="mt-3 p-2.5 bg-[#171717]/5 rounded-lg text-[11px] font-mono text-[#171717]/70 flex items-center justify-between">
                    <span>{p.originalWidth} × {p.originalHeight} px</span>
                    <span>{formatBytes(p.originalSizeBytes)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#171717]/10 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleDelete(p.id, e)}
                    className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer active:scale-95"
                    title="Delete project"
                    aria-label="Delete project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpen(p)}
                    className="px-3.5 py-2 min-h-[40px] text-xs font-semibold text-[#171717] bg-[#171717]/5 hover:bg-[#171717]/10 border border-[#171717]/15 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <span>Launch {p.tool.charAt(0).toUpperCase() + p.tool.slice(1)}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#FF6B35]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
