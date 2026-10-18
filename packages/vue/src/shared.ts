import type { SurfaceDeclaration } from "@et4proj/liquid-glass-core";

/** SurfaceDeclaration 顶层浅比较（shape 特判一层）；与 react 绑定层 sameDecl 同语义 */
export function sameDecl(a: SurfaceDeclaration, b: SurfaceDeclaration): boolean {
  if (a === b) return true;
  const k1 = Object.keys(a) as Array<keyof SurfaceDeclaration>;
  if (k1.length !== Object.keys(b).length) return false;
  for (const key of k1) {
    if (key === "shape") {
      if (a.shape?.kind !== b.shape?.kind || a.shape?.radius !== b.shape?.radius) return false;
    } else if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}
