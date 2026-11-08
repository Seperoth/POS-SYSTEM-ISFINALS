import { PermissionsAndroid, Platform } from 'react-native';
import PosDevice from '../../modules/pos-device';
async function ready() {
  if (Platform.OS !== 'android' || !PosDevice) throw new Error('Bluetooth printing requires the Universal POS Android APK. Expo Go cannot load the printer module.');
  if (Number(Platform.Version) >= 31) {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Allow Nearby devices permission to connect to the paired printer.');
  }
}
export async function pairedPrinters() { await ready(); return PosDevice.pairedPrinters(); }
export async function printReceipt(address, text, width) { await ready(); return PosDevice.printReceipt(address, text, width); }
export async function bluetoothSettings() { if (!PosDevice) throw new Error('Install the Android APK first.'); return PosDevice.bluetoothSettings(); }
export async function installPermission() { return PosDevice?.installPermission() || false; }
export async function installSettings() { return PosDevice?.installSettings(); }
export async function installApk(uri) { if (!PosDevice) throw new Error('Install the Android APK first.'); return PosDevice.installApk(uri); }
