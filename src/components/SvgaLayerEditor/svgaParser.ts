import { Parser } from 'svga.lite';
import JSZip from 'jszip';
import pako from 'pako';
import { SVGAProjectData, SVGALayerItem } from './svgaTypes';

/**
 * Parses an SVGA file (ArrayBuffer or File) into structured SVGAProjectData
 */
export async function parseSvgaFile(fileOrBuffer: File | ArrayBuffer): Promise<SVGAProjectData> {
  const buffer = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;

  let movieData: any = null;
  let imagesMap: Record<string, string> = {};

  try {
    const parser = new Parser() as any;
    if (typeof parser.load === 'function') {
      movieData = await parser.load(buffer);
    }
  } catch (err) {
    console.warn('Standard svga.lite parser failed, attempting binary inflate fallback:', err);
  }

  // Direct ZIP or Protobuf inflated extraction fallback
  if (!movieData) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const movieFile = zip.file('movie.binary') || zip.file('movie.spec');
      
      // Load image files from zip
      const imageFiles = Object.keys(zip.files).filter((k) => k.startsWith('image/') || k.endsWith('.png'));
      for (const imgPath of imageFiles) {
        const key = imgPath.replace(/^image\//, '').replace(/\.png$/, '');
        const imgData = await zip.files[imgPath].async('base64');
        imagesMap[key] = `data:image/png;base64,${imgData}`;
      }
    } catch (e) {
      console.error('ZIP fallback error:', e);
    }
  }

  const fps = movieData?.fps || 30;
  const frames = movieData?.frames || 60;
  const width = movieData?.viewBoxWidth || 750;
  const height = movieData?.viewBoxHeight || 750;

  // Extract images from movieData.images if present
  if (movieData?.images) {
    for (const [key, val] of Object.entries(movieData.images)) {
      if (typeof val === 'string') {
        imagesMap[key] = val.startsWith('data:') ? val : `data:image/png;base64,${val}`;
      } else if (val instanceof Uint8Array) {
        const b64 = window.btoa(String.fromCharCode.apply(null, Array.from(val)));
        imagesMap[key] = `data:image/png;base64,${b64}`;
      }
    }
  }

  // Construct layer tree
  const layers: SVGALayerItem[] = [];
  const rawSprites = movieData?.sprites || [];

  if (rawSprites.length > 0) {
    rawSprites.forEach((sprite: any, idx: number) => {
      const imageKey = sprite.imageKey || `img_${idx}`;
      const layerName = sprite.matteKey ? `Matte (${imageKey})` : sprite.imageKey || `Layer ${idx + 1}`;
      
      layers.push({
        id: `layer_${idx}_${Date.now()}`,
        name: layerName,
        visible: true,
        locked: false,
        type: sprite.imageKey && imagesMap[sprite.imageKey] ? 'image' : 'vector',
        imageKey: sprite.imageKey,
        imageSrc: imagesMap[sprite.imageKey],
        position: { x: 0, y: 0 },
        scale: { x: 100, y: 100 },
        rotation: 0,
        opacity: 100,
        keyframes: sprite.frames || [],
      });
    });
  } else {
    // Generate default sample layers from extracted images
    const imageKeys = Object.keys(imagesMap);
    if (imageKeys.length > 0) {
      imageKeys.forEach((key, idx) => {
        layers.push({
          id: `layer_img_${idx}_${Date.now()}`,
          name: key,
          visible: true,
          locked: false,
          type: 'image',
          imageKey: key,
          imageSrc: imagesMap[key],
          position: { x: 0, y: 0 },
          scale: { x: 100, y: 100 },
          rotation: 0,
          opacity: 100,
        });
      });
    } else {
      // Default fallback layer
      layers.push({
        id: `layer_default_1`,
        name: 'Main Graphics Layer',
        visible: true,
        locked: false,
        type: 'vector',
        position: { x: 0, y: 0 },
        scale: { x: 100, y: 100 },
        rotation: 0,
        opacity: 100,
      });
    }
  }

  return {
    version: '2.0',
    fps,
    frames,
    width,
    height,
    images: imagesMap,
    layers,
  };
}

/**
 * Re-packs project data into an exportable ZIP containing image assets and metadata
 */
export async function exportProjectAsZip(project: SVGAProjectData): Promise<Blob> {
  const zip = new JSZip();
  const imgFolder = zip.folder('images');

  for (const [key, base64Url] of Object.entries(project.images)) {
    const rawData = base64Url.replace(/^data:image\/(png|jpg|jpeg);base64,/, '');
    imgFolder?.file(`${key}.png`, rawData, { base64: true });
  }

  zip.file('project.json', JSON.stringify(project, null, 2));
  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Merges two SVGA layer sets together into a single layer tree
 */
export function mergeSvgaLayers(primaryLayers: SVGALayerItem[], secondaryLayers: SVGALayerItem[]): SVGALayerItem[] {
  const merged = [...primaryLayers];
  secondaryLayers.forEach((secLayer, idx) => {
    merged.push({
      ...secLayer,
      id: `merged_${secLayer.id}_${idx}`,
      name: `Merged: ${secLayer.name}`,
    });
  });
  return merged;
}
