import {
  LayoutGrid,
  Grid3X3,
  Minimize2,
  Crop,
  Layers,
  FolderOpen,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AppBottomNavProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
}

export const AppBottomNav: React.FC<AppBottomNavProps> = ({ currentTab, onNavigate }) => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }
  const tabs = [
    {
      id: 'dashboard',
      label: 'Studio',
      icon: LayoutGrid,
    },
    {
      id: 'splitter',
      label: 'Splitter',
      icon: Grid3X3,
    },
    {
      id: 'compressor',
      label: 'Compress',
      icon: Minimize2,
    },
    {
      id: 'cropper',
      label: 'Crop',
      icon: Crop,
    },
    {
      id: 'presets',
      label: 'Presets',
      icon: Layers,
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: FolderOpen,
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#F7F5F0]/95 backdrop-blur-md border-t border-[#171717]/10 px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] shadow-lg select-none"
      aria-label="Mobile Bottom Navigation Bar"
    >
      <div className="max-w-md mx-auto grid grid-cols-6 items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            currentTab === tab.id ||
            (tab.id === 'cropper' && currentTab === 'resizer');

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center justify-center min-h-[48px] py-1 rounded-lg transition-all active:scale-95 ${
                isActive
                  ? 'text-[#FF6B35]'
                  : 'text-[#171717]/60 hover:text-[#171717]'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-110 stroke-[2.2]' : 'stroke-[1.8]'
                  }`}
                />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#FF6B35]" />
                )}
              </div>
              <span
                className={`text-[10px] tracking-tight mt-1 truncate ${
                  isActive ? 'font-bold text-[#171717]' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
