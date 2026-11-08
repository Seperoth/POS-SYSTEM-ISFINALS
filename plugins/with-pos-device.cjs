const { withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');
module.exports = config => {
  config = withAppBuildGradle(config, result => {
    if (!process.env.EAS_BUILD && !result.modResults.contents.includes('// Universal POS release signing')) {
      result.modResults.contents += `\n// Universal POS release signing\nif (System.getenv('POS_STORE_FILE')) {\n  android.signingConfigs.create('posRelease') {\n    storeFile file(System.getenv('POS_STORE_FILE'))\n    storePassword System.getenv('POS_STORE_PASSWORD')\n    keyAlias System.getenv('POS_KEY_ALIAS')\n    keyPassword System.getenv('POS_KEY_PASSWORD')\n  }\n  android.buildTypes.release.signingConfig = android.signingConfigs.posRelease\n} else {\n  tasks.matching { it.name == 'validateSigningRelease' }.configureEach {\n    doFirst { throw new GradleException('Build with npm run build:android so the permanent POS signing key is used.') }\n  }\n}\n`;
    }
    return result;
  });
  return withAndroidManifest(config, result => {
  const permissions = result.modResults.manifest['uses-permission'] || [];
  for (const permission of permissions) {
    if (['android.permission.BLUETOOTH', 'android.permission.BLUETOOTH_ADMIN'].includes(permission.$['android:name'])) permission.$['android:maxSdkVersion'] = '30';
  }
  return result;
  });
};
