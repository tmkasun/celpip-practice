//**dataURL to blob**
export function dataURLtoBlob(dataurl: string) {
  const arr = dataurl.split(",");
  if (arr.length < 1) {
    return null;
  }
  const matches = arr[0].match(/:(.*?);/);
  if (!matches) {
    return null;
  }
  const mime = matches[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

//**blob to dataURL**
export async function blobToDataURL(blob: Blob): Promise<string | null> {
  const a = new FileReader();
  return new Promise((resolve, reject) => {
    a.onload = function (e) {
      resolve(e.target?.result as string);
    };
    a.readAsDataURL(blob);
  });
}

export function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
