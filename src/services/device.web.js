const unavailable = () => { throw new Error('Bluetooth printing and APK installation are available in the Android APK.'); };
export const pairedPrinters = unavailable;
export const printReceipt = unavailable;
export const bluetoothSettings = unavailable;
export const installApk = unavailable;
export const installSettings = unavailable;
export const installPermission = async () => false;
