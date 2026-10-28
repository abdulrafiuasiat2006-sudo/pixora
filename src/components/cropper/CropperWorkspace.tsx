import React, { useState, useEffect, useRef } from 'react';
import {
  ImageFileState,
  CropConfig,
  CropRect,
  CropAspectPreset,
  ImageFormat,
} from '../../types';
import { ImageDropzone } from '../common/ImageDropzone';
import {
  loadImageElement,
  cropImage,
  CropResult,
  triggerDownload,
  formatBytes,
} from '../../utils/imageEngine';
import { StorageService } from '../../services/storageService';
import {
  Crop,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Download,
  Check,
  BookmarkPlus,
  Sliders,
  Move,
  ZoomIn,
} from 'lucide-react';
import { ProjectWorkspaceBar } from '../common/ProjectWorkspaceBar';
import { ProjectPersistenceService } from '../../services/projectPersistenceService';
import { useAuth } from '../../context/AuthContext';
import { FullWorkspaceProject } from '../../types';

interface CropperWorkspaceProps {
  initialImage?: ImageFileState | null;
  initialPreset?: CropAspectPreset;
  initialProjectId?: string;
  onClearLaunch?: () => void;
}

export const CropperWorkspace: React.FC<CropperWorkspaceProps> = ({
  initialImage = null,
  initialPreset = 'free',
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

  const [config, setConfig] = useState<CropConfig>({
    aspectPreset: initialPreset,
    aspectRatio: null,
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    format: 'image/jpeg',
    quality: 90,
  });

  // Crop rectangle in natural pixel coordinates
  const [cropRect, setCropRect] = useState<CropRect>({
    x: 0,
    y: 0,
    width: 800,
    height: 800,
  });

  const [cropResult, setCropResult] = useState<CropResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // References for dragging
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragTypeRef = useRef<string | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<CropRect>({ x: 0, y: 0, width: 0, height: 0 });

  const applyLoadedProject = (proj: FullWorkspaceProject) => {
    setCurrentProject(proj);
    if (proj.config && Object.keys(proj.config).length > 0) {
      if (proj.config.cropConfig) {
        setConfig((prev) => ({ ...prev, ...proj.config.cropConfig }));
      } else if (proj.config.aspectPreset) {
        setConfig((prev) => ({ ...prev, ...proj.config }));
      }
      if (proj.config.cropRect) {
        setCropRect(proj.config.cropRect);
      }
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
            await ProjectPersistenceService.setActiveProject(userId, 'cropper', loaded.id);
            applyLoadedProject(loaded);
            setIsLoadingProject(false);
            return;
          }
        }

        if (initialImage) {
          const proj = ProjectPersistenceService.createNewProject(
            userId,
            'cropper',
            `Crop: ${initialImage.name}`
          );
          proj.originalDataUrl = initialImage.dataUrl;
          proj.originalFileName = initialImage.name;
          proj.originalSizeBytes = initialImage.size;
          proj.originalWidth = initialImage.width;
          proj.originalHeight = initialImage.height;
          proj.originalMimeType = initialImage.type;
          proj.config = { cropConfig: config, cropRect };
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
          const active = await ProjectPersistenceService.getActiveProject(userId, 'cropper');
          if (active && active.status !== 'completed' && active.originalDataUrl && !isCancelled) {
            applyLoadedProject(active);
          } else if (!isCancelled) {
            setCurrentProject(null);
            setImageState(null);
          }
        }
      } catch (err) {
        console.error('Failed to restore cropper project:', err);
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

  // Load image
  useEffect(() => {
    if (imageState) {
      loadImageElement(imageState.dataUrl)
        .then((img) => {
          setLoadedImgElement(img);
          // Initialize crop rect to center 80% of image
          const initW = Math.round(img.naturalWidth * 0.8);
          const initH = Math.round(img.naturalHeight * 0.8);
          const initX = Math.round((img.naturalWidth - initW) / 2);
          const initY = Math.round((img.naturalHeight - initH) / 2);

          setCropRect({
            x: initX,
            y: initY,
            width: initW,
            height: initH,
          });
        })
        .catch((e) => console.error('Image load failed', e));
    } else {
      setLoadedImgElement(null);
      setCropResult(null);
    }
  }, [imageState]);

  // Adjust crop rect when aspect ratio preset changes
  const applyAspectPreset = (preset: CropAspectPreset) => {
    let ratio: number | null = null;
    switch (preset) {
      case '1:1':
        ratio = 1.0;
        break;
      case '4:5':
        ratio = 4 / 5;
        break;
      case '16:9':
        ratio = 16 / 9;
        break;
      case '9:16':
        ratio = 9 / 16;
        break;
      case '4:3':
        ratio = 4 / 3;
        break;
      case '3:2':
        ratio = 3 / 2;
        break;
      case '2:1':
        ratio = 2.0;
        break;
      case '3:1':
        ratio = 3.0;
        break;
      case 'free':
      default:
        ratio = null;
        break;
    }

    setConfig((prev) => ({
      ...prev,
      aspectPreset: preset,
      aspectRatio: ratio,
    }));

    if (loadedImgElement && ratio !== null) {
      const maxW = loadedImgElement.naturalWidth;
      const maxH = loadedImgElement.naturalHeight;

      let newW = cropRect.width;
      let newH = Math.round(newW / ratio);

      if (newH > maxH) {
        newH = maxH;
        newW = Math.round(newH * ratio);
      }
      if (newW > maxW) {
        newW = maxW;
        newH = Math.round(newW / ratio);
      }

      const newX = Math.max(0, Math.min(cropRect.x, maxW - newW));
      const newY = Math.max(0, Math.min(cropRect.y, maxH - newH));

      setCropRect({
        x: newX,
        y: newY,
        width: newW,
        height: newH,
      });
    }
  };

  // Recompute cropped result
  useEffect(() => {
    if (!loadedImgElement) return;

    let isMounted = true;
    setIsProcessing(true);

    const debounceTimer = setTimeout(() => {
      cropImage(loadedImgElement, cropRect, config)
        .then((res) => {
          if (isMounted) {
            setCropResult(res);
            setIsProcessing(false);
          }
        })
        .catch((e) => {
          console.error('Crop failed', e);
          if (isMounted) setIsProcessing(false);
        });
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(debounceTimer);
    };
  }, [loadedImgElement, cropRect, config]);

  // Rotation controls
  const handleRotateCw = () => {
    setConfig((prev) => ({ ...prev, rotation: (prev.rotation + 90) % 360 }));
  };

  const handleRotateCcw = () => {
    setConfig((prev) => ({ ...prev, rotation: (prev.rotation + 270) % 360 }));
  };

  const handleFlipH = () => {
    setConfig((prev) => ({ ...prev, flipHorizontal: !prev.flipHorizontal }));
  };

  const handleFlipV = () => {
    setConfig((prev) => ({ ...prev, flipVertical: !prev.flipVertical }));
  };

  // Dragging logic
  const handlePointerDown = (e: React.PointerEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    dragTypeRef.current = type;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    initialRectRef.current = { ...cropRect };

    const handlePointerMove = (moveEv: PointerEvent) => {
      if (!isDraggingRef.current || !loadedImgElement || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const scaleX = loadedImgElement.naturalWidth / containerRect.width;
      const scaleY = loadedImgElement.naturalHeight / containerRect.height;

      const deltaX = (moveEv.clientX - dragStartPos.current.x) * scaleX;
      const deltaY = (moveEv.clientY - dragStartPos.current.y) * scaleY;

      const imgW = loadedImgElement.naturalWidth;
      const imgH = loadedImgElement.naturalHeight;
      const init = initialRectRef.current;

      if (dragTypeRef.current === 'move') {
        const nextX = Math.max(0, Math.min(imgW - init.width, init.x + deltaX));
        const nextY = Math.max(0, Math.min(imgH - init.height, init.y + deltaY));
        setCropRect({
          ...init,
          x: Math.round(nextX),
          y: Math.round(nextY),
        });
      } else if (dragTypeRef.current === 'se') {
        // Bottom-right handle
        let nextW = Math.max(50, Math.min(imgW - init.x, init.width + deltaX));
        let nextH = Math.max(50, Math.min(imgH - init.y, init.height + deltaY));

        if (config.aspectRatio) {
          nextH = Math.round(nextW / config.aspectRatio);
          if (init.y + nextH > imgH) {
            nextH = imgH - init.y;
            nextW = Math.round(nextH * config.aspectRatio);
          }
        }

        setCropRect({
          ...init,
          width: Math.round(nextW),
          height: Math.round(nextH),
        });
      } else if (dragTypeRef.current === 'nw') {
        // Top-left handle
        let nextX = Math.max(0, Math.min(init.x + init.width - 50, init.x + deltaX));
        let nextY = Math.max(0, Math.min(init.y + init.height - 50, init.y + deltaY));
        let nextW = init.width - (nextX - init.x);
        let nextH = init.height - (nextY - init.y);

        if (config.aspectRatio) {
          nextH = Math.round(nextW / config.aspectRatio);
        }

        setCropRect({
          x: Math.round(nextX),
          y: Math.round(nextY),
          width: Math.round(nextW),
          height: Math.round(nextH),
        });
      } else if (dragTypeRef.current === 'ne') {
        // Top-right handle
        let nextW = Math.max(50, Math.min(imgW - init.x, init.width + deltaX));
        let nextY = Math.max(0, Math.min(init.y + init.height - 50, init.y + deltaY));
        let nextH = init.height - (nextY - init.y);

        if (config.aspectRatio) {
          nextH = Math.round(nextW / config.aspectRatio);
          nextY = init.y + init.height - nextH;
        }

        setCropRect({
          ...init,
          y: Math.max(0, Math.round(nextY)),
          width: Math.round(nextW),
          height: Math.round(nextH),
        });
      } else if (dragTypeRef.current === 'sw') {
        // Bottom-left handle
        let nextX = Math.max(0, Math.min(init.x + init.width - 50, init.x + deltaX));
        let nextW = init.width - (nextX - init.x);
        let nextH = Math.max(50, Math.min(imgH - init.y, init.height + deltaY));

        if (config.aspectRatio) {
          nextH = Math.round(nextW / config.aspectRatio);
        }

        setCropRect({
          ...init,
          x: Math.round(nextX),
          width: Math.round(nextW),
          height: Math.round(nextH),
        });
      }
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      dragTypeRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Debounced auto-save
  useEffect(() => {
    if (!currentProject || !imageState) return;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const configSummary = `${config.aspectPreset.toUpperCase()} Crop (${cropRect.width}×${cropRect.height} px, rot ${config.rotation}°)`;

        const updated: FullWorkspaceProject = {
          ...currentProject,
          config: {
            cropConfig: config,
            cropRect,
          },
          configSummary,
          status: 'draft',
          exportCount: 1,
          originalFileName: imageState.name,
          originalWidth: imageState.width,
          originalHeight: imageState.height,
          originalSizeBytes: imageState.size,
          originalMimeType: imageState.type,
          originalDataUrl: imageState.dataUrl,
          thumbnailUrl: cropResult?.dataUrl || imageState.dataUrl,
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
  }, [config, cropRect, cropResult, imageState]);

  const handleImageLoaded = (newImg: ImageFileState) => {
    const proj =
      currentProject && !currentProject.originalFileName
        ? { ...currentProject, title: `Crop: ${newImg.name}` }
        : ProjectPersistenceService.createNewProject(userId, 'cropper', `Crop: ${newImg.name}`);

    proj.originalDataUrl = newImg.dataUrl;
    proj.originalFileName = newImg.name;
    proj.originalSizeBytes = newImg.size;
    proj.originalWidth = newImg.width;
    proj.originalHeight = newImg.height;
    proj.originalMimeType = newImg.type;
    proj.config = { cropConfig: config, cropRect };
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
        await ProjectPersistenceService.setActiveProject(userId, 'cropper', proj.id);
        applyLoadedProject(proj);
      }
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleClearProject = async () => {
    await ProjectPersistenceService.setActiveProject(userId, 'cropper', null);
    setImageState(null);
    setLoadedImgElement(null);
    setCropResult(null);
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
    if (!cropResult || !imageState) return;
    const baseName = imageState.name.replace(/\.[^/.]+$/, '');
    const ext = config.format.split('/')[1] === 'jpeg' ? 'jpg' : config.format.split('/')[1];
    triggerDownload(cropResult.blob, `${baseName}-cropped.${ext}`);

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
    await ProjectPersistenceService.setActiveProject(userId, 'cropper', null);

    // Reset workspace to empty upload state
    setImageState(null);
    setLoadedImgElement(null);
    setCropResult(null);
    setCurrentProject(null);
    setSaveStatus('idle');
  };

  const aspectPresetsList: { id: CropAspectPreset; label: string; desc: string }[] = [
    { id: 'free', label: 'Freeform', desc: 'Any dimension' },
    { id: '1:1', label: '1:1 Square', desc: 'Feed / Avatar' },
    { id: '4:5', label: '4:5 Portrait', desc: 'Instagram' },
    { id: '16:9', label: '16:9 Landscape', desc: 'YouTube / X' },
    { id: '9:16', label: '9:16 Story', desc: 'TikTok / Reel' },
    { id: '4:3', label: '4:3 Standard', desc: 'Classic photo' },
    { id: '3:2', label: '3:2 Classic', desc: '35mm SLR' },
    { id: '3:1', label: '3:1 Header', desc: 'X Banner' },
  ];

  if (isLoadingProject) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <span className="w-8 h-8 border-3 border-[#FF6B35] border-t-transparent rounded-full animate-spin inline-block mb-3" />
        <p className="text-sm font-semibold text-[#171717]">Restoring Cropper Workspace State...</p>
        <p className="text-xs text-[#171717]/60 mt-1">Retrieving persistent project files and configurations</p>
      </div>
    );
  }

  if (!imageState) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <ProjectWorkspaceBar
          tool="cropper"
          currentProjectId={currentProject?.id}
          currentTitle={currentProject?.title || 'Untitled Crop Project'}
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          onRenameTitle={handleRenameTitle}
          onSelectProject={handleSelectProject}
          onNewProject={handleNewProject}
          onClearProject={handleClearProject}
          hasActiveProject={false}
        />

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Image Cropper</h1>
          <p className="mt-1 text-sm text-[#171717]/70">
            Interactive draggable crop box with social aspect ratios, 90° rotation, and live pixel extraction.
          </p>
        </div>

        <ImageDropzone
          onImageLoaded={handleImageLoaded}
          title="Upload image to crop"
          subtitle="Coordinate-exact pixel extraction. Rotate, flip, and crop with zero distortion."
        />

        <div className="mt-8 border-t border-[#171717]/10 pt-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#171717]/60 mb-3 text-center">
            Standard Aspect Ratio Presets
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {aspectPresetsList.map((p) => (
              <div
                key={p.id}
                className="p-3 bg-white/60 border border-[#171717]/10 rounded-lg text-left"
              >
                <div className="font-semibold text-xs text-[#171717]">{p.label}</div>
                <div className="text-[11px] text-[#171717]/60 mt-0.5">{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Calculate percentage positions for crop box overlay
  const maxW = loadedImgElement?.naturalWidth || 1;
  const maxH = loadedImgElement?.naturalHeight || 1;
  const cropLeftPct = (cropRect.x / maxW) * 100;
  const cropTopPct = (cropRect.y / maxH) * 100;
  const cropWidthPct = (cropRect.width / maxW) * 100;
  const cropHeightPct = (cropRect.height / maxH) * 100;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Persistent Project Workspace Bar */}
      <ProjectWorkspaceBar
        tool="cropper"
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
            <span className="text-[#171717] font-medium">Image Cropper</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#171717] mt-0.5">
            {imageState.name}
          </h1>
          <div className="flex items-center gap-2 text-xs text-[#171717]/70 mt-1 font-mono">
            <span>Crop Area: {cropRect.width} × {cropRect.height} px</span>
            <span>·</span>
            <span>Ratio: {(cropRect.width / cropRect.height).toFixed(2)}:1</span>
            {cropResult && (
              <>
                <span>·</span>
                <span className="font-semibold text-[#FF6B35]">
                  Output: {formatBytes(cropResult.sizeBytes)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownload}
            disabled={!cropResult || isProcessing}
            className="px-4 py-2 min-h-[42px] text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#e05825] rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download ({cropResult ? `${cropResult.width}×${cropResult.height}` : '...'})</span>
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
        {/* LEFT COLUMN: INTERACTIVE CROP CANVAS & PREVIEW */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-white/80 border border-[#171717]/10 rounded-xl p-3.5 sm:p-6 shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#171717]/10">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#171717]">
                Interactive Crop Viewport
              </span>

              {/* Transformation actions toolbar */}
              <div className="flex items-center gap-1 bg-[#171717]/5 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={handleRotateCcw}
                  className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center hover:bg-white text-[#171717] rounded-md transition active:scale-95"
                  title="Rotate 90° Counter-Clockwise"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRotateCw}
                  className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center hover:bg-white text-[#171717] rounded-md transition active:scale-95"
                  title="Rotate 90° Clockwise"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-[#171717]/15 mx-0.5" />
                <button
                  type="button"
                  onClick={handleFlipH}
                  className={`p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-md transition active:scale-95 ${
                    config.flipHorizontal ? 'bg-white shadow-xs text-[#FF6B35]' : 'hover:bg-white text-[#171717]'
                  }`}
                  title="Flip Horizontally"
                >
                  <FlipHorizontal className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleFlipV}
                  className={`p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-md transition active:scale-95 ${
                    config.flipVertical ? 'bg-white shadow-xs text-[#FF6B35]' : 'hover:bg-white text-[#171717]'
                  }`}
                  title="Flip Vertically"
                >
                  <FlipVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* CROP WORKSPACE FRAME */}
            <div className="relative min-h-[280px] xs:min-h-[340px] sm:min-h-[420px] max-h-[560px] bg-[#171717]/10 rounded-xl overflow-hidden flex items-center justify-center p-3 select-none touch-none">
              <div
                ref={containerRef}
                className="relative max-w-full max-h-[480px] shadow-sm inline-block"
                style={{
                  transform: `rotate(${config.rotation}deg) scale(${config.flipHorizontal ? -1 : 1}, ${config.flipVertical ? -1 : 1})`,
                }}
              >
                {/* Base Image */}
                <img
                  src={imageState.dataUrl}
                  alt="Crop base"
                  className="max-w-full max-h-[480px] object-contain block pointer-events-none"
                />

                {/* Shaded Scrim around Crop Box */}
                <div className="absolute inset-0 bg-black/40 pointer-events-none" />

                {/* Active Interactive Crop Box */}
                <div
                  className="absolute border-2 border-white shadow-2xl cursor-move pointer-events-auto touch-none"
                  style={{
                    left: `${cropLeftPct}%`,
                    top: `${cropTopPct}%`,
                    width: `${cropWidthPct}%`,
                    height: `${cropHeightPct}%`,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                  }}
                  onPointerDown={(e) => handlePointerDown(e, 'move')}
                >
                  {/* Rule of Thirds Grid Lines */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                    <div className="border-r border-b border-white/30" />
                    <div className="border-r border-b border-white/30" />
                    <div className="border-b border-white/30" />
                    <div className="border-r border-b border-white/30" />
                    <div className="border-r border-b border-white/30" />
                    <div className="border-b border-white/30" />
                    <div className="border-r border-white/30" />
                    <div className="border-r border-white/30" />
                    <div />
                  </div>

                  {/* Corner Drag Handles with large accessible touch hit-zones */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'nw')}
                    className="absolute -top-4 -left-4 w-9 h-9 flex items-center justify-center cursor-nwse-resize touch-none z-30"
                    title="Resize Top-Left"
                  >
                    <div className="w-3.5 h-3.5 bg-white border border-[#171717] rounded-xs shadow-sm" />
                  </div>

                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'ne')}
                    className="absolute -top-4 -right-4 w-9 h-9 flex items-center justify-center cursor-nesw-resize touch-none z-30"
                    title="Resize Top-Right"
                  >
                    <div className="w-3.5 h-3.5 bg-white border border-[#171717] rounded-xs shadow-sm" />
                  </div>

                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'sw')}
                    className="absolute -bottom-4 -left-4 w-9 h-9 flex items-center justify-center cursor-nesw-resize touch-none z-30"
                    title="Resize Bottom-Left"
                  >
                    <div className="w-3.5 h-3.5 bg-white border border-[#171717] rounded-xs shadow-sm" />
                  </div>

                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'se')}
                    className="absolute -bottom-4 -right-4 w-9 h-9 flex items-center justify-center cursor-nwse-resize touch-none z-30"
                    title="Resize Bottom-Right"
                  >
                    <div className="w-3.5 h-3.5 bg-[#FF6B35] border border-white rounded-xs shadow-sm" />
                  </div>

                  {/* Center Dimension Badge */}
                  <div className="absolute bottom-2 left-2 z-20 px-2 py-0.5 rounded bg-[#171717]/80 text-[#F7F5F0] text-[10px] font-mono pointer-events-none backdrop-blur-xs">
                    {cropRect.width} × {cropRect.height} px
                  </div>
                </div>
              </div>
            </div>

            {/* LIVE CROPPED RESULT PREVIEW */}
            {cropResult && (
              <div className="border-t border-[#171717]/10 pt-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-24 h-24 bg-[#171717]/5 rounded-lg border border-[#171717]/15 flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    src={cropResult.dataUrl}
                    alt="Cropped preview"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-[#171717] block">Export Preview & Metrics</span>
                  <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[#171717]/80">
                    <div>Size: {cropResult.width}×{cropResult.height} px</div>
                    <div>Bytes: {formatBytes(cropResult.sizeBytes)}</div>
                    <div>Format: {config.format.split('/')[1].toUpperCase()}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: PRESETS & CONTROLS */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="bg-white/90 border border-[#171717]/10 rounded-xl p-5 shadow-xs flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#171717]/10">
              <span className="text-xs font-bold uppercase tracking-wider text-[#171717]">
                Aspect Ratio Presets
              </span>
              <Crop className="w-4 h-4 text-[#171717]/50" />
            </div>

            {/* Aspect Presets Matrix */}
            <div className="grid grid-cols-2 gap-2">
              {aspectPresetsList.map((p) => {
                const isSelected = config.aspectPreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyAspectPreset(p.id)}
                    className={`p-2.5 min-h-[44px] rounded-lg border text-left transition-colors cursor-pointer active:scale-98 ${
                      isSelected
                        ? 'bg-[#171717] text-white border-[#171717]'
                        : 'bg-white border-[#171717]/15 text-[#171717]/80 hover:border-[#171717]/40'
                    }`}
                  >
                    <div className="text-xs font-semibold">{p.label}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">{p.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Manual Crop Dimension Inputs */}
            <div className="pt-2 border-t border-[#171717]/10">
              <label className="block text-xs font-semibold text-[#171717] mb-2">
                Pixel Coordinates (Manual)
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-[11px] text-[#171717]/60 block mb-0.5">X Offset</span>
                  <input
                    type="number"
                    min={0}
                    max={maxW}
                    value={cropRect.x}
                    onChange={(e) =>
                      setCropRect({
                        ...cropRect,
                        x: Math.max(0, parseInt(e.target.value) || 0),
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-[#171717]/20 rounded focus:border-[#FF6B35] focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-[#171717]/60 block mb-0.5">Y Offset</span>
                  <input
                    type="number"
                    min={0}
                    max={maxH}
                    value={cropRect.y}
                    onChange={(e) =>
                      setCropRect({
                        ...cropRect,
                        y: Math.max(0, parseInt(e.target.value) || 0),
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-[#171717]/20 rounded focus:border-[#FF6B35] focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-[#171717]/60 block mb-0.5">Width</span>
                  <input
                    type="number"
                    min={10}
                    max={maxW}
                    value={cropRect.width}
                    onChange={(e) =>
                      setCropRect({
                        ...cropRect,
                        width: Math.max(10, parseInt(e.target.value) || 10),
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-[#171717]/20 rounded focus:border-[#FF6B35] focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-[#171717]/60 block mb-0.5">Height</span>
                  <input
                    type="number"
                    min={10}
                    max={maxH}
                    value={cropRect.height}
                    onChange={(e) =>
                      setCropRect({
                        ...cropRect,
                        height: Math.max(10, parseInt(e.target.value) || 10),
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-[#171717]/20 rounded focus:border-[#FF6B35] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Output Format */}
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

            {/* Download Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!cropResult || isProcessing}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#171717] hover:bg-[#171717]/90 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-[#FF6B35]" />
                <span>
                  Download Cropped ({cropResult ? `${cropResult.width}×${cropResult.height}` : '...'})
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
