import { readFileSync } from 'node:fs';
const release = JSON.parse(readFileSync(new URL('./release.json', import.meta.url), 'utf8'));
const environment = process.env.APP_ENV || 'development';
if (!['development', 'production'].includes(environment)) throw new Error('APP_ENV must be development or production.');
const development = environment === 'development';
export default {
  expo: {
    name: development ? 'POS ISFINALS Dev' : 'POS ISFINALS', slug: 'pos-system-isfinals', version: release.version,
    orientation: 'default', userInterfaceStyle: 'light', scheme: development ? 'pos-isfinals-dev' : 'pos-isfinals',
    platforms: ['android', 'web'],
    android: { package: `com.seperoth.possystemisfinals${development ? '.dev' : ''}`, versionCode: Number(process.env.POS_VERSION_CODE || release.androidVersionCode),
      permissions: ['android.permission.BLUETOOTH', 'android.permission.BLUETOOTH_ADMIN', 'android.permission.BLUETOOTH_CONNECT', 'android.permission.REQUEST_INSTALL_PACKAGES'],
      allowBackup: false },
    web: { name: development ? 'POS ISFINALS Development' : 'POS ISFINALS', bundler: 'metro', output: 'single' },
    plugins: ['expo-sqlite', 'expo-font', 'expo-sharing', 'expo-status-bar', './plugins/with-pos-device.cjs'],
    // Independent group project. Native changes require a new runtime and signed APK.
    runtimeVersion: development ? release.developmentRuntime : release.productionRuntime,
    updates: { enabled: false },
    extra: { updatesConfigured: false, appEnvironment: environment, codeVersion: release.version },
  },
};
