import React, { useState, useEffect } from 'react';
import {
  ImageFileState,
  ResizeConfig,
  ImageFormat,
} from '../../types';
import { ImageDropzone } from '../common/ImageDropzone';
import {
  loadImageElement,
  resizeImage,
  ResizeResult,
  triggerDownload,
  formatBytes,
} from '../../utils/imageEngine';
import { StorageService } from '../../services/storageService';
import {
  Lock,
  Unlock,
  Sliders,
  Download,
  RotateCcw,
  Check,
  BookmarkPlus,
  Maximize2,
  AlertCircle,
} from 'lucide-react';
import { ProjectWorkspaceBar } from '../common/ProjectWorkspaceBar';
import { ProjectPersistenceService } from '../../services/projectPersistenceService';
import { useAuth } from '../../context/AuthContext';
import { FullWorkspaceProject } from '../../types';

interface ResizerWorkspaceProps {
  initialImage?: ImageFileState | null;
  initialDimensions?: { width: number; height: number };
  initialProjectId?: string;
  onClearLaunch?: () => void;
}

export const ResizerWorkspace: React.FC<ResizerWorkspaceProps> = ({
  initialImage = null,
  initialDimensions,
  initialProjectId,
  onClearLaunch,
}) => {
  const { user } = useAuth();
  const userId = user?.id || 'guest';

  const [currentProject, setCurrentProject] = useState<FullWorkspaceProject | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number>(Date.now());
  const [isLoadingProject, setIsLoadingProject] = useState(true);

  const [imageState, setImageState] = useState<ImageFileState | null>(initialImage);
  const [loadedImgElement, setLoadedImgElement] = useState<HTMLImageElement | null>(null);

  const [config, setConfig] = useState<ResizeConfig>({
    width: initialDimensions?.width || 1080,
    height: initialDimensions?.height || 1080,
    lockAspectRatio: true,
    originalAspectRatio: 1.0,
    format: 'image/jpeg',
    quality: 90,
    fileName: 'resized-image',
  });

  const [result, setResult] = useState<ResizeResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dimensionWarning, setDimensionWarning] = useState<string | null>(null);

  const applyLoadedProject = (proj: FullWorkspaceProject) => {
    setCurrentProject(proj);
    if (proj.config && Object.keys(proj.config).length > 0) {
      setConfig((prev) => ({ ...prev, ...proj.config }));
    }
    if (proj.originalDataUrl) {
      setImageState({
        file: new File([], proj.originalFileName || 'image.jpg', {
          type: proj.originalMimeType || 'image/jpeg',
        }),
        dataUrl: proj.originalDataUrl,
        name: proj.originalFileName || 'Saved Image',
        size: proj.originalSizeBytes || 0,
        width: proj.originalWidth || 0,
        height: proj.originalHeight || 0,
        type: proj.originalMimeType || 'image/jpeg',
      });
    }
    setLastSavedAt(proj.updatedAt || proj.createdAt || Date.now());
    setSaveStatus('saved');
  };

  // Restore workspace project on mount or user/project change
  useEffect(() => {
    let isCancelled = false;

    const restoreWorkspace = async () => {
      setIsLoadingProject(true);
      try {
        if (initialProjectId) {
          const loaded = await ProjectPersistenceService.loadProject(initialProjectId, userId);
          if (loaded && !isCancelled) {
            await ProjectPersistenceService.setActiveProject(userId, 'resizer', loaded.id);
            applyLoadedProject(loaded);
            setIsLoadingProject(false);
            return;
          }
        }

        if (initialImage) {
          const proj = ProjectPersistenceService.createNewProject(
            userId,
            'resizer',
            `Resize: ${initialImage.name}`
          );
          proj.originalDataUrl = initialImage.dataUrl;
          proj.originalFileName = initialImage.name;
          proj.originalSizeBytes = initialImage.size;
          proj.originalWidth = initialImage.width;
          proj.originalHeight = initialImage.height;
          proj.originalMimeType = initialImage.type;
          proj.config = config;
          proj.thumbnailUrl = initialImage.dataUrl;
          proj.status = 'draft';

          if (!isCancelled) {
            setCurrentProject(proj);
            setImageState(initialImage);
            ProjectPersistenceService.saveProject(proj, true)
              .then((s) => {
                if (!isCancelled) {
                  setCurrentProject(s);
                  setSaveStatus('saved');
                  setLastSavedAt(Date.now());
                  onClearLaunch?.();
                }
              })
              .catch(() => {});
          }
        } else {
          const active = await ProjectPersistenceService.getActiveProject(userId, 'resizer');
          if (active && active.status !== 'completed' && active.originalDataUrl && !isCancelled) {
            applyLoadedProject(active);
          } else if (!isCancelled) {
            setCurrentProject(null);
            setImageState(null);
          }
        }
      } catch (err) {
        console.error('Failed to restore resizer project:', err);
      } finally {
        if (!isCancelled) setIsLoadingProject(false);
      }
    };

    restoreWorkspace();
    return () => {
      isCancelled = true;
    };
  }, [userId, initialProjectId]);

  // Handle external launch with initialImage after mount
  useEffect(() => {
    if (initialImage && initialImage !== imageState) {
      handleImageLoaded(initialImage);
      onClearLaunch?.();
    }
  }, [initialImage]);

  // Handle external project selection after mount
  useEffect(() => {
    if (initialProjectId && initialProjectId !== currentProject?.id) {
      handleSelectProject(initialProjectId);
    }
  }, [initialProjectId]);

  useEffect(() => {
    if (imageState) {
      loadImageElement(imageState.dataUrl)
        .then((img) => {
          setLoadedImgElement(img);
          const aspect = img.naturalWidth / img.naturalHeight;
          const targetW = initialDimensions?.width || img.naturalWidth;
          const targetH = initialDimensions?.height || (config.lockAspectRatio ? Math.round(targetW / aspect) : img.naturalHeight);

          setConfig((prev) => ({
            ...prev,
            width: targetW,
            height: targetH,
            originalAspectRatio: aspect,
            fileName: imageState.name.replace(/\.[^/.]+$/, '') + '-resized',
          }));
        })
        .catch((e) => console.error('Failed to load image element', e));
    } else {
      setLoadedImgElement(null);
      setResult(null);
    }
  }, [imageState]);

  // Execute resizing
  useEffect(() => {
    if (!loadedImgElement) return;

    if (config.width > 8192 || config.height > 8192) {
      setDimensionWarning('Caution: Dimensions exceed 8192px. Large canvas sizes may cause memory strain on mobile devices.');
    } else {
      setDimensionWarning(null);
    }

    let isMounted = true;
    setIsProcessing(true);

    const debounceTimer = setTimeout(() => {
      resizeImage(loadedImgElement, config)
        .then((res) => {
          if (isMounted) {
            setResult(res);
            setIsProcessing(false);
          }
        })
        .catch((e) => {
          console.error('Resize failed', e);
          if (isMounted) setIsProcessing(false);
        });
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(debounceTimer);
    };
  }, [loadedImgElement, config.width, config.height, config.format, config.quality]);

  // Debounced auto-save
  useEffect(() => {
    if (!currentProject || !imageState) return;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const configSummary = result
          ? `${imageState.width}×${imageState.height} → ${result.width}×${result.height} px (${config.format.split('/')[1]?.toUpperCase()})`
          : `${config.width}×${config.height} px`;

        const updated: FullWorkspaceProject = {
          ...currentProject,
          config,
          configSummary,
          status: 'draft',
          exportCount: 1,
          originalFileName: imageState.name,
          originalWidth: imageState.width,
          originalHeight: imageState.height,
          originalSizeBytes: imageState.size,
          originalMimeType: imageState.type,
          originalDataUrl: imageState.dataUrl,
          thumbnailUrl: result?.dataUrl || imageState.dataUrl,
        };

        const saved = await ProjectPersistenceService.saveProject(updated, false);
        setCurrentProject(saved);
        setSaveStatus('saved');
        setLastSavedAt(Date.now());
      } catch (e) {
        console.warn('Auto-save encountered issue:', e);
        setSaveStatus('error');
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [config, result, imageState]);

  const handleImageLoaded = (newImg: ImageFileState) => {
    const proj =
      currentProject && !currentProject.originalFileName
        ? { ...currentProject, title: `Resize: ${newImg.name}` }
        : ProjectPersistenceService.createNewProject(userId, 'resizer', `Resize: ${newImg.name}`);

    proj.originalDataUrl = newImg.dataUrl;
    proj.originalFileName = newImg.name;
    proj.originalSizeBytes = newImg.size;
    proj.originalWidth = newImg.width;
    proj.originalHeight = newImg.height;
    proj.originalMimeType = newImg.type;
    proj.config = config;
    proj.thumbnailUrl = newImg.dataUrl;
    proj.status = 'draft';

    setCurrentProject(proj);
    setImageState(newImg);
    setSaveStatus('saving');

    ProjectPersistenceService.saveProject(proj, true)
      .then((saved) => {
        setCurrentProject(saved);
        setSaveStatus('saved');
        setLastSavedAt(Date.now());
      })
      .catch(() => setSaveStatus('error'));
  };

  const handleRenameTitle = async (newTitle: string) => {
    if (!currentProject) return;
    const updated: FullWorkspaceProject = { ...currentProject, title: newTitle };
    setCurrentProject(updated);
    setSaveStatus('saving');
    try {
      await ProjectPersistenceService.saveProject(updated, false);
      setSaveStatus('saved');
      setLastSavedAt(Date.now());
    } catch {
      setSaveStatus('error');
    }
  };

  const handleSelectProject = async (projectId: string) => {
    setIsLoadingProject(true);
    try {
      const proj = await ProjectPersistenceService.loadProject(projectId, userId);
      if (proj) {
        await ProjectPersistenceService.setActiveProject(userId, 'resizer', proj.id);
        applyLoadedProject(proj);
      }
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleClearProject = async () => {
    await ProjectPersistenceService.setActiveProject(userId, 'resizer', null);
    setImageState(null);
    setLoadedImgElement(null);
    setResult(null);
    setCurrentProject(null);
    setSaveStatus('idle');
  };

  const handleNewProject = async () => {
    handleClearProject();
  };

  const handleReset = () => {
    handleClearProject();
  };

  const handleWidthChange = (val: number) => {
    const newW = Math.max(1, Math.min(16384, val));
    if (config.lockAspectRatio && config.originalAspectRatio > 0) {
      const newH = Math.max(1, Math.round(newW / config.originalAspectRatio));
      setConfig({ ...config, width: newW, height: newH });
    } else {
      setConfig({ ...config, width: newW });
    }
  };

  const handleHeightChange = (val: number) => {
    const newH = Math.max(1, Math.min(16384, val));
    if (config.lockAspectRatio && config.originalAspectRatio > 0) {
      const newW = Math.max(1, Math.round(newH * config.originalAspectRatio));
      setConfig({ ...config, width: newW, height: newH });
    } else {
      setConfig({ ...config, height: newH });
    }
  };

  const handleScalePercent = (percent: number) => {
    if (!loadedImgElement) return;
    const factor = percent / 100;
    const newW = Math.round(loadedImgElement.naturalWidth * factor);
    const newH = Math.round(loadedImgElement.naturalHeight * factor);
    setConfig({ ...config, width: newW, height: newH });
  };

  const handleDownload = async () => {
    if (!result || !imageState) return;
    const ext = config.format.split('/')[1] === 'jpeg' ? 'jpg' : config.format.split('/')[1];
    triggerDownload(result.blob, `${config.fileName || 'pixora-resized'}.${ext}`);

    // Mark project completed and clear from active workspace
    if (currentProject) {
      const completedProj: FullWorkspaceProject = {
        ...currentProject,
        status: 'completed',
        exportCount: 1,
        updatedAt: Date.now(),
      };
      await ProjectPersistenceService.saveProject(completedProj, false);
    }
    await ProjectPersistenceService.setActiveProject(userId, 'resizer', null);

    // Reset workspace to empty upload state
    setImageState(null);
    setLoadedImgElement(null);
    setResult(null);
    setCurrentProject(null);
    setSaveStatus('idle');
  };

  const commonPresets = [
    { label: '1080 × 1080 (Square)', w: 1080, h: 1080 },
    { label: '1920 × 1080 (1080p FHD)', w: 1920, h: 1080 },
    { label: '1200 × 630 (Social Share)', w: 1200, h: 630 },
    { label: '1080 × 1350 (4:5 Portrait)', w: 1080, h: 1350 },
    { label: '1080 × 1920 (9:16 Story)', w: 1080, h: 1920 },
    { label: '3840 × 2160 (4K UHD)', w: 3840, h: 2160 },
  ];

  if (isLoadingProject) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <span className="w-8 h-8 border-3 border-[#FF6B35] border-t-transparent rounded-full animate-spin inline-block mb-3" />
        <p className="text-sm font-semibold text-[#171717]">Restoring Resizer Workspace State...</p>
        <p className="text-xs text-[#171717]/60 mt-1">Retrieving persistent project files and configurations</p>
      </div>
    );
  }

  if (!imageState) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <ProjectWorkspaceBar
          tool="resizer"
          currentProjectId={currentProject?.id}
          currentTitle={currentProject?.title || 'Untitled Resize Project'}
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          onRenameTitle={handleRenameTitle}
          onSelectProject={handleSelectProject}
          onNewProject={handleNewProject}
          onClearProject={handleClearProject}
          hasActiveProject={false}
        />

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Image Resizer</h1>
          <p className="mt-1 text-sm text-[#171717]/70">
            Resample pixel dimensions with aspect ratio lock, resolution presets, and high-fidelity interpolation.
          </p>
        </div>

        <ImageDropzone
          onImageLoaded={handleImageLoaded}
          title="Upload image to resize"
          subtitle="Pixel-exact scaling with bicubic interpolation. Supports JPEG, PNG, and WebP."
        />

        <div className="mt-8 border-t border-[#171717]/10 pt-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#171717]/60 mb-3 text-center">
            Standard Output Resolution Presets
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {commonPresets.map((p, idx) => (
              <div
                key={idx}
                className="p-3 bg-white/60 border border-[#171717]/10 rounded-lg text-left"
              >
                <div className="font-semibold text-xs text-[#171717]">{p.label}</div>
                <div className="text-[11px] text-[#171717]/60 font-mono mt-0.5">
                  {p.w} × {p.h} px
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Persistent Project Workspace Bar */}
      <ProjectWorkspaceBar
        tool="resizer"
        currentProjectId={currentProject?.id}
        currentTitle={currentProject?.title || imageState.name}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        onRenameTitle={handleRenameTitle}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onClearProject={handleClearProject}
        hasActiveProject={true}
      />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#171717]/10 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#171717]/60">
            <span>Tools</span>
            <span>/</span>
            <span className="text-[#171717] font-medium">Image Resizer</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#171717] mt-0.5">
            {imageState.name}
          </h1>
          <div className="flex items-center gap-2 text-xs text-[#171717]/70 mt-1 font-mono">
            <span>Source: {imageState.width} × {imageState.height} px</span>
            <span>→</span>
            <span className="font-semibold text-[#FF6B35]">
              Target: {config.width} × {config.height} px
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownload}
            disabled={!result || isProcessing}
            className="px-4 py-2 min-h-[42px] text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download ({result ? formatBytes(result.sizeBytes) : '...'})</span>
          </button>

          <button
            onClick={handleReset}
            className="p-2 min-h-[42px] min-w-[42px] flex items-center justify-center text-[#171717]/70 hover:text-[#171717] hover:bg-[#171717]/10 rounded-lg transition-colors cursor-pointer active:scale-95"
            title="Start new image"
            aria-label="Reset workspace"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* LEFT COLUMN: PREVIEW */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-white/80 border border-[#171717]/10 rounded-xl p-3.5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#171717]/10 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#171717]">
                Live Resized View
              </span>
              <span className="text-xs text-[#171717]/60 font-mono">
                {result ? `${result.width} × ${result.height} px` : 'Rendering...'}
              </span>
            </div>

            <div className="relative min-h-[280px] xs:min-h-[340px] sm:min-h-[400px] max-h-[560px] bg-[#171717]/5 rounded-xl border border-[#171717]/10 overflow-hidden flex items-center justify-center p-3">
              {isProcessing && (
                <div className="absolute inset-0 z-30 bg-white/70 backdrop-blur-xs flex flex-col items-center justify-center text-xs font-mono text-[#171717] gap-2 p-4 text-center">
                  <span className="w-6 h-6 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
                  <span>Resampling canvas pixels...</span>
                </div>
              )}

              {result ? (
                <img
                  src={result.dataUrl}
                  alt="Resized output"
                  className="max-w-full max-h-[440px] object-contain shadow-xs rounded"
                />
              ) : (
                <img
                  src={imageState.dataUrl}
                  alt="Original"
                  className="max-w-full max-h-[440px] object-contain opacity-50"
                />
              )}
            </div>

            {/* Output Meta Bar */}
            {result && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 bg-[#171717]/5 p-3 rounded-xl text-xs font-mono">
                <div>
                  <span className="text-[#171717]/60 block text-[10px] uppercase">Original Dims</span>
                  <span className="font-semibold">{result.originalWidth} × {result.originalHeight}</span>
                </div>
                <div>
                  <span className="text-[#171717]/60 block text-[10px] uppercase">Output Dims</span>
                  <span className="font-semibold text-[#FF6B35]">{result.width} × {result.height}</span>
                </div>
                <div>
                  <span className="text-[#171717]/60 block text-[10px] uppercase">Aspect Ratio</span>
                  <span className="font-semibold">{(result.width / result.height).toFixed(2)}:1</span>
                </div>
                <div>
                  <span className="text-[#171717]/60 block text-[10px] uppercase">Export Size</span>
                  <span className="font-semibold">{formatBytes(result.sizeBytes)}</span>
                </div>
              </div>
            )}
          </div>

          {dimensionWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{dimensionWarning}</span>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: CONTROLS */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="bg-white/90 border border-[#171717]/10 rounded-xl p-5 shadow-xs flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#171717]/10">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171717]">
                Dimension Inputs
              </span>
              <Sliders className="w-4 h-4 text-[#171717]/50" />
            </div>

            {/* Width, Height, and Lock Toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#171717]">Aspect Ratio</span>
                <button
                  type="button"
                  onClick={() =>
                    setConfig({
                      ...config,
                      lockAspectRatio: !config.lockAspectRatio,
                    })
                  }
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 min-h-[38px] rounded-lg border transition-colors cursor-pointer active:scale-95 ${
                    config.lockAspectRatio
                      ? 'bg-[#171717] text-white border-[#171717] font-medium'
                      : 'bg-white text-[#171717]/70 border-[#171717]/20 hover:text-[#171717]'
                  }`}
                >
                  {config.lockAspectRatio ? (
                    <>
                      <Lock className="w-3 h-3 text-[#FF6B35]" />
                      <span>Locked ({(config.originalAspectRatio).toFixed(2)}:1)</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3" />
                      <span>Unlocked (Free)</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171717] mb-1">
                    Width (px)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={16384}
                    value={config.width}
                    onChange={(e) => handleWidthChange(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#171717]/20 rounded-md font-mono focus:border-[#FF6B35] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#171717] mb-1">
                    Height (px)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={16384}
                    value={config.height}
                    onChange={(e) => handleHeightChange(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#171717]/20 rounded-md font-mono focus:border-[#FF6B35] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Quick Percentage Rescaling */}
            <div>
              <label className="block text-xs font-semibold text-[#171717] mb-2">
                Scale Percentage
              </label>
              <div className="grid grid-cols-5 gap-1.5 font-mono text-xs">
                {[25, 50, 75, 150, 200].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleScalePercent(pct)}
                    className="py-2 min-h-[38px] flex items-center justify-center bg-white border border-[#171717]/15 rounded-lg hover:bg-[#171717]/5 transition text-[#171717] font-semibold active:scale-95 cursor-pointer"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Preset Dimensions */}
            <div>
              <label className="block text-xs font-semibold text-[#171717] mb-2">
                Standard Dimension Presets
              </label>
              <div className="flex flex-col gap-1.5">
                {commonPresets.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      setConfig({
                        ...config,
                        width: p.w,
                        height: p.h,
                        lockAspectRatio: false, // User requested explicit custom dims
                      })
                    }
                    className={`text-xs py-1.5 px-2.5 rounded-md border text-left flex items-center justify-between transition-colors ${
                      config.width === p.w && config.height === p.h
                        ? 'bg-[#171717] text-white border-[#171717] font-semibold'
                        : 'bg-white border-[#171717]/15 text-[#171717]/80 hover:border-[#171717]/40'
                    }`}
                  >
                    <span>{p.label}</span>
                    <span className="font-mono text-[11px] opacity-75">
                      {p.w} × {p.h}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Export Format & Quality */}
            <div className="pt-2 border-t border-[#171717]/10 flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#171717] mb-1">
                  Export Format
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#171717]/5 rounded-lg text-xs font-mono">
                  {(['image/jpeg', 'image/png', 'image/webp'] as ImageFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setConfig({ ...config, format: fmt })}
                      className={`py-1 rounded text-center transition-colors ${
                        config.format === fmt
                          ? 'bg-white text-[#171717] font-semibold shadow-xs'
                          : 'text-[#171717]/60 hover:text-[#171717]'
                      }`}
                    >
                      {fmt.split('/')[1].toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {config.format !== 'image/png' && (
                <div>
                  <div className="flex justify-between text-xs font-semibold text-[#171717] mb-1">
                    <span>Quality</span>
                    <span className="font-mono">{config.quality}%</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    value={config.quality}
                    onChange={(e) =>
                      setConfig({ ...config, quality: parseInt(e.target.value) })
                    }
                    className="w-full accent-[#FF6B35]"
                  />
                </div>
              )}
            </div>

            {/* Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!result || isProcessing}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-[#FF6B35]" />
                <span>
                  Download Resized Image ({result ? formatBytes(result.sizeBytes) : '...'})
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
