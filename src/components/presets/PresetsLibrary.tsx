import React, { useState, useMemo } from 'react';
import { SOCIAL_PRESETS, PLATFORM_CATEGORIES } from '../../config/presets';
import { SocialPreset, SocialPlatformId, ToolType } from '../../types';
import {
  Search,
  Grid,
  Layers,
  Crop,
  Sliders,
  ExternalLink,
  Plus,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface PresetsLibraryProps {
  onSelectPreset: (preset: SocialPreset, tool: ToolType) => void;
}

export const PresetsLibrary: React.FC<PresetsLibraryProps> = ({ onSelectPreset }) => {
  const [selectedPlatform, setSelectedPlatform] = useState<SocialPlatformId | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [useCaseFilter, setUseCaseFilter] = useState<'all' | 'grid' | 'carousel' | 'single' | 'banner'>('all');

  // Custom preset creator state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customPreset, setCustomPreset] = useState({
    name: '',
    platform: 'Custom Network',
    width: 1200,
    height: 800,
    desc: '',
    tool: 'cropper' as ToolType,
  });

  const filteredPresets = useMemo(() => {
    return SOCIAL_PRESETS.filter((p) => {
      // Platform filter
      if (selectedPlatform !== 'all' && p.platform !== selectedPlatform) {
        return false;
      }
      // Use case filter
      if (useCaseFilter !== 'all' && p.useCase !== useCaseFilter) {
        return false;
      }
      // Text search
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchTitle = p.formatName.toLowerCase().includes(query);
        const matchPlatform = p.platformName.toLowerCase().includes(query);
        const matchDesc = p.description.toLowerCase().includes(query);
        const matchDims = `${p.width}x${p.height}`.includes(query);
        return matchTitle || matchPlatform || matchDesc || matchDims;
      }
      return true;
    });
  }, [selectedPlatform, useCaseFilter, searchQuery]);

  const handleLaunchCustom = () => {
    if (!customPreset.name || customPreset.width <= 0 || customPreset.height <= 0) return;
    const constructed: SocialPreset = {
      id: `custom-${Date.now()}`,
      platform: 'custom',
      platformName: customPreset.platform,
      formatName: customPreset.name,
      description: customPreset.desc || 'Custom user dimension specification.',
      width: customPreset.width,
      height: customPreset.height,
      aspectRatioLabel: `${(customPreset.width / customPreset.height).toFixed(2)}:1`,
      aspectRatioValue: customPreset.width / customPreset.height,
      supportedFormats: ['JPEG', 'PNG', 'WebP'],
      lastVerified: 'User Configured',
      useCase: 'single',
      recommendedTool: customPreset.tool,
    };
    onSelectPreset(constructed, customPreset.tool);
    setShowCustomModal(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#171717]/10 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#171717]">
            Verified Platform Presets
          </h1>
          <p className="mt-1 text-sm text-[#171717]/70">
            Current specifications, pixel dimensions, file size limits, and safe-zones across major digital networks.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCustomModal(true)}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-md transition-colors shadow-xs flex items-center gap-1.5 self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5 text-[#FF6B35]" />
          <span>New Custom Dimension</span>
        </button>
      </div>

      {/* FILTER AND SEARCH CONTROLS */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between mb-8">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#171717]/40 pointer-events-none" />
          <input
            type="text"
            placeholder="Search platform, format or dimension (e.g. 1080x1350)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#171717]/20 rounded-lg focus:border-[#FF6B35] focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#171717]/40 hover:text-[#171717]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Use-Case Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-white border border-[#171717]/15 rounded-xl overflow-x-auto text-xs shadow-2xs">
          {[
            { id: 'all', label: 'All Formats' },
            { id: 'single', label: 'Single Post' },
            { id: 'grid', label: 'Profile Grid' },
            { id: 'carousel', label: 'Swipe Carousel' },
            { id: 'banner', label: 'Cover Banner' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setUseCaseFilter(tab.id as any)}
              className={`px-3.5 py-2 min-h-[38px] rounded-lg transition-colors whitespace-nowrap cursor-pointer active:scale-95 ${
                useCaseFilter === tab.id
                  ? 'bg-[#171717] text-white font-semibold shadow-xs'
                  : 'text-[#171717]/70 hover:text-[#171717]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* PLATFORM PILL BAR */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-thin">
        {PLATFORM_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedPlatform(cat.id)}
            className={`px-3.5 py-2 min-h-[38px] text-xs rounded-xl transition-colors whitespace-nowrap cursor-pointer active:scale-95 ${
              selectedPlatform === cat.id
                ? 'bg-[#171717] text-[#F7F5F0] font-semibold shadow-xs'
                : 'bg-white border border-[#171717]/15 text-[#171717]/75 hover:border-[#171717]/40'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* PRESETS GRID */}
      {filteredPresets.length === 0 ? (
        <div className="text-center py-16 bg-white/40 border border-[#171717]/10 rounded-xl">
          <p className="text-sm font-semibold text-[#171717]">No matching presets found</p>
          <p className="text-xs text-[#171717]/60 mt-1">Try modifying your search or platform filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPresets.map((preset) => (
            <div
              key={preset.id}
              className="bg-white/80 border border-[#171717]/12 rounded-xl p-5 shadow-xs hover:border-[#FF6B35]/50 transition-colors flex flex-col justify-between"
            >
              <div>
                {/* Card Header: Platform & Verification */}
                <div className="flex items-center justify-between text-xs text-[#171717]/60 mb-2">
                  <span className="font-semibold text-[#FF6B35] tracking-wide">
                    {preset.platformName}
                  </span>
                  <div className="flex items-center gap-1 font-mono text-[11px] text-[#171717]/60">
                    <Calendar className="w-3 h-3 text-[#171717]/40" />
                    <span>{preset.lastVerified}</span>
                  </div>
                </div>

                {/* Format Name */}
                <h3 className="text-base font-bold text-[#171717]">
                  {preset.formatName}
                </h3>

                {/* Description */}
                <p className="text-xs text-[#171717]/70 mt-1 leading-relaxed">
                  {preset.description}
                </p>

                {/* Technical Metric Strip (DM Mono) */}
                <div className="mt-4 p-3 bg-[#171717]/5 rounded-lg grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-[#171717]/60 block uppercase">Recommended Dims</span>
                    <span className="font-bold text-[#171717]">{preset.width} × {preset.height} px</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#171717]/60 block uppercase">Aspect Ratio</span>
                    <span className="font-bold text-[#171717]">{preset.aspectRatioLabel}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#171717]/60 block uppercase">Formats</span>
                    <span>{preset.supportedFormats.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#171717]/60 block uppercase">Max File Size</span>
                    <span>{preset.maxFileSizeMB ? `${preset.maxFileSizeMB} MB` : 'Standard'}</span>
                  </div>
                </div>

                {/* Platform Specific Warning or Recommendation Note */}
                {preset.notes && (
                  <div className="mt-3 text-[11px] text-[#171717]/65 bg-amber-500/5 border border-amber-500/20 rounded p-2">
                    <span className="font-medium text-[#171717]">Spec note:</span> {preset.notes}
                  </div>
                )}
              </div>

              {/* Action Buttons to open directly in the corresponding tool */}
              <div className="mt-5 pt-4 border-t border-[#171717]/10 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#171717]/50">
                  Tool: <strong className="capitalize text-[#171717]">{preset.recommendedTool}</strong>
                </span>

                <button
                  type="button"
                  onClick={() => onSelectPreset(preset, preset.recommendedTool)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-xs"
                >
                  <span>Open in {preset.recommendedTool.charAt(0).toUpperCase() + preset.recommendedTool.slice(1)}</span>
                  <ExternalLink className="w-3 h-3 text-[#FF6B35]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CUSTOM DIMENSION MODAL */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/60 p-4">
          <div className="bg-[#F7F5F0] border border-[#171717]/20 rounded-xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#171717]/10">
              <span className="font-bold text-base text-[#171717]">Create Custom Dimension</span>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="text-xs font-bold text-[#171717]/60 hover:text-[#171717]"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Preset Label</label>
                <input
                  type="text"
                  placeholder="e.g. Substack Header, Blog Banner"
                  value={customPreset.name}
                  onChange={(e) => setCustomPreset({ ...customPreset, name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-[#171717]/20 rounded focus:border-[#FF6B35] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Width (px)</label>
                  <input
                    type="number"
                    min={1}
                    max={16384}
                    value={customPreset.width}
                    onChange={(e) =>
                      setCustomPreset({
                        ...customPreset,
                        width: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-[#171717]/20 rounded font-mono focus:border-[#FF6B35] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Height (px)</label>
                  <input
                    type="number"
                    min={1}
                    max={16384}
                    value={customPreset.height}
                    onChange={(e) =>
                      setCustomPreset({
                        ...customPreset,
                        height: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-[#171717]/20 rounded font-mono focus:border-[#FF6B35] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Launch in Workspace</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cropper', 'resizer', 'splitter'] as ToolType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCustomPreset({ ...customPreset, tool: t })}
                      className={`py-1.5 rounded border text-center capitalize ${
                        customPreset.tool === t
                          ? 'bg-[#171717] text-white border-[#171717] font-semibold'
                          : 'bg-white border-[#171717]/20 text-[#171717]/70'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#171717]/10">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2 min-h-[42px] text-xs font-medium text-[#171717]/70 hover:text-[#171717] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLaunchCustom}
                disabled={!customPreset.name}
                className="px-5 py-2 min-h-[42px] text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-lg disabled:opacity-50 shadow-xs cursor-pointer active:scale-95"
              >
                Save &amp; Open
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
