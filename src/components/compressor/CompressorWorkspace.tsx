import React, { useState, useEffect } from 'react';
import {
  ImageFileState,
  CompressionConfig,
  CompressionResult,
  ImageFormat,
} from '../../types';
import { ImageDropzone } from '../common/ImageDropzone';
import {
  loadImageElement,
  compressImage,
  triggerDownload,
  formatBytes,
} from '../../utils/imageEngine';
import { StorageService } from '../../services/storageService';
import {
  Sliders,
  Download,
  RotateCcw,
  AlertTriangle,
  Check,
  BookmarkPlus,
  Eye,
  ArrowRight,
  Split,
  FileCheck,
} from 'lucide-react';
import { ProjectWorkspaceBar } from '../common/ProjectWorkspaceBar';
import { ProjectPersistenceService } from '../../services/projectPersistenceService';
import { useAuth } from '../../context/AuthContext';
import { FullWorkspaceProject } from '../../types';

interface CompressorWorkspaceProps {
  initialImage?: ImageFileState | null;
  initialTargetKB?: number;
  initialProjectId?: string;
  onClearLaunch?: () => void;
}

export const CompressorWorkspace: React.FC<CompressorWorkspaceProps> = ({
  initialImage = null,
  initialTargetKB,
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

  const [config, setConfig] = useState<CompressionConfig>({
    mode: initialTargetKB ? 'target' : 'target',
    targetUnit: initialTargetKB && initialTargetKB >= 1024 ? 'MB' : 'KB',
    targetValue: initialTargetKB ? (initialTargetKB >= 1024 ? Math.round(initialTargetKB / 1024 * 10) / 10 : initialTargetKB) : 350,
    manualQuality: 80,
    format: 'image/jpeg',
    preserveTransparency: true,
    flattenColor: '#FFFFFF',
  });

  const [result, setResult] = useState<CompressionResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'side-by-side' | 'compressed-only'>('split');
  const [splitSliderPos, setSplitSliderPos] = useState(50);

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
            await ProjectPersistenceService.setActiveProject(userId, 'compressor', loaded.id);
            applyLoadedProject(loaded);
            setIsLoadingProject(false);
            return;
          }
        }

        if (initialImage) {
          const proj = ProjectPersistenceService.createNewProject(
            userId,
            'compressor',
            `Compress: ${initialImage.name}`
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
          const active = await ProjectPersistenceService.getActiveProject(userId, 'compressor');
          if (active && active.status !== 'completed' && active.originalDataUrl && !isCancelled) {
            applyLoadedProject(active);
          } else if (!isCancelled) {
            setCurrentProject(null);
            setImageState(null);
          }
        }
      } catch (err) {
        console.error('Failed to restore compressor project:', err);
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

  // Load HTMLImageElement on imageState change
  useEffect(() => {
    if (imageState) {
      loadImageElement(imageState.dataUrl)
        .then((img) => setLoadedImgElement(img))
        .catch((e) => console.error('Image load failed', e));
    } else {
      setLoadedImgElement(null);
      setResult(null);
    }
  }, [imageState]);

  // Execute compression when config or image changes
  useEffect(() => {
    if (!loadedImgElement || !imageState) return;

    let isMounted = true;
    setIsCompressing(true);

    const debounceTimer = setTimeout(() => {
      compressImage(loadedImgElement, config, imageState.size)
        .then((res) => {
          if (isMounted) {
            setResult(res);
            setIsCompressing(false);
          }
        })
        .catch((err) => {
          console.error('Compression failed', err);
          if (isMounted) setIsCompressing(false);
        });
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(debounceTimer);
    };
  }, [loadedImgElement, config, imageState]);

  // Debounced auto-save
  useEffect(() => {
    if (!currentProject || !imageState) return;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const configSummary = result
          ? `${formatBytes(imageState.size)} → ${formatBytes(result.compressedSize)} (${Math.round(result.reductionPercentage)}% reduction)`
          : `Target ${config.targetValue} ${config.targetUnit} (${config.format.split('/')[1]?.toUpperCase()})`;

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
        ? { ...currentProject, title: `Compress: ${newImg.name}` }
        : ProjectPersistenceService.createNewProject(userId, 'compressor', `Compress: ${newImg.name}`);

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
        await ProjectPersistenceService.setActiveProject(userId, 'compressor', proj.id);
        applyLoadedProject(proj);
      }
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleClearProject = async () => {
    await ProjectPersistenceService.setActiveProject(userId, 'compressor', null);
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

  const handleDownload = async () => {
    if (!result || !imageState) return;
    const baseName = imageState.name.replace(/\.[^/.]+$/, '');
    const ext = result.format === 'image/png' ? 'png' : result.format === 'image/webp' ? 'webp' : 'jpg';
    triggerDownload(result.blob, `${baseName}-compressed.${ext}`);

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
    await ProjectPersistenceService.setActiveProject(userId, 'compressor', null);

    // Reset workspace to empty upload state
    setImageState(null);
    setLoadedImgElement(null);
    setResult(null);
    setCurrentProject(null);
    setSaveStatus('idle');
  };

  // Quick target size presets
  const sizePresets = [
    { label: '200 KB (Fast Web)', val: 200, unit: 'KB' as const },
    { label: '500 KB (Balanced)', val: 500, unit: 'KB' as const },
    { label: '1.0 MB (High Res)', val: 1.0, unit: 'MB' as const },
    { label: '1.9 MB (YouTube Max)', val: 1.9, unit: 'MB' as const },
    { label: '4.8 MB (X/Twitter Max)', val: 4.8, unit: 'MB' as const },
  ];

  if (isLoadingProject) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <span className="w-8 h-8 border-3 border-[#FF6B35] border-t-transparent rounded-full animate-spin inline-block mb-3" />
        <p className="text-sm font-semibold text-[#171717]">Restoring Compressor Workspace State...</p>
        <p className="text-xs text-[#171717]/60 mt-1">Retrieving persistent project files and configurations</p>
      </div>
    );
  }

  if (!imageState) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <ProjectWorkspaceBar
          tool="compressor"
          currentProjectId={currentProject?.id}
          currentTitle={currentProject?.title || 'Untitled Compression Project'}
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          onRenameTitle={handleRenameTitle}
          onSelectProject={handleSelectProject}
          onNewProject={handleNewProject}
          onClearProject={handleClearProject}
          hasActiveProject={false}
        />

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Image Compressor</h1>
          <p className="mt-1 text-sm text-[#171717]/70">
            Target specific KB/MB thresholds with zero guesswork. Real measured file size output.
          </p>
        </div>

        <ImageDropzone
          onImageLoaded={handleImageLoaded}
          title="Upload image to compress"
          subtitle="Set precise target file sizes (e.g. YouTube 2MB limit, fast web 200KB). Real measurements."
        />

        {/* Quick info cards */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-[#171717]/10 pt-6 text-xs text-[#171717]/80">
          <div className="p-3 bg-white/60 border border-[#171717]/10 rounded-lg">
            <span className="font-semibold block text-[#171717]">True Measurement</span>
            <span>Reports actual exported Blob bytes, never an optimistic rough estimate.</span>
          </div>
          <div className="p-3 bg-white/60 border border-[#171717]/10 rounded-lg">
            <span className="font-semibold block text-[#171717]">Binary Search Convergence</span>
            <span>Iterates through compression passes to accurately reach your target file size.</span>
          </div>
          <div className="p-3 bg-white/60 border border-[#171717]/10 rounded-lg">
            <span className="font-semibold block text-[#171717]">Alpha Transparency Guard</span>
            <span>Warns you immediately if selecting JPEG would flatten transparent background areas.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Persistent Project Workspace Bar */}
      <ProjectWorkspaceBar
        tool="compressor"
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

      {/* Top Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#171717]/10 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#171717]/60">
            <span>Tools</span>
            <span>/</span>
            <span className="text-[#171717] font-medium">Image Compressor</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#171717] mt-0.5">
            {imageState.name}
          </h1>
          <div className="flex items-center gap-2 text-xs text-[#171717]/70 mt-1 font-mono">
            <span>Original: {formatBytes(imageState.size)}</span>
            <span>·</span>
            <span>{imageState.width} × {imageState.height} px</span>
            {result && (
              <>
                <span>·</span>
                <span className="font-semibold text-emerald-700">
                  Compressed: {formatBytes(result.compressedSize)} (-{result.reductionPercentage.toFixed(1)}%)
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownload}
            disabled={!result || isCompressing}
            className="px-4 py-2 min-h-[42px] text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download ({result ? formatBytes(result.compressedSize) : '...'})</span>
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
        {/* LEFT / MAIN COLUMN: PREVIEW */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-white/80 border border-[#171717]/10 rounded-xl p-3.5 sm:p-6 shadow-xs">
            {/* View Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#171717]/10 mb-4 gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#171717]">
                Visual Quality Comparison
              </span>

              <div className="flex items-center gap-1 bg-[#171717]/5 p-1 rounded-lg text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`px-3 py-1.5 min-h-[36px] rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    viewMode === 'split' ? 'bg-white text-[#171717] font-semibold shadow-xs' : 'text-[#171717]/65 hover:text-[#171717]'
                  }`}
                >
                  Split Slider
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('side-by-side')}
                  className={`px-3 py-1.5 min-h-[36px] rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    viewMode === 'side-by-side' ? 'bg-white text-[#171717] font-semibold shadow-xs' : 'text-[#171717]/65 hover:text-[#171717]'
                  }`}
                >
                  Side-by-Side
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('compressed-only')}
                  className={`px-3 py-1.5 min-h-[36px] rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    viewMode === 'compressed-only' ? 'bg-white text-[#171717] font-semibold shadow-xs' : 'text-[#171717]/65 hover:text-[#171717]'
                  }`}
                >
                  Compressed Only
                </button>
              </div>
            </div>

            {/* PREVIEW CONTAINER */}
            <div className="relative min-h-[280px] xs:min-h-[340px] sm:min-h-[400px] max-h-[560px] bg-[#171717]/5 rounded-xl border border-[#171717]/10 overflow-hidden flex items-center justify-center p-2">
              {isCompressing && (
                <div className="absolute inset-0 z-30 bg-white/70 backdrop-blur-xs flex flex-col items-center justify-center text-xs font-mono text-[#171717] gap-2 p-4 text-center">
                  <span className="w-6 h-6 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
                  <span>Iterating Canvas to exact target size...</span>
                </div>
              )}

              {viewMode === 'split' && result && (
                <div className="relative w-full h-[280px] xs:h-[340px] sm:h-[440px] select-none overflow-hidden flex items-center justify-center">
                  {/* Original Image (Left/Under) */}
                  <img
                    src={imageState.dataUrl}
                    alt="Original"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  />
                  <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded bg-[#171717]/80 text-[#F7F5F0] text-[10px] sm:text-[11px] font-mono shadow-xs backdrop-blur-xs">
                    Original ({formatBytes(imageState.size)})
                  </div>

                  {/* Compressed Image (Right/Over with clip-path) */}
                  <div
                    className="absolute inset-0 overflow-hidden pointer-events-none"
                    style={{ clipPath: `inset(0 0 0 ${splitSliderPos}%)` }}
                  >
                    <img
                      src={result.dataUrl}
                      alt="Compressed"
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  </div>
                  <div className="absolute top-2.5 right-2.5 z-10 px-2 py-0.5 rounded bg-[#FF6B35] text-white text-[10px] sm:text-[11px] font-mono shadow-xs">
                    Compressed ({formatBytes(result.compressedSize)})
                  </div>

                  {/* Slider divider line and drag thumb */}
                  <div
                    className="absolute top-0 bottom-0 z-20 w-0.5 bg-white shadow-lg pointer-events-none"
                    style={{ left: `${splitSliderPos}%` }}
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#171717] border-2 border-white flex items-center justify-center text-white text-xs shadow-md">
                      ↔
                    </div>
                  </div>

                  {/* Invisible range input overlaid for touch/mouse dragging */}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={splitSliderPos}
                    onChange={(e) => setSplitSliderPos(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-25 touch-none"
                    aria-label="Split preview slider"
                  />
                </div>
              )}

              {viewMode === 'side-by-side' && result && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full min-h-[360px] md:h-[400px]">
                  <div className="relative h-44 sm:h-56 md:h-full bg-[#171717]/10 rounded-lg flex items-center justify-center overflow-hidden border border-[#171717]/10">
                    <img
                      src={imageState.dataUrl}
                      alt="Original"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-[#171717]/80 text-[#F7F5F0] text-[10px] sm:text-[11px] font-mono">
                      Original: {formatBytes(imageState.size)}
                    </div>
                  </div>
                  <div className="relative h-44 sm:h-56 md:h-full bg-[#171717]/10 rounded-lg flex items-center justify-center overflow-hidden border border-[#171717]/10">
                    <img
                      src={result.dataUrl}
                      alt="Compressed"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-[#FF6B35] text-white text-[10px] sm:text-[11px] font-mono">
                      Output: {formatBytes(result.compressedSize)}
                    </div>
                  </div>
                </div>
              )}

              {viewMode === 'compressed-only' && result && (
                <div className="relative w-full h-[280px] xs:h-[340px] sm:h-[400px] flex items-center justify-center">
                  <img
                    src={result.dataUrl}
                    alt="Compressed output"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded bg-[#FF6B35] text-white text-[10px] sm:text-[11px] font-mono shadow-xs">
                    Output: {formatBytes(result.compressedSize)} ({result.width}×{result.height} px)
                  </div>
                </div>
              )}
            </div>

            {/* Reduction Statistics Bar */}
            {result && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#171717]/5 p-3 rounded-lg text-xs font-mono">
                <div>
                  <span className="text-[#171717]/60 block text-[11px]">Original Size</span>
                  <span className="font-semibold text-sm">{formatBytes(result.originalSize)}</span>
                </div>
                <div>
                  <span className="text-[#171717]/60 block text-[11px]">Actual Output</span>
                  <span className="font-semibold text-sm text-[#FF6B35]">{formatBytes(result.compressedSize)}</span>
                </div>
                <div>
                  <span className="text-[#171717]/60 block text-[11px]">Size Saved</span>
                  <span className="font-semibold text-sm text-emerald-700">
                    {result.reductionPercentage > 0 ? `-${result.reductionPercentage.toFixed(1)}%` : '0%'}
                  </span>
                </div>
                <div>
                  <span className="text-[#171717]/60 block text-[11px]">Quality Index</span>
                  <span className="font-semibold text-sm">{result.qualityUsed}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Transparency Warning Notice */}
          {result?.hasAlphaWarning && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-amber-900">Alpha Transparency Notice</span>
                <span>
                  The source image contains transparent pixels. Because JPEG does not support transparency, transparent areas have been filled with clean solid white. Switch format to <strong>WebP</strong> or <strong>PNG</strong> if you wish to retain transparent background layers.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: CONTROLS */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="bg-white/90 border border-[#171717]/10 rounded-xl p-5 shadow-xs flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#171717]/10">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171717]">
                Compression Controls
              </span>
              <Sliders className="w-4 h-4 text-[#171717]/50" />
            </div>

            {/* Mode: Target File Size vs Manual Slider */}
            <div>
              <label className="block text-xs font-semibold text-[#171717] mb-2">
                Compression Mode
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#171717]/5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, mode: 'target' })}
                  className={`py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                    config.mode === 'target'
                      ? 'bg-white text-[#171717] shadow-xs font-semibold'
                      : 'text-[#171717]/65 hover:text-[#171717]'
                  }`}
                >
                  Target File Size
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, mode: 'manual' })}
                  className={`py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                    config.mode === 'manual'
                      ? 'bg-white text-[#171717] shadow-xs font-semibold'
                      : 'text-[#171717]/65 hover:text-[#171717]'
                  }`}
                >
                  Quality Slider
                </button>
              </div>
            </div>

            {/* Target Size Mode Controls */}
            {config.mode === 'target' ? (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#171717] mb-1.5">
                    Target Maximum Size
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step={config.targetUnit === 'MB' ? '0.1' : '10'}
                      min={10}
                      max={50000}
                      value={config.targetValue}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          targetValue: Math.max(1, parseFloat(e.target.value) || 1),
                        })
                      }
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-[#171717]/20 rounded-md font-mono focus:border-[#FF6B35] focus:outline-none"
                    />
                    <div className="flex rounded-md border border-[#171717]/20 overflow-hidden text-xs font-mono">
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, targetUnit: 'KB' })}
                        className={`px-2.5 py-1.5 transition-colors ${
                          config.targetUnit === 'KB'
                            ? 'bg-[#171717] text-white font-semibold'
                            : 'bg-white text-[#171717]/70'
                        }`}
                      >
                        KB
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, targetUnit: 'MB' })}
                        className={`px-2.5 py-1.5 transition-colors ${
                          config.targetUnit === 'MB'
                            ? 'bg-[#171717] text-white font-semibold'
                            : 'bg-white text-[#171717]/70'
                        }`}
                      >
                        MB
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Target Presets */}
                <div>
                  <label className="block text-xs font-semibold text-[#171717] mb-1.5">
                    Common Target Benchmarks
                  </label>
                  <div className="flex flex-col gap-1.5">
                    {sizePresets.map((sp, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          setConfig({
                            ...config,
                            targetValue: sp.val,
                            targetUnit: sp.unit,
                          })
                        }
                        className={`text-xs py-1.5 px-2.5 rounded-md border text-left flex items-center justify-between transition-colors ${
                          config.targetValue === sp.val && config.targetUnit === sp.unit
                            ? 'bg-[#171717] text-white border-[#171717] font-semibold'
                            : 'bg-white border-[#171717]/15 text-[#171717]/80 hover:border-[#171717]/40'
                        }`}
                      >
                        <span>{sp.label}</span>
                        <span className="font-mono text-[11px] opacity-75">
                          {sp.val} {sp.unit}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Manual Quality Slider */
              <div>
                <div className="flex justify-between text-xs font-semibold text-[#171717] mb-1.5">
                  <span>Compression Quality</span>
                  <span className="font-mono">{config.manualQuality}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={config.manualQuality}
                  onChange={(e) =>
                    setConfig({ ...config, manualQuality: parseInt(e.target.value) })
                  }
                  className="w-full accent-[#FF6B35]"
                />
                <div className="flex justify-between text-[11px] text-[#171717]/60 font-mono mt-1">
                  <span>Lowest Size (5%)</span>
                  <span>Maximum Quality (100%)</span>
                </div>
              </div>
            )}

            {/* Target Output Format */}
            <div className="pt-2 border-t border-[#171717]/10 flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#171717] mb-1">
                  Output Format
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#171717]/5 rounded-lg text-xs font-mono">
                  {(['image/jpeg', 'image/webp', 'image/png'] as ImageFormat[]).map((fmt) => (
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
                <span className="block text-[11px] text-[#171717]/60 mt-1">
                  {config.format === 'image/webp'
                    ? 'WebP offers 25-35% superior compression efficiency over JPEG.'
                    : config.format === 'image/png'
                    ? 'Lossless format; file sizes will remain relatively larger.'
                    : 'Standard universal compatibility for all platforms.'}
                </span>
              </div>
            </div>

            {/* Action: Download Compressed Result */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!result || isCompressing}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-[#FF6B35]" />
                <span>
                  Download Compressed Image ({result ? formatBytes(result.compressedSize) : '...'})
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
