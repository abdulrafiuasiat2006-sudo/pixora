import React, { useState, useEffect } from 'react';
import {
  ImageFileState,
  SplitConfig,
  SplitTile,
  ImageFormat,
  SplitMode,
} from '../../types';
import { ImageDropzone } from '../common/ImageDropzone';
import {
  loadImageElement,
  splitImage,
  createZipArchive,
  triggerDownload,
  formatBytes,
} from '../../utils/imageEngine';
import { StorageService } from '../../services/storageService';
import {
  Grid,
  Layers,
  Download,
  Archive,
  RotateCcw,
  Check,
  AlertCircle,
  Eye,
  Sliders,
  BookmarkPlus,
  Share2,
} from 'lucide-react';
import { ProjectWorkspaceBar } from '../common/ProjectWorkspaceBar';
import { ProjectPersistenceService } from '../../services/projectPersistenceService';
import { useAuth } from '../../context/AuthContext';
import { FullWorkspaceProject } from '../../types';

interface SplitterWorkspaceProps {
  initialImage?: ImageFileState | null;
  initialPreset?: { rows: number; cols: number; mode: SplitMode };
  initialProjectId?: string;
  onClearLaunch?: () => void;
  onNavigate?: (tab: string) => void;
}

export const SplitterWorkspace: React.FC<SplitterWorkspaceProps> = ({
  initialImage = null,
  initialPreset,
  initialProjectId,
  onClearLaunch,
  onNavigate,
}) => {
  const { user } = useAuth();
  const userId = user?.id || 'guest';

  const [currentProject, setCurrentProject] = useState<FullWorkspaceProject | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number>(Date.now());
  const [isLoadingProject, setIsLoadingProject] = useState(true);

  const [imageState, setImageState] = useState<ImageFileState | null>(initialImage);
  const [loadedImgElement, setLoadedImgElement] = useState<HTMLImageElement | null>(null);

  const [config, setConfig] = useState<SplitConfig>({
    mode: initialPreset?.mode || 'grid',
    rows: initialPreset?.rows || 3,
    cols: initialPreset?.cols || 3,
    format: 'image/jpeg',
    quality: 90,
    fileNamePrefix: 'pixora-tile',
    carouselSlideCount: 3,
    carouselAspect: '1:1',
  });

  const [tiles, setTiles] = useState<SplitTile[]>([]);
  const [downloadedTileIndices, setDownloadedTileIndices] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [selectedTilePreview, setSelectedTilePreview] = useState<SplitTile | null>(null);
  const [showInstagramOrder, setShowInstagramOrder] = useState(false);
  const [savedSuccessNotice, setSavedSuccessNotice] = useState(false);

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
    if (proj.resultsData?.downloadedTileIndices) {
      setDownloadedTileIndices(new Set(proj.resultsData.downloadedTileIndices));
    } else {
      setDownloadedTileIndices(new Set());
    }
    setLastSavedAt(proj.updatedAt || proj.createdAt || Date.now());
    setSaveStatus('saved');
  };

  // Restore workspace project on mount or project/user change
  useEffect(() => {
    let isCancelled = false;

    const restoreWorkspace = async () => {
      setIsLoadingProject(true);
      try {
        if (initialProjectId) {
          const loaded = await ProjectPersistenceService.loadProject(initialProjectId, userId);
          if (loaded && !isCancelled) {
            await ProjectPersistenceService.setActiveProject(userId, 'splitter', loaded.id);
            applyLoadedProject(loaded);
            setIsLoadingProject(false);
            return;
          }
        }

        if (initialImage) {
          const proj = ProjectPersistenceService.createNewProject(
            userId,
            'splitter',
            `Split: ${initialImage.name}`
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
            setDownloadedTileIndices(new Set());
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
          // Restore active project for this user in Splitter
          const active = await ProjectPersistenceService.getActiveProject(userId, 'splitter');
          if (active && active.status !== 'completed' && active.originalDataUrl && !isCancelled) {
            applyLoadedProject(active);
          } else if (!isCancelled) {
            setCurrentProject(null);
            setImageState(null);
          }
        }
      } catch (err) {
        console.error('Failed to restore splitter project:', err);
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

  // When imageState changes, load the HTMLImageElement
  useEffect(() => {
    if (imageState) {
      loadImageElement(imageState.dataUrl)
        .then((img) => {
          setLoadedImgElement(img);
        })
        .catch((err) => {
          console.error('Failed to load image element', err);
        });
    } else {
      setLoadedImgElement(null);
      setTiles([]);
    }
  }, [imageState]);

  // Re-run splitting when image or config changes
  useEffect(() => {
    if (!loadedImgElement) return;

    let isMounted = true;
    setIsProcessing(true);

    splitImage(loadedImgElement, config)
      .then((result) => {
        if (isMounted) {
          setTiles(result.tiles);
          setIsProcessing(false);
        }
      })
      .catch((err) => {
        console.error('Split processing failed', err);
        if (isMounted) setIsProcessing(false);
      });

    return () => {
      isMounted = false;
    };
  }, [loadedImgElement, config]);

  // Debounced auto-save when config, tiles, or project changes
  useEffect(() => {
    if (!currentProject || !imageState) return;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const configSummary =
          config.mode === 'carousel'
            ? `${config.cols}-Slide Carousel (${config.format.split('/')[1]?.toUpperCase()} @ ${config.quality}%)`
            : `${config.rows}×${config.cols} Grid Split (${tiles.length} tiles)`;

        const updated: FullWorkspaceProject = {
          ...currentProject,
          config,
          configSummary,
          status: 'draft',
          exportCount: tiles.length,
          originalFileName: imageState.name,
          originalWidth: imageState.width,
          originalHeight: imageState.height,
          originalSizeBytes: imageState.size,
          originalMimeType: imageState.type,
          originalDataUrl: imageState.dataUrl,
          thumbnailUrl: tiles[0]?.dataUrl || imageState.dataUrl,
          resultsData: {
            downloadedTileIndices: Array.from(downloadedTileIndices),
          },
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
  }, [config, tiles.length, imageState, downloadedTileIndices.size]);

  const handleImageLoaded = (newImg: ImageFileState) => {
    const proj =
      currentProject && !currentProject.originalFileName
        ? { ...currentProject, title: `Split: ${newImg.name}` }
        : ProjectPersistenceService.createNewProject(userId, 'splitter', `Split: ${newImg.name}`);

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
    setDownloadedTileIndices(new Set());
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
        await ProjectPersistenceService.setActiveProject(userId, 'splitter', proj.id);
        applyLoadedProject(proj);
      }
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleClearProject = async () => {
    await ProjectPersistenceService.setActiveProject(userId, 'splitter', null);
    setImageState(null);
    setLoadedImgElement(null);
    setTiles([]);
    setCurrentProject(null);
    setDownloadedTileIndices(new Set());
    setSaveStatus('idle');
  };

  const handleNewProject = async () => {
    handleClearProject();
  };

  const handleReset = () => {
    handleClearProject();
  };

  const handleDownloadSingleTile = async (tile: SplitTile) => {
    triggerDownload(tile.blob, tile.fileName);
    const nextSet = new Set(downloadedTileIndices);
    nextSet.add(tile.index);
    setDownloadedTileIndices(nextSet);

    if (currentProject) {
      const updated = {
        ...currentProject,
        resultsData: { downloadedTileIndices: Array.from(nextSet) },
      };
      ProjectPersistenceService.saveProject(updated, false).catch(() => {});
    }

    // Auto-clear active workspace only when ALL tiles have been downloaded
    if (tiles.length > 0 && nextSet.size >= tiles.length) {
      if (currentProject) {
        const completedProj: FullWorkspaceProject = {
          ...currentProject,
          status: 'completed',
          exportCount: tiles.length,
          updatedAt: Date.now(),
        };
        await ProjectPersistenceService.saveProject(completedProj, false);
      }
      await ProjectPersistenceService.setActiveProject(userId, 'splitter', null);
      setImageState(null);
      setLoadedImgElement(null);
      setTiles([]);
      setCurrentProject(null);
      setDownloadedTileIndices(new Set());
      setSaveStatus('idle');
    }
  };

  const handleDownloadAllZip = async () => {
    if (tiles.length === 0) return;
    setIsZipping(true);
    try {
      const postingGuide =
        config.mode === 'grid' && config.rows === 3 && config.cols === 3
          ? 'INSTAGRAM POSTING TIP: Post in reverse order (Tile 09 first, Tile 01 last) to assemble the full image on your profile grid.'
          : 'TILES ORDER: Tiles are named sequentially row by row, left to right.';

      const zipBlob = await createZipArchive(
        tiles,
        `${config.fileNamePrefix || 'pixora-tiles'}.zip`,
        postingGuide
      );
      triggerDownload(zipBlob, `${config.fileNamePrefix || 'pixora-tiles'}-all.zip`);

      // Downloading full ZIP satisfies all required downloads for this split project
      if (currentProject) {
        const completedProj: FullWorkspaceProject = {
          ...currentProject,
          status: 'completed',
          exportCount: tiles.length,
          updatedAt: Date.now(),
        };
        await ProjectPersistenceService.saveProject(completedProj, false);
      }
      await ProjectPersistenceService.setActiveProject(userId, 'splitter', null);
      setImageState(null);
      setLoadedImgElement(null);
      setTiles([]);
      setCurrentProject(null);
      setDownloadedTileIndices(new Set());
      setSaveStatus('idle');
    } catch (e) {
      console.error('ZIP generation failed', e);
    } finally {
      setIsZipping(false);
    }
  };

  const gridPresets = [
    { label: '3×3 Giant Grid (IG)', rows: 3, cols: 3, mode: 'grid' as SplitMode },
    { label: '3×1 Wide Panorama', rows: 1, cols: 3, mode: 'grid' as SplitMode },
    { label: '3×2 Banner (IG)', rows: 2, cols: 3, mode: 'grid' as SplitMode },
    { label: '2×2 Square Quad', rows: 2, cols: 2, mode: 'grid' as SplitMode },
    { label: '3-Slide Carousel', rows: 1, cols: 3, mode: 'carousel' as SplitMode },
    { label: '5-Slide Carousel', rows: 1, cols: 5, mode: 'carousel' as SplitMode },
  ];

  if (isLoadingProject) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <span className="w-8 h-8 border-3 border-[#FF6B35] border-t-transparent rounded-full animate-spin inline-block mb-3" />
        <p className="text-sm font-semibold text-[#171717]">Restoring Splitter Workspace State...</p>
        <p className="text-xs text-[#171717]/60 mt-1">Retrieving persistent project files and configurations</p>
      </div>
    );
  }

  if (!imageState) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <ProjectWorkspaceBar
          tool="splitter"
          currentProjectId={currentProject?.id}
          currentTitle={currentProject?.title || 'Untitled Split Project'}
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          onRenameTitle={handleRenameTitle}
          onSelectProject={handleSelectProject}
          onNewProject={handleNewProject}
          onClearProject={handleClearProject}
          hasActiveProject={false}
        />

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Image Splitter & Tile Exporter</h1>
          <p className="mt-1 text-sm text-[#171717]/70">
            Divide photos into seamless multi-tile profile grids or swipeable panorama carousels.
          </p>
        </div>

        <ImageDropzone
          onImageLoaded={handleImageLoaded}
          title="Upload image to split"
          subtitle="Works with any resolution. Exact pixel distribution ensures zero seam gaps."
        />

        {/* Quick presets guide */}
        <div className="mt-8 border-t border-[#171717]/10 pt-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#171717]/60 mb-3 text-center">
            Popular Split Presets Available
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {gridPresets.map((p, idx) => (
              <div
                key={idx}
                className="p-3 bg-white/60 border border-[#171717]/10 rounded-lg text-left"
              >
                <div className="font-semibold text-xs text-[#171717]">{p.label}</div>
                <div className="text-[11px] text-[#171717]/60 mt-0.5">
                  {p.mode === 'carousel' ? `${p.cols} contiguous swipe slides` : `${p.rows * p.cols} tiles (${p.cols} cols × ${p.rows} rows)`}
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
        tool="splitter"
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
            <span className="text-[#171717] font-medium">Image Splitter</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#171717] mt-0.5">
            {imageState.name}
          </h1>
          <div className="flex items-center gap-2 text-xs text-[#171717]/70 mt-1 font-mono">
            <span>{imageState.width} × {imageState.height} px</span>
            <span>·</span>
            <span>{formatBytes(imageState.size)}</span>
            <span>·</span>
            <span>{imageState.type.split('/')[1]?.toUpperCase()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownloadAllZip}
            disabled={isProcessing || tiles.length === 0 || isZipping}
            className="px-4 py-2 min-h-[42px] text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer active:scale-95"
          >
            {isZipping ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Archive className="w-3.5 h-3.5" />
            )}
            <span>Export ZIP ({tiles.length} Tiles)</span>
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
        {/* LEFT / MAIN COLUMN: TILES PREVIEW GRID */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-white/80 border border-[#171717]/10 rounded-xl p-3.5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#171717]/10 mb-4 gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#171717]">
                  {config.mode === 'carousel' ? 'Carousel Slide Preview' : 'Interactive Tile Grid'}
                </span>
                <span className="text-xs text-[#171717]/50 font-mono">
                  ({tiles.length} {tiles.length === 1 ? 'tile' : 'tiles'}
                  {downloadedTileIndices.size > 0 && ` · ${downloadedTileIndices.size}/${tiles.length} saved`})
                </span>
              </div>

              {/* Instagram reverse order guide toggle */}
              {config.rows === 3 && config.cols === 3 && config.mode === 'grid' && (
                <button
                  type="button"
                  onClick={() => setShowInstagramOrder(!showInstagramOrder)}
                  className={`text-xs px-3 py-1.5 min-h-[38px] rounded-lg transition-colors font-medium border cursor-pointer active:scale-95 ${
                    showInstagramOrder
                      ? 'bg-[#171717] text-white border-[#171717]'
                      : 'bg-white text-[#171717]/75 border-[#171717]/20 hover:text-[#171717]'
                  }`}
                >
                  {showInstagramOrder ? 'Showing IG Order (9→1)' : 'Show IG Posting Order'}
                </button>
              )}
            </div>

            {isProcessing ? (
              <div className="py-20 flex flex-col items-center justify-center text-[#171717]/60 gap-2">
                <span className="w-6 h-6 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-mono">Computing seamless pixel slices...</span>
              </div>
            ) : config.mode === 'carousel' ? (
              /* Carousel mode: Touch-friendly horizontal swipe track on mobile, clean row on desktop */
              <div className="w-full">
                <div className="flex gap-3 overflow-x-auto pb-4 pt-1 px-0.5 scrollbar-thin snap-x snap-mandatory">
                  {tiles.map((tile) => (
                    <div
                      key={tile.id}
                      onClick={() => setSelectedTilePreview(tile)}
                      className="group relative bg-[#171717]/5 border border-[#171717]/15 rounded-xl overflow-hidden flex flex-col transition-all hover:border-[#FF6B35] cursor-pointer snap-center shrink-0 w-[68vw] xs:w-[50vw] sm:w-[38vw] md:w-56 shadow-2xs"
                    >
                      <div className="relative aspect-square w-full bg-[#171717]/10 flex items-center justify-center overflow-hidden">
                        <img
                          src={tile.dataUrl}
                          alt={tile.fileName}
                          className="w-full h-full object-cover pointer-events-none"
                          referrerPolicy="no-referrer"
                        />

                        {/* Slide Indicator */}
                        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-[#171717]/80 text-[#F7F5F0] text-[11px] font-mono shadow-xs backdrop-blur-xs">
                          Slide #{tile.index}
                        </div>

                        {/* Tile Downloaded Badge */}
                        {downloadedTileIndices.has(tile.index) && (
                          <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs">
                            <Check className="w-3 h-3" />
                            <span>Saved</span>
                          </div>
                        )}

                        {/* Quick Action Overlay */}
                        <div className="absolute inset-0 bg-[#171717]/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                          <span className="px-2.5 py-1 text-xs font-semibold text-[#171717] bg-white rounded-md shadow-xs">
                            Tap to inspect
                          </span>
                        </div>
                      </div>

                      {/* Tile meta info footer */}
                      <div className="p-2.5 text-[11px] bg-white border-t border-[#171717]/10 flex items-center justify-between text-[#171717]/70 font-mono">
                        <span>{tile.width}×{tile.height}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadSingleTile(tile);
                          }}
                          className="p-1 text-[#FF6B35] hover:bg-[#FF6B35]/10 rounded font-semibold flex items-center gap-1"
                          title="Download slide"
                        >
                          <Download className="w-3 h-3" />
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-[#171717]/55 mt-1 font-mono text-center">
                  ← Swipe horizontally to preview continuous carousel panorama →
                </p>
              </div>
            ) : (
              /* Grid mode (Profile 3x3, 2x2, etc.) */
              <div
                className="grid gap-2 sm:gap-3 select-none"
                style={{
                  gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
                }}
              >
                {tiles.map((tile) => {
                  const igOrderNumber =
                    config.rows === 3 && config.cols === 3 ? 10 - tile.index : tile.index;

                  return (
                    <div
                      key={tile.id}
                      onClick={() => setSelectedTilePreview(tile)}
                      className="group relative bg-[#171717]/5 border border-[#171717]/15 rounded-lg overflow-hidden flex flex-col transition-all hover:border-[#FF6B35] cursor-pointer"
                    >
                      <div className="relative aspect-square w-full bg-[#171717]/10 flex items-center justify-center overflow-hidden">
                        <img
                          src={tile.dataUrl}
                          alt={tile.fileName}
                          className="w-full h-full object-cover pointer-events-none"
                          referrerPolicy="no-referrer"
                        />

                        {/* Tile Sequence Indicator */}
                        <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 z-10 px-1.5 sm:px-2 py-0.5 rounded bg-[#171717]/80 text-[#F7F5F0] text-[10px] sm:text-[11px] font-mono shadow-xs backdrop-blur-xs">
                          {showInstagramOrder ? `Post #${igOrderNumber}` : `#${tile.index}`}
                        </div>

                        {/* Tile Downloaded Badge */}
                        {downloadedTileIndices.has(tile.index) && (
                          <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 z-10 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs">
                            <Check className="w-3 h-3" />
                            <span className="hidden xs:inline">Saved</span>
                          </div>
                        )}

                        {/* Hover Overlay with Preview and Download actions */}
                        <div className="absolute inset-0 bg-[#171717]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTilePreview(tile);
                            }}
                            className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center bg-white text-[#171717] rounded-md hover:bg-[#F7F5F0] transition"
                            title="Inspect tile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadSingleTile(tile);
                            }}
                            className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center bg-[#FF6B35] text-white rounded-md hover:bg-[#e05825] transition"
                            title="Download this tile"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Tile meta info footer */}
                      <div className="p-1.5 sm:p-2 text-[10px] sm:text-[11px] bg-white border-t border-[#171717]/10 flex items-center justify-between text-[#171717]/70 font-mono">
                        <span className="truncate">{tile.width}×{tile.height}</span>
                        <span className="hidden xs:inline">{formatBytes(tile.blob.size, 1)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Social posting tip callout */}
          <div className="p-4 bg-white/50 border border-[#171717]/10 rounded-xl text-xs text-[#171717]/70 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-[#FF6B35] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-[#171717]">Seamless Boundary Guarantee:</span>
              <p>
                PIXORA uses remainder-distribution calculus across Canvas coordinates. Because image pixel dimensions
                don't always divide evenly, odd remainder pixels are distributed across center tiles so there is zero rounding seam or blank pixel gap.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: CONFIGURATION CONTROLS */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="bg-white/90 border border-[#171717]/10 rounded-xl p-5 shadow-xs flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#171717]/10">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171717]">
                Grid Configuration
              </span>
              <Sliders className="w-4 h-4 text-[#171717]/50" />
            </div>

            {/* Split Mode Toggle: Grid vs Carousel */}
            <div>
              <label className="block text-xs font-semibold text-[#171717] mb-2">
                Splitting Mode
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#171717]/5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, mode: 'grid' })}
                  className={`py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                    config.mode === 'grid'
                      ? 'bg-white text-[#171717] shadow-xs font-semibold'
                      : 'text-[#171717]/65 hover:text-[#171717]'
                  }`}
                >
                  Profile Grid (Rows × Cols)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfig({
                      ...config,
                      mode: 'carousel',
                      carouselSlideCount: 3,
                    })
                  }
                  className={`py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                    config.mode === 'carousel'
                      ? 'bg-white text-[#171717] shadow-xs font-semibold'
                      : 'text-[#171717]/65 hover:text-[#171717]'
                  }`}
                >
                  Seamless Carousel
                </button>
              </div>
            </div>

            {/* Mode-specific Controls */}
            {config.mode === 'grid' ? (
              <>
                {/* Quick Presets */}
                <div>
                  <label className="block text-xs font-semibold text-[#171717] mb-2">
                    Quick Grid Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { l: '3×3 Giant (IG)', r: 3, c: 3 },
                      { l: '3×1 Wide Panorama', r: 1, c: 3 },
                      { l: '3×2 Banner', r: 2, c: 3 },
                      { l: '2×2 Quad', r: 2, c: 2 },
                      { l: '4×3 Gallery', r: 3, c: 4 },
                      { l: '1×3 Vertical Column', r: 3, c: 1 },
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          setConfig({ ...config, rows: item.r, cols: item.c })
                        }
                        className={`text-xs py-1.5 px-2.5 rounded-md border text-left transition-colors ${
                          config.rows === item.r && config.cols === item.c
                            ? 'bg-[#171717] text-white border-[#171717] font-semibold'
                            : 'bg-white border-[#171717]/15 text-[#171717]/80 hover:border-[#171717]/40'
                        }`}
                      >
                        {item.l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Rows & Columns inputs */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#171717] mb-1">
                      Rows (1–10)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={config.rows}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          rows: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)),
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#171717]/20 rounded-md font-mono focus:border-[#FF6B35] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#171717] mb-1">
                      Columns (1–10)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={config.cols}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          cols: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)),
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#171717]/20 rounded-md font-mono focus:border-[#FF6B35] focus:outline-none"
                    />
                  </div>
                </div>
              </>
            ) : (
              /* Carousel Mode Controls */
              <div>
                <label className="block text-xs font-semibold text-[#171717] mb-2">
                  Number of Continuous Slides (2–10)
                </label>
                <div className="flex items-center gap-2 mb-3">
                  {[2, 3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() =>
                        setConfig({ ...config, carouselSlideCount: num })
                      }
                      className={`flex-1 py-1.5 text-xs font-mono font-semibold rounded border ${
                        config.carouselSlideCount === num
                          ? 'bg-[#171717] text-white border-[#171717]'
                          : 'bg-white border-[#171717]/20 text-[#171717]/80 hover:bg-[#171717]/5'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={config.carouselSlideCount}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      carouselSlideCount: parseInt(e.target.value),
                    })
                  }
                  className="w-full accent-[#FF6B35]"
                />
                <div className="flex justify-between text-[11px] text-[#171717]/60 font-mono mt-1">
                  <span>2 Slides</span>
                  <span>10 Slides</span>
                </div>
              </div>
            )}

            {/* Output Format & Quality */}
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
                    min={40}
                    max={100}
                    value={config.quality}
                    onChange={(e) =>
                      setConfig({ ...config, quality: parseInt(e.target.value) })
                    }
                    className="w-full accent-[#FF6B35]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#171717] mb-1">
                  Filename Prefix
                </label>
                <input
                  type="text"
                  value={config.fileNamePrefix}
                  onChange={(e) =>
                    setConfig({ ...config, fileNamePrefix: e.target.value })
                  }
                  placeholder="e.g. instagram-grid"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-[#171717]/20 rounded-md font-mono focus:border-[#FF6B35] focus:outline-none"
                />
                <span className="block text-[11px] text-[#171717]/50 mt-1 font-mono">
                  Sample: {config.fileNamePrefix || 'tile'}-01.{config.format.split('/')[1]}
                </span>
              </div>
            </div>

            {/* Bottom Action: Download ZIP */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={isProcessing || tiles.length === 0 || isZipping}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isZipping ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Archive className="w-4 h-4 text-[#FF6B35]" />
                )}
                <span>Download All as ZIP Archive</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TILE INSPECT MODAL */}
      {selectedTilePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/70 p-3 sm:p-4">
          <div className="bg-[#F7F5F0] border border-[#171717]/20 rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-2xl flex flex-col gap-3.5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#171717]/10">
              <span className="font-semibold text-sm text-[#171717]">
                Tile #{selectedTilePreview.index} Details
              </span>
              <button
                type="button"
                onClick={() => setSelectedTilePreview(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-xs font-bold text-[#171717]/60 hover:text-[#171717] p-1 rounded-md"
              >
                ✕ Close
              </button>
            </div>

            <div className="w-full max-h-[36vh] sm:max-h-[46vh] bg-[#171717]/10 rounded-xl overflow-hidden flex items-center justify-center border border-[#171717]/15 p-2">
              <img
                src={selectedTilePreview.dataUrl}
                alt={selectedTilePreview.fileName}
                className="max-w-full max-h-[32vh] sm:max-h-[42vh] object-contain rounded"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-white p-3 rounded-xl border border-[#171717]/10">
              <div>
                <span className="text-[#171717]/60 block text-[10px] uppercase">Dimensions:</span>
                <span className="font-semibold">{selectedTilePreview.width} × {selectedTilePreview.height} px</span>
              </div>
              <div>
                <span className="text-[#171717]/60 block text-[10px] uppercase">File Size:</span>
                <span className="font-semibold">{formatBytes(selectedTilePreview.blob.size)}</span>
              </div>
              <div>
                <span className="text-[#171717]/60 block text-[10px] uppercase">Grid Position:</span>
                <span className="font-semibold">Row {selectedTilePreview.row + 1}, Col {selectedTilePreview.col + 1}</span>
              </div>
              <div>
                <span className="text-[#171717]/60 block text-[10px] uppercase">Filename:</span>
                <span className="font-semibold truncate block">{selectedTilePreview.fileName}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSelectedTilePreview(null)}
                className="px-4 py-2 min-h-[42px] text-xs font-medium text-[#171717]/70 hover:text-[#171717] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSingleTile(selectedTilePreview)}
                className="px-4 py-2 min-h-[44px] text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download This Tile</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
