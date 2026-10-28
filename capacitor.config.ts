export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    androidScheme?: string;
    cleartext?: boolean;
    url?: string;
  };
  plugins?: Record<string, any>;
}

const config: CapacitorConfig = {
  appId: 'app.pixora.imageutility',
  appName: 'PIXORA',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#F7F5F0',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#F7F5F0',
    },
  },
};

export default config;

