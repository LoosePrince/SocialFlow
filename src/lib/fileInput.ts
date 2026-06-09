function fallbackName(file: File, prefix: string): string {
  if (file.name) return file.name;
  const ext = file.type.split('/')[1]?.split(';')[0] || 'bin';
  return `${prefix}-${Date.now()}.${ext}`;
}

function normalizeFile(file: File, prefix: string): File {
  if (file.name) return file;
  return new File([file], fallbackName(file, prefix), { type: file.type || 'application/octet-stream' });
}

export function uploadFilesFromAnt(file: File, list: readonly unknown[], prefix = 'upload'): File[] {
  const source = list.length > 0 ? list : [file];
  const files = source
    .map((item) => {
      const maybeUploadFile = item as { originFileObj?: unknown };
      if (maybeUploadFile.originFileObj instanceof File) return maybeUploadFile.originFileObj;
      if (item instanceof File) return item;
      return null;
    })
    .filter((item): item is File => item instanceof File);
  return (files.length > 0 ? files : [file]).map((item) => normalizeFile(item, prefix));
}

export function filesFromDataTransfer(dataTransfer: DataTransfer | null, prefix = 'dropped'): File[] {
  return Array.from(dataTransfer?.files ?? []).map((file) => normalizeFile(file, prefix));
}

export function filesFromClipboard(clipboardData: DataTransfer | null, prefix = 'pasted'): File[] {
  const files = Array.from(clipboardData?.files ?? []);
  if (files.length > 0) return files.map((file) => normalizeFile(file, prefix));

  return Array.from(clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File)
    .map((file) => normalizeFile(file, prefix));
}
