import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ImageFormat } from '../../types';
import {
  User,
  Sliders,
  Shield,
  Trash2,
  LogOut,
  LogIn,
  Check,
  AlertTriangle,
  HardDrive,
  FileCode,
} from 'lucide-react';

interface SettingsWorkspaceProps {
  onOpenAuth: () => void;
  onNavigate: (tab: string) => void;
}

export const SettingsWorkspace: React.FC<SettingsWorkspaceProps> = ({
  onOpenAuth,
  onNavigate,
}) => {
  const { user, isAuthenticated, isGuest, preferences, updatePreferences, logout, deleteAccount } =
    useAuth();

  const [savedNotice, setSavedNotice] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleFormatChange = (fmt: ImageFormat) => {
    updatePreferences({ defaultFormat: fmt });
    showSaveToast();
  };

  const handleQualityChange = (q: number) => {
    updatePreferences({ defaultJpegQuality: q });
    showSaveToast();
  };

  const handleTemplateChange = (tmpl: string) => {
    updatePreferences({ defaultNamingTemplate: tmpl });
    showSaveToast();
  };

  const showSaveToast = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleSignOut = async () => {
    await logout();
    onNavigate('welcome');
  };

  const handleDeleteAll = async () => {
    await deleteAccount();
    setShowDeleteConfirm(false);
    onNavigate('welcome');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="pb-6 border-b border-[#171717]/10 mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#171717]/60">
            <span>Platform</span>
            <span>/</span>
            <span className="text-[#171717] font-medium">User Settings</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#171717] mt-1">
            Settings & Privacy
          </h1>
          <p className="mt-1 text-sm text-[#171717]/70">
            Customize default export formats, naming templates, local storage, and privacy controls.
          </p>
        </div>

        {savedNotice && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-md border border-emerald-200">
            <Check className="w-3.5 h-3.5" />
            <span>Preferences Saved</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-8">
        {/* SECTION 1: ACCOUNT PROFILE & SESSION */}
        <div className="bg-white/80 border border-[#171717]/12 rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-[#171717]/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#171717] flex items-center justify-center text-white font-bold text-sm">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#171717]">{user?.name}</h3>
                <span className="text-xs text-[#171717]/60 font-mono">{user?.email}</span>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleSignOut}
                className="px-3.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 border border-red-200 rounded-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </div>

          <div className="mt-4 text-xs text-[#171717]/70 leading-relaxed">
            {isGuest ? (
              <p>
                <strong>Guest Mode Active:</strong> You have full access to all image splitting, compression, resizing, and cropping engines. Your recent exports and preferences are stored exclusively on this local device.
              </p>
            ) : (
              <p>
                <strong>Authenticated Account:</strong> Your preferences and project records are synchronized to your session profile.
              </p>
            )}
          </div>
        </div>

        {/* SECTION 2: EXPORT DEFAULTS */}
        <div className="bg-white/80 border border-[#171717]/12 rounded-xl p-6 shadow-xs flex flex-col gap-5">
          <h3 className="text-sm font-bold text-[#171717] pb-3 border-b border-[#171717]/10 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#FF6B35]" />
            <span>Default Image Export Preferences</span>
          </h3>

          {/* Default Format */}
          <div>
            <label className="block text-xs font-semibold text-[#171717] mb-2">
              Default Output Format
            </label>
            <div className="grid grid-cols-3 gap-2 max-w-sm">
              {(['image/jpeg', 'image/png', 'image/webp'] as ImageFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => handleFormatChange(fmt)}
                  className={`py-2 px-3 text-xs font-mono font-medium rounded-md border text-center transition ${
                    preferences.defaultFormat === fmt
                      ? 'bg-[#171717] text-white border-[#171717] font-bold'
                      : 'bg-white border-[#171717]/20 text-[#171717]/75 hover:border-[#171717]/50'
                  }`}
                >
                  {fmt.split('/')[1].toUpperCase()}
                </button>
              ))}
            </div>
            <span className="block text-[11px] text-[#171717]/60 mt-1">
              New tool workspaces will initialize with this export format pre-selected.
            </span>
          </div>

          {/* Default Quality */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-[#171717] mb-1.5 max-w-sm">
              <span>Default JPEG/WebP Quality</span>
              <span className="font-mono">{preferences.defaultJpegQuality}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              value={preferences.defaultJpegQuality}
              onChange={(e) => handleQualityChange(parseInt(e.target.value))}
              className="max-w-sm w-full accent-[#FF6B35]"
            />
          </div>

          {/* Export File Naming Template */}
          <div>
            <label className="block text-xs font-semibold text-[#171717] mb-1.5">
              Export File Naming Convention
            </label>
            <input
              type="text"
              value={preferences.defaultNamingTemplate}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="max-w-sm w-full px-3 py-1.5 text-xs bg-white border border-[#171717]/20 rounded-md font-mono focus:border-[#FF6B35] focus:outline-none"
            />
            <span className="block text-[11px] text-[#171717]/60 mt-1 font-mono">
              Tokens: {'{name}'} = original filename, {'{tool}'} = active tool, {'{index}'} = tile sequence number.
            </span>
          </div>
        </div>

        {/* SECTION 3: PRIVACY & DATA PURGE */}
        <div className="bg-white/80 border border-[#171717]/12 rounded-xl p-6 shadow-xs flex flex-col gap-4">
          <h3 className="text-sm font-bold text-[#171717] pb-3 border-b border-[#171717]/10 flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#FF6B35]" />
            <span>On-Device Privacy & Data Management</span>
          </h3>

          <p className="text-xs text-[#171717]/70 leading-relaxed">
            PIXORA uses an on-device architecture. Images you open are decoded into local HTML5 Canvas memory buffers within your web browser. Neither your original photo nor your exported tiles are uploaded to external servers.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-[#171717]/10">
            <div>
              <span className="text-xs font-semibold text-[#171717] block">
                Purge All Local Cache & Reset Account
              </span>
              <span className="text-[11px] text-[#171717]/60 block">
                Deletes all saved project metadata, stored history, and custom settings from this device.
              </span>
            </div>

            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs text-[#171717]/70 hover:text-[#171717]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-xs"
                >
                  Yes, Delete Everything
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-md transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Purge Data</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
