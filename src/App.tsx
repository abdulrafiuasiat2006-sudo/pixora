import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { WelcomePage } from './components/auth/WelcomePage';
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { ForgotPasswordPage } from './components/auth/ForgotPasswordPage';
import { LandingPage } from './components/landing/LandingPage';
import { ToolsDashboard } from './components/dashboard/ToolsDashboard';
import { SplitterWorkspace } from './components/splitter/SplitterWorkspace';
import { CompressorWorkspace } from './components/compressor/CompressorWorkspace';
import { ResizerWorkspace } from './components/resizer/ResizerWorkspace';
import { CropperWorkspace } from './components/cropper/CropperWorkspace';
import { PresetsLibrary } from './components/presets/PresetsLibrary';
import { ProjectsWorkspace } from './components/projects/ProjectsWorkspace';
import { SettingsWorkspace } from './components/settings/SettingsWorkspace';
import { HelpWorkspace } from './components/help/HelpWorkspace';
import { LegalWorkspace } from './components/legal/LegalWorkspace';
import { QATestRunner } from './components/testing/QATestRunner';
import { AppBottomNav } from './components/common/AppBottomNav';
import { CookieConsentBanner } from './components/common/CookieConsentBanner';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { ImageFileState, SocialPreset, ToolType, SavedProject } from './types';
import { WifiOff, ShieldCheck, Lock } from 'lucide-react';

const PUBLIC_ROUTES = ['welcome', 'login', 'register', 'forgot-password', 'reset-password', 'legal', 'help'];

function AppContent() {
  const { isAuthenticated, isLoading, intendedRoute, setIntendedRoute } = useAuth();
  const isOnline = useOnlineStatus();

  // Navigation tab state - default to welcome if not authenticated, or dashboard if authenticated
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) return hash;
    return 'welcome';
  });

  // Cross-tool launch and project target states
  const [toolLaunch, setToolLaunch] = useState<{
    tool: ToolType;
    image?: ImageFileState;
    preset?: SocialPreset;
  } | null>(null);
  const [targetProject, setTargetProject] = useState<{
    tool: ToolType;
    id: string;
  } | null>(null);

  const navigateTo = (tab: string) => {
    setCurrentTab(tab);
    window.location.hash = tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sync with browser hash routing for bookmarks and browser back/forward buttons
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        setCurrentTab(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Central access control guard: enforce authentication across all protected features
  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      // If user is trying to access a protected page, capture intended destination & redirect to welcome
      if (!PUBLIC_ROUTES.includes(currentTab)) {
        setIntendedRoute(currentTab);
        navigateTo('welcome');
      }
    } else {
      // If authenticated user visits public welcome/login/register, send them to intended or dashboard
      if (['welcome', 'login', 'register'].includes(currentTab)) {
        const target = intendedRoute || 'dashboard';
        navigateTo(target);
      }
    }
  }, [isAuthenticated, isLoading, currentTab, intendedRoute, setIntendedRoute]);

  const handleStartToolWithImage = (tool: ToolType, image?: ImageFileState) => {
    setTargetProject(null);
    if (image) {
      setToolLaunch({ tool, image });
    } else {
      setToolLaunch(null);
    }
    navigateTo(tool);
  };

  const handleSelectPreset = (preset: SocialPreset, tool: ToolType) => {
    setTargetProject(null);
    setToolLaunch({ tool, preset });
    navigateTo(tool);
  };

  const handleOpenProject = (project: SavedProject) => {
    setToolLaunch(null);
    setTargetProject({ tool: project.tool, id: project.id });
    navigateTo(project.tool);
  };

  // Prevent flash of protected content while session token is being verified
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F5F0] text-[#171717] p-4">
        <div className="w-14 h-14 rounded-2xl bg-[#171717] flex items-center justify-center p-3 mb-5 shadow-sm animate-pulse">
          <ShieldCheck className="w-8 h-8 text-[#FF6B35]" />
        </div>
        <div className="flex items-center gap-2.5 text-sm font-bold text-[#171717]">
          <span className="w-4 h-4 border-2 border-[#FF6B35] border-t-transparent rounded-full animate-spin" />
          <span>Verifying Authorization Session...</span>
        </div>
        <p className="text-xs text-[#171717]/60 mt-2 font-medium">
          PIXORA Global Access Control Active
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F5F0] text-[#171717]">
      {/* Offline notification banner if user loses network */}
      {!isOnline && (
        <div className="bg-[#171717] text-[#F7F5F0] px-4 py-2 text-xs flex items-center justify-center gap-2 border-b border-[#FF6B35]">
          <WifiOff className="w-3.5 h-3.5 text-[#FF6B35]" />
          <span>
            <strong>Offline Mode Active:</strong> All image processing continues to work 100% on-device in your browser.
          </span>
        </div>
      )}

      {/* Global 3-Zone Header with dynamic auth state */}
      <Header
        currentTab={currentTab}
        onNavigate={navigateTo}
      />

      {/* Main Application Content Router */}
      <main className="flex-1 pb-24 md:pb-14">
        {/* PUBLIC DEDICATED AUTHENTICATION PAGES */}
        {currentTab === 'welcome' && <WelcomePage onNavigate={navigateTo} />}
        {currentTab === 'login' && <LoginPage onNavigate={navigateTo} />}
        {currentTab === 'register' && <RegisterPage onNavigate={navigateTo} />}
        {(currentTab === 'forgot-password' || currentTab === 'reset-password') && (
          <ForgotPasswordPage onNavigate={navigateTo} />
        )}

        {/* PUBLIC INFORMATIONAL PAGES */}
        {currentTab === 'help' && <HelpWorkspace />}
        {currentTab === 'legal' && <LegalWorkspace />}

        {/* PROTECTED APPLICATION WORKSPACES (Requires Authentication) */}
        {isAuthenticated && (
          <>
            {currentTab === 'home' && (
              <LandingPage
                onStartTool={handleStartToolWithImage}
                onNavigate={navigateTo}
              />
            )}

            {currentTab === 'dashboard' && (
              <ToolsDashboard
                onSelectTool={handleStartToolWithImage}
                onNavigate={navigateTo}
                onOpenProject={handleOpenProject}
              />
            )}

            {/* Persistent Tool Workspaces: Never unmount across tab switches so active project state is 100% preserved */}
            <div style={{ display: currentTab === 'splitter' ? 'block' : 'none' }}>
              <SplitterWorkspace
                initialImage={toolLaunch?.tool === 'splitter' ? toolLaunch.image : null}
                initialProjectId={targetProject?.tool === 'splitter' ? targetProject.id : undefined}
                initialPreset={
                  toolLaunch?.tool === 'splitter' && toolLaunch.preset?.useCase === 'grid'
                    ? { rows: 3, cols: 3, mode: 'grid' }
                    : toolLaunch?.tool === 'splitter' && toolLaunch.preset?.useCase === 'carousel'
                    ? { rows: 1, cols: 3, mode: 'carousel' }
                    : undefined
                }
                onClearLaunch={() => {
                  if (toolLaunch?.tool === 'splitter') setToolLaunch(null);
                  if (targetProject?.tool === 'splitter') setTargetProject(null);
                }}
                onNavigate={navigateTo}
              />
            </div>

            <div style={{ display: currentTab === 'compressor' ? 'block' : 'none' }}>
              <CompressorWorkspace
                initialImage={toolLaunch?.tool === 'compressor' ? toolLaunch.image : null}
                initialProjectId={targetProject?.tool === 'compressor' ? targetProject.id : undefined}
                initialTargetKB={
                  toolLaunch?.tool === 'compressor' && toolLaunch.preset?.maxFileSizeMB
                    ? toolLaunch.preset.maxFileSizeMB * 1024
                    : undefined
                }
                onClearLaunch={() => {
                  if (toolLaunch?.tool === 'compressor') setToolLaunch(null);
                  if (targetProject?.tool === 'compressor') setTargetProject(null);
                }}
              />
            </div>

            <div style={{ display: currentTab === 'resizer' ? 'block' : 'none' }}>
              <ResizerWorkspace
                initialImage={toolLaunch?.tool === 'resizer' ? toolLaunch.image : null}
                initialProjectId={targetProject?.tool === 'resizer' ? targetProject.id : undefined}
                initialDimensions={
                  toolLaunch?.tool === 'resizer' && toolLaunch.preset
                    ? { width: toolLaunch.preset.width, height: toolLaunch.preset.height }
                    : undefined
                }
                onClearLaunch={() => {
                  if (toolLaunch?.tool === 'resizer') setToolLaunch(null);
                  if (targetProject?.tool === 'resizer') setTargetProject(null);
                }}
              />
            </div>

            <div style={{ display: currentTab === 'cropper' ? 'block' : 'none' }}>
              <CropperWorkspace
                initialImage={toolLaunch?.tool === 'cropper' ? toolLaunch.image : null}
                initialProjectId={targetProject?.tool === 'cropper' ? targetProject.id : undefined}
                initialPreset={
                  toolLaunch?.tool === 'cropper' && toolLaunch.preset?.aspectRatioLabel === '1:1'
                    ? '1:1'
                    : toolLaunch?.tool === 'cropper' && toolLaunch.preset?.aspectRatioLabel === '4:5'
                    ? '4:5'
                    : toolLaunch?.tool === 'cropper' && toolLaunch.preset?.aspectRatioLabel === '16:9'
                    ? '16:9'
                    : toolLaunch?.tool === 'cropper' && toolLaunch.preset?.aspectRatioLabel === '9:16'
                    ? '9:16'
                    : toolLaunch?.tool === 'cropper' && toolLaunch.preset?.aspectRatioLabel === '3:1'
                    ? '3:1'
                    : 'free'
                }
                onClearLaunch={() => {
                  if (toolLaunch?.tool === 'cropper') setToolLaunch(null);
                  if (targetProject?.tool === 'cropper') setTargetProject(null);
                }}
              />
            </div>

            {currentTab === 'presets' && (
              <PresetsLibrary onSelectPreset={handleSelectPreset} />
            )}

            {currentTab === 'projects' && (
              <ProjectsWorkspace
                onOpenProject={handleOpenProject}
                onNavigate={navigateTo}
              />
            )}

            {currentTab === 'settings' && (
              <SettingsWorkspace
                onOpenAuth={() => navigateTo('login')}
                onNavigate={navigateTo}
              />
            )}

            {currentTab === 'qa' && <QATestRunner />}
          </>
        )}
      </main>

      {/* Global Minimalist Footer */}
      <Footer onNavigate={navigateTo} />

      {/* Touch-First App Bottom Navigation Bar (Hidden when unauthenticated) */}
      <AppBottomNav
        currentTab={currentTab}
        onNavigate={navigateTo}
      />

      {/* NDPA & GDPR Privacy and Cookie Consent Banner */}
      <CookieConsentBanner onOpenPrivacy={() => navigateTo('legal')} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
