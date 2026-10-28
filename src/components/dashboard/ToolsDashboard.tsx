import React, { useState, useEffect } from 'react';
import { ImageFileState, ToolType, SavedProject } from '../../types';
import { ProjectPersistenceService } from '../../services/projectPersistenceService';
import { useAuth } from '../../context/AuthContext';
import { formatBytes } from '../../utils/imageEngine';
import {
  Grid,
  Sliders,
  Layers,
  Crop,
  ExternalLink,
  FolderOpen,
} from 'lucide-react';

interface ToolsDashboardProps {
  onSelectTool: (tool: ToolType, image?: ImageFileState) => void;
  onNavigate: (tab: string) => void;
  onOpenProject?: (project: SavedProject) => void;
}

export const ToolsDashboard: React.FC<ToolsDashboardProps> = ({ onSelectTool, onNavigate, onOpenProject }) => {
  const { user } = useAuth();
  const userId = user?.id || 'guest';
  const [recentProjects, setRecentProjects] = useState<SavedProject[]>([]);
  const [totalProjectCount, setTotalProjectCount] = useState(0);

  useEffect(() => {
    ProjectPersistenceService.listProjects(userId).then((list) => {
      setRecentProjects(list.slice(0, 3));
      setTotalProjectCount(list.length);
    });
  }, [userId]);

  const handleResumeProject = async (p: SavedProject) => {
    if (onOpenProject) {
      onOpenProject(p);
    } else {
      await ProjectPersistenceService.setActiveProject(userId, p.tool, p.id);
      onNavigate(p.tool);
    }
  };
  const tools = [
    {
      id: 'splitter' as ToolType,
      title: 'Image Splitter & Grid Exporter',
      desc: 'Divide photos into 3×3 profile grids or contiguous seamless carousels. Multi-tile individual download and single ZIP archive export.',
      icon: <Grid className="w-5 h-5 text-[#FF6B35]" />,
      actionLabel: 'Launch Splitter',
    },
    {
      id: 'compressor' as ToolType,
      title: 'Target KB/MB Compressor',
      desc: 'Dial in strict file size limits (such as YouTube 2MB or fast-web 200KB). Real measured byte convergence with split slider comparison.',
      icon: <Sliders className="w-5 h-5 text-[#FF6B35]" />,
      actionLabel: 'Launch Compressor',
    },
    {
      id: 'resizer' as ToolType,
      title: 'Pixel Dimension Resizer',
      desc: 'Resample pixel width & height with aspect ratio lock, resolution presets (FHD, 4K, Social), and high-fidelity bicubic interpolation.',
      icon: <Layers className="w-5 h-5 text-[#FF6B35]" />,
      actionLabel: 'Launch Resizer',
    },
    {
      id: 'cropper' as ToolType,
      title: 'Interactive Precision Cropper',
      desc: 'Interactive draggable crop viewport with standard aspect ratio presets (1:1, 4:5, 16:9, 9:16), 90° rotation, and flip controls.',
      icon: <Crop className="w-5 h-5 text-[#FF6B35]" />,
      actionLabel: 'Launch Cropper',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Dashboard Top Header */}
      <div className="pb-6 border-b border-[#171717]/10 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#171717]">
            Image Utility Suite
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#171717]/70">
            Select a specialized processing engine or drag an image below to start preparing your media.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => onNavigate('presets')}
            className="px-3.5 py-2 min-h-[40px] text-xs font-semibold text-[#171717] bg-white border border-[#171717]/20 hover:bg-[#171717]/5 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
          >
            <span>Preset Library</span>
            <ExternalLink className="w-3.5 h-3.5 text-[#FF6B35]" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="px-3.5 py-2 min-h-[40px] text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-lg transition-colors shadow-2xs active:scale-95 cursor-pointer"
          >
            Saved Projects
          </button>
        </div>
      </div>

      {/* RECENT PROJECTS IN APP STUDIO */}
      {recentProjects.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#171717]/60 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-[#FF6B35]" />
              <span>Recent Studio Projects</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="min-h-[36px] px-2 flex items-center text-xs text-[#FF6B35] font-semibold hover:underline cursor-pointer"
            >
              View all ({totalProjectCount}) →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentProjects.map((p) => (
              <div
                key={p.id}
                onClick={() => handleResumeProject(p)}
                className="bg-white/80 border border-[#171717]/10 hover:border-[#FF6B35]/50 rounded-xl p-4 shadow-2xs cursor-pointer transition-all flex flex-col justify-between active:scale-98"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] text-[#171717]/60 mb-1.5 font-mono">
                    <span className="capitalize font-semibold text-[#FF6B35] bg-[#FF6B35]/10 px-1.5 py-0.5 rounded text-[10px]">{p.tool}</span>
                    <span>{formatBytes(p.originalSizeBytes, 1)}</span>
                  </div>
                  <h4 className="text-xs font-bold text-[#171717] line-clamp-1">{p.title}</h4>
                  <p className="text-[11px] text-[#171717]/60 mt-0.5 line-clamp-1 font-mono">{p.configSummary}</p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-[#171717]/10 flex items-center justify-between text-[11px] text-[#171717]/70">
                  <span className="font-mono">{p.originalWidth}×{p.originalHeight}</span>
                  <span className="font-semibold text-[#171717] hover:text-[#FF6B35]">Resume →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 CORE TOOLS GRID */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#171717]/60 mb-4">
          Core Processing Tools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {tools.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelectTool(t.id)}
              className="bg-white/80 border border-[#171717]/12 rounded-xl p-6 shadow-xs hover:border-[#FF6B35]/50 transition-all flex flex-col justify-between group cursor-pointer"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-[#171717]/5 flex items-center justify-center group-hover:bg-[#FF6B35]/10 transition-colors mb-3">
                  {t.icon}
                </div>
                <h3 className="text-base font-bold text-[#171717] group-hover:text-[#FF6B35] transition-colors">
                  {t.title}
                </h3>
                <p className="mt-1.5 text-xs text-[#171717]/70 leading-relaxed">
                  {t.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
