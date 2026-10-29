export type ToolType = 'splitter' | 'compressor' | 'resizer' | 'cropper' | 'presets' | 'projects' | 'settings' | 'help' | 'legal' | 'qa';

export type ImageFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageFileState {
  file: File;
  dataUrl: string;
  name: string;
  size: number;
  width: number;
  height: number;
  type: string;
  hasAlpha?: boolean;
}

export interface SplitTile {
  id: string;
  index: number;
  row: number;
  col: number;
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  fileName: string;
}

export type SplitMode = 'grid' | 'carousel';

export interface SplitConfig {
  mode: SplitMode;
  rows: number;
  cols: number;
  format: ImageFormat;
  quality: number;
  fileNamePrefix: string;
  carouselSlideCount: number;
  carouselAspect: '1:1' | '4:5';
}

export interface CompressionConfig {
  mode: 'target' | 'manual';
  targetUnit: 'KB' | 'MB';
  targetValue: number;
  manualQuality: number;
  format: ImageFormat;
  preserveTransparency: boolean;
  flattenColor: string; // hex, e.g. #FFFFFF
}

export interface CompressionResult {
  blob: Blob;
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
  qualityUsed: number;
  width: number;
  height: number;
  format: ImageFormat;
  hasAlphaWarning?: boolean;
}

export interface ResizeConfig {
  width: number;
  height: number;
  lockAspectRatio: boolean;
  originalAspectRatio: number;
  format: ImageFormat;
  quality: number;
  fileName: string;
}

export interface CropRect {
  x: number; // in pixels relative to natural image
  y: number;
  width: number;
  height: number;
}

export type CropAspectPreset = 'free' | '1:1' | '4:5' | '16:9' | '9:16' | '4:3' | '3:2' | '2:1' | '3:1';

export interface CropConfig {
  aspectPreset: CropAspectPreset;
  aspectRatio: number | null; // width / height or null for free
  rotation: number; // 0, 90, 180, 270
  flipHorizontal: boolean;
  flipVertical: boolean;
  format: ImageFormat;
  quality: number;
}

export type SocialPlatformId =
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'pinterest'
  | 'linkedin'
  | 'youtube'
  | 'x'
  | 'snapchat'
  | 'custom';

export interface SocialPreset {
  id: string;
  platform: SocialPlatformId;
  platformName: string;
  formatName: string;
  description: string;
  width: number;
  height: number;
  aspectRatioLabel: string;
  aspectRatioValue: number;
  supportedFormats: string[];
  maxFileSizeMB?: number;
  lastVerified: string;
  useCase: 'grid' | 'carousel' | 'single' | 'banner';
  recommendedTool: ToolType;
  notes?: string;
}

export type ProjectStatus = 'draft' | 'processing' | 'completed' | 'error';

export interface SavedProject {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  tool: ToolType;
  status?: ProjectStatus;
  thumbnailUrl?: string;
  originalFileName: string;
  originalWidth: number;
  originalHeight: number;
  originalSizeBytes: number;
  originalMimeType?: string;
  exportCount: number;
  configSummary: string;
  config?: any;
  hasStoredFile?: boolean;
}

export interface FullWorkspaceProject extends SavedProject {
  userId: string;
  originalDataUrl?: string;
  resultsData?: any;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  isGuest: boolean;
  createdAt: number;
  emailVerified?: boolean;
  preferences: UserPreferences;
}

export interface UserPreferences {
  defaultFormat: ImageFormat;
  defaultJpegQuality: number;
  defaultNamingTemplate: string; // e.g. '{name}-{tool}-{index}'
  autoClearHistoryDays: number;
  highPrecisionMode: boolean;
}
