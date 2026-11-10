/** Map 3D assets live under `public/map3d`, behind the app's base path. */
export function publicUrl(path: string): string {
  if (!path.startsWith("/data/") && !path.startsWith("/assets/")) return path;
  return `${import.meta.env.BASE_URL}map3d${path}`;
}
