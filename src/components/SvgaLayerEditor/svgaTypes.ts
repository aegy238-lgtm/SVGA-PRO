export interface SVGAKeyframe {
  frame: number;
  alpha?: number;
  transform?: {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
  };
  layout?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  shapes?: any[];
}

export interface SVGALayerItem {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  type: 'image' | 'vector' | 'group' | 'text';
  imageKey?: string;
  imageSrc?: string; // base64 or URL
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  opacity: number;
  keyframes?: SVGAKeyframe[];
  children?: SVGALayerItem[];
  blendMode?: string;
}

export interface SVGAProjectData {
  version: string;
  fps: number;
  frames: number;
  width: number;
  height: number;
  images: Record<string, string>; // key -> base64
  layers: SVGALayerItem[];
  audioUrl?: string;
}
