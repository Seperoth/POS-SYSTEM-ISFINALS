export async function exportFile(name, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000); return true;
}
export const shareFile = exportFile;
export async function importBackup() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.oncancel = () => resolve(null);
    input.onchange = async () => { try { const file = input.files[0]; if (!file) return resolve(null); if (file.size > 50 * 1024 * 1024) throw new Error('Backup exceeds 50 MB.'); resolve(await file.text()); } catch (e) { reject(e); } };
    input.click();
  });
}
export async function pickApk() { throw new Error('Open Settings on the Android app to install an APK update.'); }
