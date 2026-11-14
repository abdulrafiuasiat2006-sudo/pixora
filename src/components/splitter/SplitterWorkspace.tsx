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
import { DownloadOptions } from '../common/DownloadOptions';
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
  Rows,
  Columns,
  GalleryHorizontal,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  CheckCircle2,
  ShieldCheck,
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
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [showIndividualFilesModal, setShowIndividualFilesModal] = useState(false);
  const [selectedTilePreview, setSelectedTilePreview] = useState<SplitTile | null>(null);
  const [showInstagramOrder, setShowInstagramOrder] = useState(false);
  const [previewView, setPreviewView] = useState<'assembled' | 'tiles' | 'carousel'>('assembled');
  const [carouselActiveSlide, setCarouselActiveSlide] = useState(0);

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
                }
              })
              .catch(() => {
                if (!isCancelled) setSaveStatus('error');
              });
          }
        } else {
          const activeProj = await ProjectPersistenceService.getActiveProject(userId, 'splitter');
          if (activeProj && !isCancelled) {
            applyLoadedProject(activeProj);
          }
        }
      } catch (err) {
        console.warn('Failed restoring splitter project:', err);
      } finally {
        if (!isCancelled) {
          setIsLoadingProject(false);
        }
      }
    };

    restoreWorkspace();

    return () => {
      isCancelled = true;
    };
  }, [initialProjectId, userId]);

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

  // Reset carousel active slide when slide count changes
  useEffect(() => {
    setCarouselActiveSlide(0);
  }, [config.carouselSlideCount, config.mode]);

  // Debounced auto-save when config, tiles, or project changes
  useEffect(() => {
    if (!currentProject || !imageState) return;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const configSummary =
          config.mode === 'carousel'
            ? `${config.carouselSlideCount || config.cols}-Slide Seamless Carousel (${config.format.split('/')[1]?.toUpperCase()} @ ${config.quality}%)`
            : config.mode === 'rows'
            ? `${config.rows} Horizontal Rows (${config.format.split('/')[1]?.toUpperCase()} @ ${config.quality}%)`
            : config.mode === 'columns'
            ? `${config.cols} Vertical Columns (${config.format.split('/')[1]?.toUpperCase()} @ ${config.quality}%)`
            : `${config.rows}×${config.cols} Profile Grid (${tiles.length} tiles)`;

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

  const completeAndClearWorkspace = async () => {
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
    setShowIndividualFilesModal(false);
    setSelectedTilePreview(null);
    setImageState(null);
    setLoadedImgElement(null);
    setTiles([]);
    setCurrentProject(null);
    setDownloadedTileIndices(new Set());
    setSaveStatus('idle');
  };

  const handleDownloadSingleTile = async (tile: SplitTile, allowAutoClear: boolean = true) => {
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

    // Auto-clear active workspace only when ALL tiles have been individually tapped and modal is not holding them
    if (allowAutoClear && !showIndividualFilesModal && tiles.length > 0 && nextSet.size >= tiles.length) {
      await completeAndClearWorkspace();
    }
  };

  const runSequentialIndividualDownloads = async (targetTiles: SplitTile[]) => {
    if (targetTiles.length === 0) return;
    setIsBulkDownloading(true);
    try {
      // Trigger first file synchronously on user click for strict browser gesture allowance
      triggerDownload(targetTiles[0].blob, targetTiles[0].fileName);
      for (let i = 1; i < targetTiles.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 280));
        triggerDownload(targetTiles[i].blob, targetTiles[i].fileName);
      }
    } finally {
      setIsBulkDownloading(false);
    }
  };

  const handleDownloadIndividualFiles = async () => {
    if (tiles.length === 0) return;

    if (tiles.length === 1) {
      triggerDownload(tiles[0].blob, tiles[0].fileName);
      await completeAndClearWorkspace();
      return;
    }

    // Multiple files: open the Individual Files panel so every file remains 1-tap downloadable
    // even if the browser restricts automatic bulk downloads, and start sequential downloads.
    setShowIndividualFilesModal(true);
    await runSequentialIndividualDownloads(tiles);
  };

  const handleDownloadAllZip = async () => {
    if (tiles.length === 0) return;
    setIsZipping(true);
    try {
      let postingGuide = 'PIXORA SPLIT ARCHIVE\n====================\n';
      if (config.mode === 'grid' && config.rows === 3 && config.cols === 3) {
        postingGuide += 'INSTAGRAM 3x3 PROFILE GRID GUIDE:\nPost in reverse sequence (Tile 09 first, Tile 01 last) to assemble the full photo on your profile grid.\n';
      } else if (config.mode === 'rows') {
        postingGuide += 'HORIZONTAL ROWS:\nNumbered top to bottom (Row 01 is top section, subsequent files are next lower sections).\n';
      } else if (config.mode === 'columns') {
        postingGuide += 'VERTICAL COLUMNS:\nNumbered left to right (Col 01 is leftmost section, subsequent files are sections to the right).\n';
      } else if (config.mode === 'carousel') {
        postingGuide += 'SEAMLESS CAROUSEL:\nNumbered left to right (Slide 01 first, Slide 02 second, etc.) for a continuous panoramic swipe experience.\n';
      } else {
        postingGuide += 'TILES ORDER:\nTiles are sequenced row-by-row, left-to-right.\n';
      }
      postingGuide += `Total Slices: ${tiles.length}\nOriginal Image: ${imageState?.width} x ${imageState?.height} px\nPreservation: 100% original aspect ratio & pixel fidelity without stretching or cropping.`;

      const zipBlob = await createZipArchive(
        tiles,
        `${config.fileNamePrefix || 'pixora-tiles'}.zip`,
        postingGuide
      );
      triggerDownload(zipBlob, `${config.fileNamePrefix || 'pixora-tiles'}-all.zip`);

      await completeAndClearWorkspace();
    } catch (e) {
      console.error('ZIP generation failed', e);
    } finally {
      setIsZipping(false);
    }
  };

  // Change mode helper with smart prefix & dimensions defaults
  const handleSelectMode = (newMode: SplitMode) => {
    let newRows = config.rows;
    let newCols = config.cols;
    let newSlideCount = config.carouselSlideCount;
    let newPrefix = 'pixora-tile';

    if (newMode === 'grid') {
      newRows = config.rows > 1 ? config.rows : 3;
      newCols = config.cols > 1 ? config.cols : 3;
      newPrefix = 'pixora-grid';
    } else if (newMode === 'rows') {
      newRows = config.rows > 1 ? config.rows : 3;
      newCols = 1;
      newPrefix = 'pixora-row';
    } else if (newMode === 'columns') {
      newRows = 1;
      newCols = config.cols > 1 ? config.cols : 3;
      newPrefix = 'pixora-col';
    } else if (newMode === 'carousel') {
      newRows = 1;
      newCols = newSlideCount || 3;
      newSlideCount = newSlideCount >= 2 ? newSlideCount : 3;
      newPrefix = 'pixora-slide';
    }

    setConfig({
      ...config,
      mode: newMode,
      rows: newRows,
      cols: newCols,
      carouselSlideCount: newSlideCount,
      fileNamePrefix: newPrefix,
    });
  };

  const activeCols =
    config.mode === 'rows'
      ? 1
      : config.mode === 'columns'
      ? config.cols
      : config.mode === 'carousel'
      ? config.carouselSlideCount
      : config.cols;

  const activeRows =
    config.mode === 'rows'
      ? config.rows
      : config.mode === 'columns'
      ? 1
      : config.mode === 'carousel'
      ? 1
      : config.rows;

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
            Split photos into Profile Grids, Horizontal Rows, Vertical Columns, or Seamless Carousels with 100% original proportion preservation.
          </p>
        </div>

        <ImageDropzone
          onImageLoaded={handleImageLoaded}
          title="Upload image to split"
          subtitle="Works with portraits, landscapes, and squares. Zero stretching, squashing, or accidental cropping."
        />

        {/* 4 Tool Engines Overview */}
        <div className="mt-8 border-t border-[#171717]/10 pt-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#171717]/60 mb-4 text-center">
            4 Dedicated Splitting Tools Included
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 bg-white border border-[#171717]/10 rounded-xl text-left shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <Grid className="w-4 h-4 text-[#FF6B35]" />
                <span className="font-bold text-xs text-[#171717]">Profile Grid</span>
              </div>
              <p className="text-[11px] text-[#171717]/70 leading-relaxed">
                3×3, 2×2, 3×4, 1×3 or custom Rows × Cols. Divides photo into equal grid tiles that reconstruct the image perfectly.
              </p>
            </div>

            <div className="p-3.5 bg-white border border-[#171717]/10 rounded-xl text-left shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <Rows className="w-4 h-4 text-[#FF6B35]" />
                <span className="font-bold text-xs text-[#171717]">Horizontal Rows</span>
              </div>
              <p className="text-[11px] text-[#171717]/70 leading-relaxed">
                Divide an image into 2, 3, 4, 5+ horizontal sections from top to bottom while maintaining full width.
              </p>
            </div>

            <div className="p-3.5 bg-white border border-[#171717]/10 rounded-xl text-left shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <Columns className="w-4 h-4 text-[#FF6B35]" />
                <span className="font-bold text-xs text-[#171717]">Vertical Columns</span>
              </div>
              <p className="text-[11px] text-[#171717]/70 leading-relaxed">
                Divide an image into 2, 3, 4, 5+ vertical sections from left to right while maintaining full height.
              </p>
            </div>

            <div className="p-3.5 bg-white border border-[#171717]/10 rounded-xl text-left shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <GalleryHorizontal className="w-4 h-4 text-[#FF6B35]" />
                <span className="font-bold text-xs text-[#171717]">Seamless Carousel</span>
              </div>
              <p className="text-[11px] text-[#171717]/70 leading-relaxed">
                Divide panoramic or landscape photos into swipeable contiguous slides with zero seam gaps.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const imageAspectRatio = imageState.width / imageState.height;

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
            <span>/</span>
            <span className="text-[#FF6B35] font-semibold uppercase">
              {config.mode === 'grid'
                ? 'Profile Grid'
                : config.mode === 'rows'
                ? 'Rows Splitter'
                : config.mode === 'columns'
                ? 'Columns Splitter'
                : 'Seamless Carousel'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#171717] mt-0.5">
            {imageState.name}
          </h1>
          <div className="flex items-center gap-2 text-xs text-[#171717]/70 mt-1 font-mono flex-wrap">
            <span className="font-semibold text-[#171717]">{imageState.width} × {imageState.height} px</span>
            <span>·</span>
            <span>Ratio: {imageAspectRatio.toFixed(2)}:1</span>
            <span>·</span>
            <span>{formatBytes(imageState.size)}</span>
            <span>·</span>
            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[10px] font-bold">
              Original Proportions Preserved
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <DownloadOptions
            layout="header"
            onDownloadIndividual={handleDownloadIndividualFiles}
            onDownloadZip={handleDownloadAllZip}
            disabled={tiles.length === 0}
            isProcessing={isProcessing}
            isZipping={isZipping}
            individualMeta={`${tiles.length} ${tiles.length === 1 ? 'file' : 'files'}`}
            zipMeta=".zip"
          />

          <button
            onClick={handleReset}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#171717]/70 hover:text-[#171717] hover:bg-[#171717]/10 rounded-lg transition-colors cursor-pointer active:scale-95 self-end sm:self-auto"
            title="Start new image"
            aria-label="Reset workspace"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* LEFT / MAIN COLUMN: PREVIEW WORKSPACE */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-white/80 border border-[#171717]/10 rounded-xl p-3.5 sm:p-6 shadow-xs">
            {/* PREVIEW TOOLBAR */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-[#171717]/10 mb-4 gap-3">
              <div className="flex items-center gap-2">
                {/* Preview View Selector Tabs */}
                <div className="inline-flex p-1 bg-[#171717]/5 rounded-lg text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setPreviewView('assembled')}
                    className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                      previewView === 'assembled'
                        ? 'bg-white text-[#171717] font-semibold shadow-xs'
                        : 'text-[#171717]/70 hover:text-[#171717]'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-[#FF6B35]" />
                    <span>Assembled View</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewView('tiles')}
                    className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                      previewView === 'tiles'
                        ? 'bg-white text-[#171717] font-semibold shadow-xs'
                        : 'text-[#171717]/70 hover:text-[#171717]'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5 text-[#FF6B35]" />
                    <span>Separated Slices</span>
                  </button>

                  {config.mode === 'carousel' && (
                    <button
                      type="button"
                      onClick={() => setPreviewView('carousel')}
                      className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                        previewView === 'carousel'
                          ? 'bg-white text-[#171717] font-semibold shadow-xs'
                          : 'text-[#171717]/70 hover:text-[#171717]'
                      }`}
                    >
                      <GalleryHorizontal className="w-3.5 h-3.5 text-[#FF6B35]" />
                      <span>Swipe Simulator</span>
                    </button>
                  )}
                </div>

                <span className="text-xs text-[#171717]/50 font-mono hidden md:inline">
                  ({tiles.length} {tiles.length === 1 ? 'slice' : 'slices'}
                  {downloadedTileIndices.size > 0 && ` · ${downloadedTileIndices.size}/${tiles.length} saved`})
                </span>
              </div>

              {/* Instagram reverse order guide toggle for 3x3 */}
              {config.rows === 3 && config.cols === 3 && config.mode === 'grid' && (
                <button
                  type="button"
                  onClick={() => setShowInstagramOrder(!showInstagramOrder)}
                  className={`text-xs px-3 py-1.5 min-h-[36px] rounded-lg transition-colors font-medium border cursor-pointer active:scale-95 ${
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
            ) : previewView === 'assembled' ? (
              /* VIEW 1: ASSEMBLED FULL RECONSTRUCTION VIEW
                 Shows the original image in its exact aspect ratio, overlaid with high-precision cut lines
                 Zero distortion. Zero squashing. Zero cropping. */
              <div className="w-full flex flex-col items-center">
                <div
                  className="relative w-full max-w-full rounded-xl overflow-hidden border border-[#171717]/20 shadow-xs bg-[#171717]/5"
                  style={{
                    aspectRatio: `${imageState.width} / ${imageState.height}`,
                    maxHeight: '70vh',
                  }}
                >
                  {/* Base: Authentic original source image */}
                  <img
                    src={imageState.dataUrl}
                    alt="Original Assembled Preview"
                    className="w-full h-full object-contain pointer-events-none select-none block"
                  />

                  {/* Cut Lines & Interactive Tiles Overlay */}
                  <div
                    className="absolute inset-0 grid pointer-events-auto"
                    style={{
                      gridTemplateColumns: `repeat(${activeCols}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${activeRows}, minmax(0, 1fr))`,
                    }}
                  >
                    {tiles.map((tile) => {
                      const igOrderNumber =
                        config.rows === 3 && config.cols === 3 ? 10 - tile.index : tile.index;

                      return (
                        <div
                          key={tile.id}
                          onClick={() => setSelectedTilePreview(tile)}
                          className="relative border border-dashed border-[#FF6B35]/70 hover:bg-[#FF6B35]/15 transition-all cursor-pointer group flex flex-col justify-between p-1.5 sm:p-2"
                          title={`Click to inspect Tile #${tile.index} (${tile.width} × ${tile.height} px)`}
                        >
                          {/* Sequential Indicator Badge */}
                          <div className="flex items-center gap-1">
                            <span className="px-1.5 py-0.5 rounded bg-[#171717]/85 text-[#F7F5F0] text-[10px] sm:text-xs font-mono font-bold shadow-xs">
                              {showInstagramOrder ? `Post #${igOrderNumber}` : `#${tile.index}`}
                            </span>
                            {downloadedTileIndices.has(tile.index) && (
                              <span className="px-1 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-bold shadow-xs">
                                ✓
                              </span>
                            )}
                          </div>

                          {/* Hover action button & dimension badge */}
                          <div className="flex items-end justify-between gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="px-1.5 py-0.5 rounded bg-[#171717]/80 text-[#F7F5F0] text-[9px] sm:text-[10px] font-mono">
                              {tile.width}×{tile.height}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadSingleTile(tile);
                              }}
                              className="px-2 py-1 bg-[#FF6B35] text-white text-[10px] font-bold rounded shadow hover:bg-[#e05825] flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              <span className="hidden xs:inline">Save</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between w-full text-xs text-[#171717]/65">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Assembled View: 100% of the image is preserved. Dashed lines indicate exact cut boundaries.</span>
                  </span>
                  <span className="font-mono text-[11px] hidden sm:inline">
                    {activeRows} {activeRows === 1 ? 'row' : 'rows'} × {activeCols} {activeCols === 1 ? 'col' : 'cols'}
                  </span>
                </div>
              </div>
            ) : previewView === 'tiles' ? (
              /* VIEW 2: SEPARATED INDIVIDUAL SLICES
                 Each tile renders with ITS OWN TRUE ASPECT RATIO (tile.width / tile.height)
                 No aspect-square. No object-cover cropping. */
              <div>
                {config.mode === 'rows' ? (
                  /* Rows mode: Stack of wide horizontal rows */
                  <div className="flex flex-col gap-3 sm:gap-4">
                    {tiles.map((tile) => (
                      <div
                        key={tile.id}
                        className="bg-white border border-[#171717]/15 rounded-xl overflow-hidden shadow-2xs hover:border-[#FF6B35] transition-all p-2.5 sm:p-3"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-[#171717]/10 mb-2 text-xs font-mono text-[#171717]/70">
                          <span className="font-bold text-[#171717]">Row #{tile.row + 1} of {activeRows}</span>
                          <div className="flex items-center gap-3">
                            <span>{tile.width} × {tile.height} px</span>
                            <span>{formatBytes(tile.blob.size, 1)}</span>
                          </div>
                        </div>

                        {/* True proportional preview container */}
                        <div
                          className="relative w-full rounded-lg overflow-hidden bg-[#171717]/5 flex items-center justify-center border border-[#171717]/10"
                          style={{ aspectRatio: `${tile.width} / ${tile.height}` }}
                        >
                          <img
                            src={tile.dataUrl}
                            alt={tile.fileName}
                            className="w-full h-full block object-contain pointer-events-none"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-2.5 mt-1">
                          <span className="text-[11px] font-mono text-[#171717]/60 truncate">
                            {tile.fileName}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedTilePreview(tile)}
                              className="px-3 py-1.5 min-h-[36px] text-xs font-semibold text-[#171717] bg-[#171717]/5 hover:bg-[#171717]/10 rounded-lg transition flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Inspect</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadSingleTile(tile)}
                              className="px-3.5 py-1.5 min-h-[36px] text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Save Row</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : config.mode === 'columns' ? (
                  /* Columns mode: Row of tall vertical columns */
                  <div
                    className="grid gap-3 sm:gap-4 items-start"
                    style={{
                      gridTemplateColumns: `repeat(${activeCols}, minmax(0, 1fr))`,
                    }}
                  >
                    {tiles.map((tile) => (
                      <div
                        key={tile.id}
                        className="bg-white border border-[#171717]/15 rounded-xl overflow-hidden shadow-2xs hover:border-[#FF6B35] transition-all p-2 sm:p-2.5 flex flex-col"
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-[#171717]/10 mb-2 text-[11px] font-mono text-[#171717]/70">
                          <span className="font-bold text-[#171717]">Col #{tile.col + 1}</span>
                          <span className="hidden xs:inline">{formatBytes(tile.blob.size, 1)}</span>
                        </div>

                        {/* True proportional preview container */}
                        <div
                          className="relative w-full rounded-lg overflow-hidden bg-[#171717]/5 flex items-center justify-center border border-[#171717]/10"
                          style={{ aspectRatio: `${tile.width} / ${tile.height}` }}
                        >
                          <img
                            src={tile.dataUrl}
                            alt={tile.fileName}
                            className="w-full h-full block object-contain pointer-events-none"
                          />
                        </div>

                        <div className="pt-2 text-[10px] font-mono text-[#171717]/60 truncate">
                          {tile.width}×{tile.height}
                        </div>

                        <div className="flex items-center gap-1.5 pt-2 mt-auto">
                          <button
                            type="button"
                            onClick={() => setSelectedTilePreview(tile)}
                            className="flex-1 py-1.5 text-[11px] font-medium text-[#171717] bg-[#171717]/5 hover:bg-[#171717]/10 rounded transition text-center"
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleTile(tile)}
                            className="flex-1 py-1.5 text-[11px] font-bold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded transition text-center flex items-center justify-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : config.mode === 'carousel' ? (
                  /* Carousel mode: Continuous horizontal swipe track */
                  <div className="w-full">
                    <div className="flex gap-3 overflow-x-auto pb-4 pt-1 px-0.5 scrollbar-thin snap-x snap-mandatory">
                      {tiles.map((tile) => (
                        <div
                          key={tile.id}
                          className="group relative bg-white border border-[#171717]/15 rounded-xl overflow-hidden flex flex-col transition-all hover:border-[#FF6B35] snap-center shrink-0 w-[72vw] xs:w-[54vw] sm:w-[42vw] md:w-60 shadow-2xs p-2.5"
                        >
                          <div className="flex items-center justify-between pb-1.5 text-xs font-mono text-[#171717]/70">
                            <span className="font-bold text-[#171717]">Slide #{tile.index}</span>
                            <span>{tile.width}×{tile.height}</span>
                          </div>

                          {/* True proportional slide container */}
                          <div
                            className="relative w-full rounded-lg overflow-hidden bg-[#171717]/5 flex items-center justify-center border border-[#171717]/10"
                            style={{ aspectRatio: `${tile.width} / ${tile.height}` }}
                          >
                            <img
                              src={tile.dataUrl}
                              alt={tile.fileName}
                              className="w-full h-full block object-contain pointer-events-none"
                            />
                          </div>

                          <div className="flex items-center gap-2 pt-2.5 mt-2 border-t border-[#171717]/10">
                            <button
                              type="button"
                              onClick={() => setSelectedTilePreview(tile)}
                              className="flex-1 py-1.5 text-xs font-medium text-[#171717] bg-[#171717]/5 hover:bg-[#171717]/10 rounded-md transition text-center"
                            >
                              Inspect
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadSingleTile(tile)}
                              className="flex-1 py-1.5 text-xs font-bold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-md transition text-center flex items-center justify-center gap-1 shadow-xs"
                            >
                              <Download className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-[#171717]/60 mt-1 font-mono text-center">
                      ← Swipe horizontally to preview continuous slides →
                    </p>
                  </div>
                ) : (
                  /* Profile Grid mode: Multi-row x multi-col grid */
                  <div
                    className="grid gap-2 sm:gap-3 select-none"
                    style={{
                      gridTemplateColumns: `repeat(${activeCols}, minmax(0, 1fr))`,
                    }}
                  >
                    {tiles.map((tile) => {
                      const igOrderNumber =
                        config.rows === 3 && config.cols === 3 ? 10 - tile.index : tile.index;

                      return (
                        <div
                          key={tile.id}
                          className="group relative bg-white border border-[#171717]/15 rounded-lg overflow-hidden flex flex-col transition-all hover:border-[#FF6B35] p-1.5 sm:p-2 shadow-2xs"
                        >
                          {/* Proportional preview container using exact tile aspect ratio */}
                          <div
                            className="relative w-full rounded bg-[#171717]/5 flex items-center justify-center overflow-hidden border border-[#171717]/10"
                            style={{ aspectRatio: `${tile.width} / ${tile.height}` }}
                          >
                            <img
                              src={tile.dataUrl}
                              alt={tile.fileName}
                              className="w-full h-full block object-contain pointer-events-none"
                            />

                            {/* Tile Sequence Indicator */}
                            <div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded bg-[#171717]/80 text-[#F7F5F0] text-[10px] sm:text-[11px] font-mono shadow-xs backdrop-blur-xs">
                              {showInstagramOrder ? `Post #${igOrderNumber}` : `#${tile.index}`}
                            </div>

                            {/* Downloaded status badge */}
                            {downloadedTileIndices.has(tile.index) && (
                              <div className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs">
                                <Check className="w-3 h-3" />
                                <span className="hidden xs:inline">Saved</span>
                              </div>
                            )}

                            {/* Hover Action Overlay */}
                            <div className="absolute inset-0 bg-[#171717]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                              <button
                                type="button"
                                onClick={() => setSelectedTilePreview(tile)}
                                className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center bg-white text-[#171717] rounded-md hover:bg-[#F7F5F0] transition cursor-pointer"
                                title="Inspect tile"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadSingleTile(tile)}
                                className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center bg-[#FF6B35] text-white rounded-md hover:bg-[#e05825] transition cursor-pointer"
                                title="Download this tile"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Tile meta info footer + Always-accessible touch Save button */}
                          <div className="pt-1.5 text-[10px] sm:text-[11px] flex items-center justify-between gap-1 text-[#171717]/70 font-mono">
                            <span className="truncate">{tile.width}×{tile.height}</span>
                            <button
                              type="button"
                              onClick={() => handleDownloadSingleTile(tile)}
                              className="px-2 py-1 min-h-[28px] bg-[#FF6B35] hover:bg-[#e05825] text-white text-[10px] font-sans font-semibold rounded flex items-center gap-1 cursor-pointer shrink-0 active:scale-95"
                              title={`Download ${tile.fileName}`}
                            >
                              <Download className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* VIEW 3: CAROUSEL SWIPE SIMULATOR */
              tiles.length > 0 && (
                <div className="w-full flex flex-col items-center py-2">
                  <div className="w-full max-w-md bg-white border border-[#171717]/15 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#171717]/10 text-xs font-mono">
                      <span className="font-bold text-[#171717]">
                        Slide {carouselActiveSlide + 1} of {tiles.length}
                      </span>
                      <span className="text-[#171717]/60">
                        {tiles[carouselActiveSlide]?.width} × {tiles[carouselActiveSlide]?.height} px
                      </span>
                    </div>

                    {/* Single Slide Canvas at True Aspect Ratio */}
                    <div
                      className="relative w-full rounded-xl overflow-hidden bg-[#171717]/5 flex items-center justify-center border border-[#171717]/10 shadow-2xs"
                      style={{
                        aspectRatio: `${tiles[carouselActiveSlide]?.width || 1} / ${tiles[carouselActiveSlide]?.height || 1}`,
                      }}
                    >
                      <img
                        src={tiles[carouselActiveSlide]?.dataUrl}
                        alt={tiles[carouselActiveSlide]?.fileName}
                        className="w-full h-full block object-contain pointer-events-none"
                      />

                      {/* Previous Slide Button */}
                      {carouselActiveSlide > 0 && (
                        <button
                          type="button"
                          onClick={() => setCarouselActiveSlide(carouselActiveSlide - 1)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[#171717]/70 text-white hover:bg-[#171717] transition shadow-md cursor-pointer"
                          aria-label="Previous slide"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                      )}

                      {/* Next Slide Button */}
                      {carouselActiveSlide < tiles.length - 1 && (
                        <button
                          type="button"
                          onClick={() => setCarouselActiveSlide(carouselActiveSlide + 1)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[#171717]/70 text-white hover:bg-[#171717] transition shadow-md cursor-pointer"
                          aria-label="Next slide"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Slide Navigation Dots */}
                    <div className="flex items-center justify-center gap-1.5 mt-4">
                      {tiles.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCarouselActiveSlide(idx)}
                          className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer ${
                            carouselActiveSlide === idx
                              ? 'bg-[#FF6B35] w-6'
                              : 'bg-[#171717]/20 hover:bg-[#171717]/40'
                          }`}
                          aria-label={`Go to slide ${idx + 1}`}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-[#171717]/10 text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedTilePreview(tiles[carouselActiveSlide])}
                        className="px-3 py-1.5 text-xs font-semibold text-[#171717] bg-[#171717]/5 hover:bg-[#171717]/10 rounded-lg transition"
                      >
                        Inspect Slide
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadSingleTile(tiles[carouselActiveSlide])}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-lg transition flex items-center gap-1.5 shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Slide #{carouselActiveSlide + 1}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Guarantee Banner */}
          <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex items-start gap-3 shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-emerald-900">Zero Distortion & Seamless Reassembly Guarantee:</span>
              <p className="text-emerald-800/90 leading-relaxed">
                PIXORA uses pure integer remainder coordinate math directly from source image bitmap pixels. No forced square bounding, no CSS scaling, and no accidental edge cropping. When arranged back together, all slices reconstruct the exact original image down to the individual pixel.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: CONFIGURATION CONTROLS */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="bg-white/90 border border-[#171717]/10 rounded-xl p-5 shadow-xs flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#171717]/10">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171717]">
                Splitter Configuration
              </span>
              <Sliders className="w-4 h-4 text-[#171717]/50" />
            </div>

            {/* 4 Tool Selector Tabs */}
            <div>
              <label className="block text-xs font-semibold text-[#171717] mb-2">
                Choose Split Tool
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#171717]/5 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleSelectMode('grid')}
                  className={`py-2 px-2.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    config.mode === 'grid'
                      ? 'bg-white text-[#171717] shadow-xs font-bold'
                      : 'text-[#171717]/70 hover:text-[#171717]'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5 text-[#FF6B35]" />
                  <span>Profile Grid</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectMode('rows')}
                  className={`py-2 px-2.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    config.mode === 'rows'
                      ? 'bg-white text-[#171717] shadow-xs font-bold'
                      : 'text-[#171717]/70 hover:text-[#171717]'
                  }`}
                >
                  <Rows className="w-3.5 h-3.5 text-[#FF6B35]" />
                  <span>Rows</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectMode('columns')}
                  className={`py-2 px-2.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    config.mode === 'columns'
                      ? 'bg-white text-[#171717] shadow-xs font-bold'
                      : 'text-[#171717]/70 hover:text-[#171717]'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5 text-[#FF6B35]" />
                  <span>Columns</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectMode('carousel')}
                  className={`py-2 px-2.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    config.mode === 'carousel'
                      ? 'bg-white text-[#171717] shadow-xs font-bold'
                      : 'text-[#171717]/70 hover:text-[#171717]'
                  }`}
                >
                  <GalleryHorizontal className="w-3.5 h-3.5 text-[#FF6B35]" />
                  <span>Carousel</span>
                </button>
              </div>
            </div>

            {/* TOOL 1: PROFILE GRID CONTROLS */}
            {config.mode === 'grid' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#171717] mb-2">
                    Profile Grid Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { l: '3×3 Giant (IG)', r: 3, c: 3 },
                      { l: '2×2 Quad Grid', r: 2, c: 2 },
                      { l: '3×4 Tall Profile', r: 4, c: 3 },
                      { l: '1×3 Vertical Column', r: 3, c: 1 },
                      { l: '3×1 Wide Panorama', r: 1, c: 3 },
                      { l: '3×2 Wide Banner', r: 2, c: 3 },
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          setConfig({ ...config, rows: item.r, cols: item.c })
                        }
                        className={`text-xs py-2 px-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
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

                <div className="grid grid-cols-2 gap-3 pt-1">
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
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#171717]/20 rounded-lg font-mono focus:border-[#FF6B35] focus:outline-none"
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
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#171717]/20 rounded-lg font-mono focus:border-[#FF6B35] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TOOL 2: ROWS CONTROLS */}
            {config.mode === 'rows' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#171717] mb-2">
                    Horizontal Row Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { l: '2 Rows (Halves)', r: 2 },
                      { l: '3 Rows (Thirds)', r: 3 },
                      { l: '4 Rows (Fourths)', r: 4 },
                      { l: '5 Rows (Fifths)', r: 5 },
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setConfig({ ...config, rows: item.r, cols: 1 })}
                        className={`text-xs py-2 px-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          config.rows === item.r
                            ? 'bg-[#171717] text-white border-[#171717] font-semibold'
                            : 'bg-white border-[#171717]/15 text-[#171717]/80 hover:border-[#171717]/40'
                        }`}
                      >
                        {item.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-[#171717] mb-1.5">
                    <span>Number of Rows</span>
                    <span className="font-mono text-[#FF6B35] font-bold">{config.rows} Rows</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={config.rows}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        rows: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)),
                        cols: 1,
                      })
                    }
                    className="w-full accent-[#FF6B35]"
                  />
                  <div className="flex justify-between text-[11px] text-[#171717]/60 font-mono mt-1">
                    <span>1 Row (Full)</span>
                    <span>10 Rows</span>
                  </div>
                </div>
              </div>
            )}

            {/* TOOL 3: COLUMNS CONTROLS */}
            {config.mode === 'columns' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#171717] mb-2">
                    Vertical Column Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { l: '2 Columns (Halves)', c: 2 },
                      { l: '3 Columns (Thirds)', c: 3 },
                      { l: '4 Columns (Fourths)', c: 4 },
                      { l: '5 Columns (Fifths)', c: 5 },
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setConfig({ ...config, rows: 1, cols: item.c })}
                        className={`text-xs py-2 px-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          config.cols === item.c
                            ? 'bg-[#171717] text-white border-[#171717] font-semibold'
                            : 'bg-white border-[#171717]/15 text-[#171717]/80 hover:border-[#171717]/40'
                        }`}
                      >
                        {item.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-[#171717] mb-1.5">
                    <span>Number of Columns</span>
                    <span className="font-mono text-[#FF6B35] font-bold">{config.cols} Columns</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={config.cols}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        rows: 1,
                        cols: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)),
                      })
                    }
                    className="w-full accent-[#FF6B35]"
                  />
                  <div className="flex justify-between text-[11px] text-[#171717]/60 font-mono mt-1">
                    <span>1 Column (Full)</span>
                    <span>10 Columns</span>
                  </div>
                </div>
              </div>
            )}

            {/* TOOL 4: SEAMLESS CAROUSEL CONTROLS */}
            {config.mode === 'carousel' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#171717] mb-2">
                    Continuous Swipe Slides (2–10)
                  </label>
                  <div className="flex items-center gap-1.5 mb-3">
                    {[2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() =>
                          setConfig({ ...config, carouselSlideCount: num, cols: num, rows: 1 })
                        }
                        className={`flex-1 py-1.5 text-xs font-mono font-semibold rounded-lg border transition-colors cursor-pointer ${
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
                        cols: parseInt(e.target.value),
                        rows: 1,
                      })
                    }
                    className="w-full accent-[#FF6B35]"
                  />
                  <div className="flex justify-between text-[11px] text-[#171717]/60 font-mono mt-1">
                    <span>2 Slides</span>
                    <span>10 Slides</span>
                  </div>
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
                      className={`py-1 rounded text-center transition-colors cursor-pointer ${
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
                  placeholder="e.g. pixora-slice"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-[#171717]/20 rounded-lg font-mono focus:border-[#FF6B35] focus:outline-none"
                />
                <span className="block text-[11px] text-[#171717]/50 mt-1 font-mono">
                  Sample: {config.fileNamePrefix || 'tile'}-01.{config.format.split('/')[1]}
                </span>
              </div>
            </div>

            {/* Bottom Action: Individual Files (Primary) & ZIP (Secondary) */}
            <div className="pt-2 border-t border-[#171717]/10">
              <DownloadOptions
                layout="panel"
                onDownloadIndividual={handleDownloadIndividualFiles}
                onDownloadZip={handleDownloadAllZip}
                disabled={tiles.length === 0}
                isProcessing={isProcessing}
                isZipping={isZipping}
                individualMeta={`${tiles.length} ${tiles.length === 1 ? 'file' : 'files'}`}
                zipMeta=".zip"
              />
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
                Slice #{selectedTilePreview.index} Details
              </span>
              <button
                type="button"
                onClick={() => setSelectedTilePreview(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-xs font-bold text-[#171717]/60 hover:text-[#171717] p-1 rounded-md cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Clean uncropped inspection container */}
            <div className="w-full max-h-[42vh] bg-[#171717]/10 rounded-xl overflow-hidden flex items-center justify-center border border-[#171717]/15 p-2">
              <img
                src={selectedTilePreview.dataUrl}
                alt={selectedTilePreview.fileName}
                className="max-w-full max-h-[38vh] object-contain rounded"
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
                <span className="text-[#171717]/60 block text-[10px] uppercase">Aspect Ratio:</span>
                <span className="font-semibold">
                  {(selectedTilePreview.width / selectedTilePreview.height).toFixed(2)}:1
                </span>
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
                Close
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSingleTile(selectedTilePreview)}
                className="px-4 py-2 min-h-[44px] text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download This Slice</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* INDIVIDUAL FILES FALLBACK & DIRECT SAVE MODAL */}
      {showIndividualFilesModal && tiles.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/75 p-3 sm:p-4">
          <div className="bg-[#F7F5F0] border border-[#171717]/20 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh]">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#171717]/10">
              <div>
                <h2 className="font-bold text-base sm:text-lg text-[#171717]">
                  Download Individual Image Files ({tiles.length})
                </h2>
                <p className="text-xs text-[#171717]/70 mt-1 leading-relaxed">
                  {isBulkDownloading
                    ? 'Sending individual image files to your device...'
                    : 'Every file below is an independently usable image (no ZIP extraction required). If your browser blocks multiple automatic downloads, tap any file below to save it directly.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIndividualFilesModal(false)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center text-xs font-bold text-[#171717]/60 hover:text-[#171717] px-2.5 py-1.5 rounded-lg border border-[#171717]/15 bg-white cursor-pointer shrink-0"
              >
                ✕ Close
              </button>
            </div>

            {/* Individual File List (Scrollable, touch-friendly across Mobile/Tablet/Desktop) */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {tiles.map((tile) => {
                const isSaved = downloadedTileIndices.has(tile.index);
                const igOrderNumber =
                  config.rows === 3 && config.cols === 3 && config.mode === 'grid'
                    ? 10 - tile.index
                    : tile.index;

                return (
                  <div
                    key={tile.id}
                    className="bg-white border border-[#171717]/15 rounded-xl p-2.5 sm:p-3 flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-[#171717]/5 border border-[#171717]/10 overflow-hidden flex items-center justify-center shrink-0">
                        <img
                          src={tile.dataUrl}
                          alt={tile.fileName}
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-[#171717] font-mono truncate">
                            {tile.fileName}
                          </span>
                          {config.rows === 3 && config.cols === 3 && config.mode === 'grid' && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#171717]/5 text-[#171717]/70">
                              IG Post #{igOrderNumber}
                            </span>
                          )}
                          {isSaved && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Check className="w-2.5 h-2.5" />
                              Saved
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[#171717]/60 mt-0.5">
                          {tile.width} × {tile.height} px · {formatBytes(tile.blob.size)}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadSingleTile(tile, false)}
                      className={`px-3 sm:px-4 py-2 min-h-[40px] text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 ${
                        isSaved
                          ? 'bg-[#171717]/10 text-[#171717] hover:bg-[#171717]/15'
                          : 'bg-[#FF6B35] hover:bg-[#e05825] text-white shadow-xs'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isSaved ? 'Save Again' : 'Download'}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer: Retry bulk, Optional ZIP fallback, Finish & Clear */}
            <div className="pt-3 border-t border-[#171717]/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={() => runSequentialIndividualDownloads(tiles)}
                  disabled={isBulkDownloading}
                  className="px-3.5 py-2 min-h-[42px] text-xs font-semibold text-[#171717] bg-white hover:bg-[#171717]/5 border border-[#171717]/20 rounded-lg transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#FF6B35]" />
                  <span>{isBulkDownloading ? 'Downloading...' : 'Retry All Individual'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadAllZip}
                  disabled={isZipping}
                  className="px-3.5 py-2 min-h-[42px] text-xs font-semibold text-[#171717] bg-white hover:bg-[#171717]/5 border border-[#171717]/20 rounded-lg transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5 text-[#171717]/75" />
                  <span>{isZipping ? 'Packaging ZIP...' : 'Download as ZIP Instead'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={completeAndClearWorkspace}
                className="px-4 py-2 min-h-[42px] text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-[#FF6B35]" />
                <span>Done &amp; Clear Project</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
