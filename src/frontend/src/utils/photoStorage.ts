/**
 * Photo storage utility — compresses images and returns a base64 data URL.
 * Used for employee photos stored locally in Zustand/localStorage.
 */

export async function uploadPhoto(file: File): Promise<string> {
  const bytes = await compressImage(file);
  // Convert Uint8Array to base64 data URL for localStorage persistence
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "image/jpeg" });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function compressImage(file: File): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 400;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) => {
          blob!.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
        },
        "image/jpeg",
        0.8,
      );
    };
    img.src = objectUrl;
  });
}
