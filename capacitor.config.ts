import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'plus.xzt.socialflow',
  appName: 'SocialFlow',
  webDir: 'dist',
  android: {
    path: 'android',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
