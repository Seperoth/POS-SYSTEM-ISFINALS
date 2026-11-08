import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import * as Network from 'expo-network';
export async function checkForUpdate() {
  if (Platform.OS !== 'android' || !Updates.isEnabled) return { status: 'unconfigured', message: 'Connect this project to Expo and install a release APK with updates enabled.' };
  const network = await Network.getNetworkStateAsync();
  if (network.type !== Network.NetworkStateType.WIFI || !network.isInternetReachable) return { status: 'offline', message: 'Connect to Wi-Fi to check for updates.' };
  const result = await Updates.checkForUpdateAsync();
  if (!result.isAvailable) return { status: 'current', message: 'You have the latest published update.' };
  await Updates.fetchUpdateAsync();
  return { status: 'ready', message: 'Update downloaded. Finish the current order, then restart.' };
}
export const applyUpdate = () => Updates.reloadAsync();
