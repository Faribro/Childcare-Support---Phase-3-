import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.allianceindia.childcare',
  appName: 'Childcare Support',
  webDir: 'dist-client',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
