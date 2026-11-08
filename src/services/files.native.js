import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
export async function exportFile(name, text, mime = 'application/json') {
  const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!result.granted) return false;
  const uri = await FileSystem.StorageAccessFramework.createFileAsync(result.directoryUri, name, mime);
  await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
  return true;
}
export async function shareFile(name, text, mime = 'application/json') {
  const uri = FileSystem.cacheDirectory + name;
  await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device. Use Save to files.');
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: name });
}
export async function importBackup() {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = result.assets[0];
  if (file.size > 50 * 1024 * 1024) throw new Error('Backup exceeds 50 MB.');
  return FileSystem.readAsStringAsync(file.uri);
}
export async function pickApk() {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/vnd.android.package-archive', copyToCacheDirectory: true });
  return result.canceled ? null : result.assets[0].uri;
}
