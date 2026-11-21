export async function exportFile(name, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000); return true;
}
export const shareFile = exportFile;
async function importText(accept, maxSize, errorMessage) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept;
    input.oncancel = () => resolve(null);
    input.onchange = async () => { try { const file = input.files[0]; if (!file) return resolve(null); if (file.size > maxSize) throw new Error(errorMessage); resolve(await file.text()); } catch (e) { reject(e); } };
    input.click();
  });
}
export const importBackup = () => importText('.json,application/json', 50 * 1024 * 1024, 'Backup exceeds 50 MB.');
export const importForecast = () => importText('.csv,text/csv', 1024 * 1024, 'Forecast CSV exceeds 1 MB.');
export async function pickApk() { throw new Error('Open Settings on the Android app to install an APK update.'); }
