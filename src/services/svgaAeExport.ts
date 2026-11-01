import * as pakoNs from 'pako';
import * as protobufNs from 'protobufjs';
import * as jszipNs from 'jszip';
import * as upngNs from 'upng-js';
import { SVGPathData } from 'svg-pathdata';

const pako: any = (pakoNs as any).default || pakoNs;
const protobuf: any = (protobufNs as any).default || protobufNs;
const JSZip: any = (jszipNs as any).default || jszipNs;
const UPNG: any = (upngNs as any).default || upngNs;

// ES3-compatible After Effects JSX importer script string
export const AE_IMPORTER_SCRIPT_SOURCE = `function aeImporter(data) {
  var progress = null, undo = false, errors = [], assets = [], layerMap = [], lastUpdate = 0;
  var root = new File($.fileName).parent;
  function prop(layer, name) {return layer.property('ADBE Transform Group').property(name);}
  function setKeys(property, times, values, spatial) {
    if(!values.length)return;
    var keyTimes=[Math.max(0,times[0]-0.00001)],keyValues=[values[0]];
    for(var k=1;k<values.length;k++)if(!sameValue(values[k],values[k-1])){keyTimes.push(Math.max(0,times[k]-0.00001));keyValues.push(values[k]);}
    if(keyValues.length===1){property.setValue(keyValues[0]);return;}
    property.setValuesAtTimes(keyTimes, keyValues);
    var count=property.numKeys;
    for(var i=1;i<=count;i++) {
      property.setInterpolationTypeAtKey(i,KeyframeInterpolationType.HOLD,KeyframeInterpolationType.HOLD);
    }
  }
  function sameValue(a,b) {
    if(a===b)return true;
    if(a instanceof Array&&b instanceof Array&&a.length===b.length){for(var i=0;i<a.length;i++)if(!sameValue(a[i],b[i]))return false;return true;}
    return false;
  }
  function imageGroups(segments) {
    var groups=[],indices={};
    for(var i=0;i<segments.length;i++){
      var segment=segments[i],key='asset_'+segment.asset,index=indices[key];
      if(index===undefined){index=groups.length;indices[key]=index;groups.push({asset:segment.asset,ranges:[]});}
      groups[index].ranges.push(segment);
    }
    return groups;
  }
  function pathValue(source) {
    var result=new Shape();
    result.vertices=source.vertices;result.inTangents=source.inTangents;result.outTangents=source.outTangents;result.closed=source.closed;
    return result;
  }
  function update(percent,text) {
    var now=new Date().getTime();
    if(progress&&(percent===100||now-lastUpdate>=200)){progress.bar.value=percent;progress.label.text=text;progress.win.update();lastUpdate=now;}
  }
  function applyBlend(layer,mode) {
    var m=String(mode||'NORMAL').toUpperCase().replace(/[- ]/g,'_');
    var map={NORMAL:'NORMAL',ADD:'ADD',PLUS:'ADD',LIGHTER:'ADD',SCREEN:'SCREEN',MULTIPLY:'MULTIPLY',OVERLAY:'OVERLAY',DARKEN:'DARKEN',LIGHTEN:'LIGHTEN',COLOR_DODGE:'COLOR_DODGE',COLOR_BURN:'COLOR_BURN',HARD_LIGHT:'HARD_LIGHT',SOFT_LIGHT:'SOFT_LIGHT',DIFFERENCE:'DIFFERENCE',EXCLUSION:'EXCLUSION',HUE:'HUE',SATURATION:'SATURATION',COLOR:'COLOR',LUMINOSITY:'LUMINOSITY'};
    if(map[m]) {try{layer.blendingMode=BlendingMode[map[m]];}catch(e){errors.push('Blend mode: '+m);}}
    else errors.push('Unknown blend mode: '+m);
  }
  function transforms(layer,sprite,helper,startFrame,endFrame,ranges) {
    var times=[],positions=[],scales=[],rotations=[],opacities=[],pRot=[],pScale=[],pPos=[];
    prop(layer,'ADBE Anchor Point').setValue([0,0]);
    var rangeIndex=0,lastRow=null;
    for(var f=startFrame||0;f<(endFrame===undefined?sprite.rows.length:endFrame);f++) {
      var active=true,r=sprite.rows[f];
      if(ranges){
        while(rangeIndex<ranges.length&&f>=ranges[rangeIndex].endFrame)rangeIndex++;
        active=rangeIndex<ranges.length&&f>=ranges[rangeIndex].startFrame;
        if(!active){if(!lastRow)continue;r=lastRow;lastRow=null;}else lastRow=r;
      }
      times.push(f/data.fps);opacities.push(active?r[6]:0);
      positions.push(helper?[0,0]:[r[0],r[1]]);
      scales.push(helper?[100,100]:[r[2],r[3]]);
      rotations.push(helper?r[5]:r[4]);
      pRot.push(r[4]);pScale.push([r[2],r[3]]);pPos.push([r[0],r[1]]);
    }
    if(helper) {
      layer.parent=helper;
      if(!helper.comment) {
        var helperTimes=[];pRot=[];pScale=[];pPos=[];
        for(var f=0;f<sprite.rows.length;f++){var r=sprite.rows[f];helperTimes.push(f/data.fps);pRot.push(r[4]);pScale.push([r[2],r[3]]);pPos.push([r[0],r[1]]);}
        prop(helper,'ADBE Anchor Point').setValue([0,0]);
        setKeys(prop(helper,'ADBE Position'),helperTimes,pPos,true);
        setKeys(prop(helper,'ADBE Scale'),helperTimes,pScale,false);
        setKeys(prop(helper,'ADBE Rotate Z'),helperTimes,pRot,false);
        helper.comment='Affine transform parent';
      }
    }
    setKeys(prop(layer,'ADBE Position'),times,positions,true);
    setKeys(prop(layer,'ADBE Scale'),times,scales,false);
    setKeys(prop(layer,'ADBE Rotate Z'),times,rotations,false);
    var opacityTimes=times;
    if(ranges){
      opacityTimes=times.slice(0);
      if(startFrame>0){opacityTimes.unshift(0);opacities.unshift(0);}
      opacityTimes.push(endFrame/data.fps);opacities.push(0);
    }
    setKeys(prop(layer,'ADBE Opacity'),opacityTimes,opacities,false);
    layer.inPoint=0;layer.outPoint=data.duration;
    var visible=false;for(var i=0;i<opacities.length;i++)if(opacities[i]>0){visible=true;break;}
    layer.enabled=visible;
  }
  function shapes(layer,sprite) {
    var content=layer.property('ADBE Root Vectors Group'),states=sprite.shapeStates,max=0,times=[];
    for(var f=0;f<states.length;f++){max=Math.max(max,states[f].length);times.push(f/data.fps);}
    for(var j=0;j<max;j++) {
      var group=content.addProperty('ADBE Vector Group');group.name='Shape '+(j+1);
      var groupIndex=group.propertyIndex;
      var contents=group.property('ADBE Vectors Group'),maxPaths=0,reference=null;
      for(var f=0;f<states.length;f++)if(states[f][j]) {reference=states[f][j];maxPaths=Math.max(maxPaths,reference.paths.length);}
      for(var k=0;k<maxPaths;k++) {
        contents=content.property(groupIndex).property('ADBE Vectors Group');
        var path=contents.addProperty('ADBE Vector Shape - Group').property('ADBE Vector Shape');
        var last=reference.paths[Math.min(k,reference.paths.length-1)],values=[];
        for(var f=0;f<states.length;f++) {
          var s=states[f][j];if(s&&s.paths[k])last=s.paths[k];
          var v=last;
          if(!s||!s.paths[k])v={vertices:[[0,0],[0,0]],inTangents:[[0,0],[0,0]],outTangents:[[0,0],[0,0]],closed:true};
          values.push(pathValue(v));
        }
        setKeys(path,times,values,false);
      }
      contents=content.property(groupIndex).property('ADBE Vectors Group');
      var fill=contents.addProperty('ADBE Vector Graphic - Fill'),fillIndex=fill.propertyIndex;
      contents=content.property(groupIndex).property('ADBE Vectors Group');
      var stroke=contents.addProperty('ADBE Vector Graphic - Stroke'),strokeIndex=stroke.propertyIndex;
      group=content.property(groupIndex);contents=group.property('ADBE Vectors Group');
      fill=contents.property(fillIndex);stroke=contents.property(strokeIndex);
      var fillColors=[],fillOpacity=[],strokeColors=[],strokeOpacity=[],widths=[],visibility=[];
      for(var f=0;f<states.length;f++) {
        var s=states[f][j],style=s?s.styles:{},fc=style.fill,sc=style.stroke;
        fillColors.push(fc?[fc.r||0,fc.g||0,fc.b||0]:[0,0,0]);fillOpacity.push(fc?(fc.a===undefined?1:fc.a)*100:0);
        strokeColors.push(sc?[sc.r||0,sc.g||0,sc.b||0]:[0,0,0]);strokeOpacity.push(sc?(sc.a===undefined?1:sc.a)*100:0);
        widths.push(style.strokeWidth||0);visibility.push(s?100:0);
      }
      setKeys(fill.property('ADBE Vector Fill Color'),times,fillColors,false);
      setKeys(fill.property('ADBE Vector Fill Opacity'),times,fillOpacity,false);
      setKeys(stroke.property('ADBE Vector Stroke Color'),times,strokeColors,false);
      setKeys(stroke.property('ADBE Vector Stroke Opacity'),times,strokeOpacity,false);
      setKeys(stroke.property('ADBE Vector Stroke Width'),times,widths,false);
      setKeys(group.property('ADBE Vector Transform Group').property('ADBE Vector Group Opacity'),times,visibility,false);
      var style=reference.styles;
      try {
        var cap=String(style.lineCap||0).toUpperCase(),join=String(style.lineJoin||0).toUpperCase();
        stroke.property('ADBE Vector Stroke Line Cap').setValue(cap==='1'||cap==='ROUND'?2:cap==='2'||cap==='SQUARE'?3:1);
        stroke.property('ADBE Vector Stroke Line Join').setValue(join==='1'||join==='ROUND'||join==='ROUND_JOIN'?2:join==='2'||join==='BEVEL'?3:1);
        if(style.miterLimit>0)stroke.property('ADBE Vector Stroke Miter Limit').setValue(style.miterLimit);
        if(style.lineDashI>0) {
          var dash=stroke.property('ADBE Vector Stroke Dashes');dash.addProperty('ADBE Vector Stroke Dash 1').setValue(style.lineDashI);
          if(style.lineDashII>0)dash.addProperty('ADBE Vector Stroke Gap 1').setValue(style.lineDashII);
          if(style.lineDashIII)dash.addProperty('ADBE Vector Stroke Offset').setValue(style.lineDashIII);
        }
      }catch(e){errors.push('Stroke settings: '+sprite.name);}
    }
  }
  function masks(layer,sprite) {
    if(sprite.clipBaked)return;
    var states=sprite.clipStates,max=0,times=[];
    for(var f=0;f<states.length;f++){max=Math.max(max,states[f]?states[f].length:0);times.push(f/data.fps);}
    var all={vertices:[[-100000,-100000],[100000,-100000],[100000,100000],[-100000,100000]],inTangents:[[0,0],[0,0],[0,0],[0,0]],outTangents:[[0,0],[0,0],[0,0],[0,0]],closed:true};
    for(var i=0;i<max;i++) {
      var mask=layer.property('ADBE Mask Parade').addProperty('ADBE Mask Atom');mask.name='SVGA clip '+(i+1);mask.maskMode=MaskMode.ADD;
      var values=[];
      for(var f=0;f<states.length;f++) {
        var empty={vertices:[[0,0],[0,0]],inTangents:[[0,0],[0,0]],outTangents:[[0,0],[0,0]],closed:true};
        values.push(pathValue(states[f]&&states[f][i]?states[f][i]:!states[f]&&i===0?all:empty));
      }
      setKeys(mask.property('ADBE Mask Shape'),times,values,false);
    }
  }
  try {
    if(!app.project)app.newProject();
    for(var i=0;i<data.assets.length;i++) {
      var info=data.assets[i],file=new File(root.fsName+'/'+info.file);
      if(!file.exists)throw new Error('Missing asset: '+info.file+'\\nExtract the complete ZIP and keep assets/ beside this JSX.');
      if(info.files)for(var f=0;f<info.files.length;f++)if(!new File(root.fsName+'/'+info.files[f]).exists)throw new Error('Missing sequence frame: '+info.files[f]);
    }
    app.beginUndoGroup('SVGA to After Effects: '+data.name);undo=true;
    var win=new Window('palette','SVGA to After Effects');win.orientation='column';win.alignChildren='fill';
    var label=win.add('statictext',undefined,'Importing assets...');label.preferredSize=[400,22];
    var bar=win.add('progressbar',undefined,0,100);bar.preferredSize=[400,16];win.center();win.show();progress={win:win,bar:bar,label:label};
    var comp=app.project.items.addComp(data.name,data.width,data.height,1,data.duration,data.fps);
    var assetFolder=app.project.items.addFolder(data.name+' - Assets');
    for(var i=0;i<data.assets.length;i++) {
      var file=new File(root.fsName+'/'+data.assets[i].file),options=new ImportOptions(file);options.sequence=data.assets[i].kind==='sequence';
      if(options.sequence)options.forceAlphabetical=true;
      var footage=app.project.importFile(options);footage.parentFolder=assetFolder;assets.push(footage);
      try{if(data.assets[i].kind==='image'||data.assets[i].kind==='sequence')footage.mainSource.alphaMode=AlphaMode.STRAIGHT;}catch(e){}
      if(data.assets[i].kind==='sequence')footage.mainSource.conformFrameRate=data.fps;
      update(15*(i+1)/Math.max(1,data.assets.length),'Importing '+data.assets[i].key);
    }
    for(var i=0;i<data.layers.length;i++) {
      var sprite=data.layers[i],targets=[],helper=null;
      if(sprite.needsParent) {
        helper=comp.layers.addNull(data.duration);helper.name='[Transform] '+sprite.name;helper.shy=true;helper.guideLayer=true;
      }
      if(sprite.image!==null) {
        if(sprite.imageSegments) {
          var groups=imageGroups(sprite.imageSegments);
          for(var s=0;s<groups.length;s++){
            var group=groups[s],first=group.ranges[0],last=group.ranges[group.ranges.length-1],image=comp.layers.add(assets[group.asset]);
            image.name=sprite.name+' [PNG '+(s+1)+']';image.startTime=0;
            image.comment='SVGA sprite '+(i+1)+'; shared PNG, '+group.ranges.length+' appearance(s)';
            image.audioEnabled=true;
            transforms(image,sprite,helper,first.startFrame,last.endFrame,group.ranges);applyBlend(image,sprite.blendMode);
            image.inPoint=0;image.outPoint=data.duration;
            targets.push(image);
          }
        } else {
          var image=comp.layers.add(assets[sprite.image]);image.name=sprite.name;image.startTime=0;image.audioEnabled=true;targets.push(image);
          if(sprite.sourceFrames&&data.assets[sprite.image].kind==='sequence') {
            image.timeRemapEnabled=true;
            var remap=image.property('ADBE Time Remapping'),times=[],sourceTimes=[];
            while(remap.numKeys)remap.removeKey(remap.numKeys);
            for(var f=0;f<sprite.sourceFrames.length;f++){times.push(f/data.fps);sourceTimes.push(sprite.sourceFrames[f]/data.fps);}
            setKeys(remap,times,sourceTimes,false);
          }
        }
      }
      var hasShapes=false;for(var f=0;f<sprite.shapeStates.length;f++)if(sprite.shapeStates[f].length){hasShapes=true;break;}
      if(hasShapes) {
        var vector=comp.layers.addShape();vector.name=sprite.name+(targets.length?' - Shapes':'');shapes(vector,sprite);targets.push(vector);
        if(sprite.imageSegments){transforms(vector,sprite,helper);masks(vector,sprite);applyBlend(vector,sprite.blendMode);}
      }
      if(!targets.length) {var empty=comp.layers.addShape();empty.name=sprite.name;targets.push(empty);if(sprite.imageSegments)transforms(empty,sprite,helper);}
      if(!sprite.imageSegments)for(var j=0;j<targets.length;j++){transforms(targets[j],sprite,helper);masks(targets[j],sprite);applyBlend(targets[j],sprite.blendMode);}
      layerMap[i]=targets;
      update(15+75*(i+1)/Math.max(1,data.layers.length),'Building layer '+(i+1)+' / '+data.layers.length);
    }
    for(var i=0;i<data.layers.length;i++) {
      var key=data.layers[i].matteKey;if(!key)continue;
      var targetIndex=-1;
      for(var j=0;j<data.layers.length;j++)if(j!==i&&data.layers[j].imageKey===key){targetIndex=j;break;}
      if(targetIndex<0){errors.push('Matte not found: '+key);continue;}
      if(layerMap[targetIndex].length!==1){errors.push('Composite matte requires manual review: '+key);continue;}
      var source=layerMap[targetIndex][0];source.enabled=false;
      for(var j=0;j<layerMap[i].length;j++) {
        var target=layerMap[i][j],copy=source.duplicate();copy.name='[Matte] '+data.layers[i].name;copy.enabled=true;copy.shy=true;
        copy.moveBefore(target);
        if(typeof target.setTrackMatte==='function')target.setTrackMatte(copy,TrackMatteType.ALPHA);
        else target.trackMatteType=TrackMatteType.ALPHA;
      }
    }
    for(var i=0;i<data.audios.length;i++) {
      var audio=data.audios[i],layer=comp.layers.add(assets[audio.asset]);layer.name='Audio - '+audio.audioKey;
      var begin=audio.startFrame/data.fps,end=Math.min(data.duration,audio.endFrame/data.fps);
      if(end<=begin)throw new Error('Invalid audio frame range: '+audio.audioKey);
      layer.startTime=begin-(audio.startTime||0)/1000;layer.inPoint=begin;layer.outPoint=end;
      layer.moveToEnd();
    }
    comp.hideShyLayers=true;comp.openInViewer();update(100,'Complete');
    if(errors.length)alert('Composition created. Review these items:\\n'+errors.join('\\n'));
  } catch(error) {
    alert('SVGA import failed:\\n'+error.toString()+'\\nLine: '+(error.line||'?'));
  } finally {
    if(progress)try{progress.win.close();}catch(e){}
    if(undo)app.endUndoGroup();
  }
}`;

// SVGA protobuf schema
const SVGA_PROTO_SCHEMA = `syntax="proto3"; package com.opensource.svga;
message MovieParams {float viewBoxWidth=1; float viewBoxHeight=2; int32 fps=3; int32 frames=4;}
message Transform {float a=1; float b=2; float c=3; float d=4; float tx=5; float ty=6;}
message Layout {float x=1; float y=2; float width=3; float height=4;}
message ShapeStyle {message RGBAColor {float r=1; float g=2; float b=3; float a=4;}
enum LineCap {BUTT=0; ROUND=1; SQUARE=2;} enum LineJoin {MITER=0; ROUND_JOIN=1; BEVEL=2;}
RGBAColor fill=1; RGBAColor stroke=2; float strokeWidth=3; LineCap lineCap=4; LineJoin lineJoin=5;
float miterLimit=6; float lineDashI=7; float lineDashII=8; float lineDashIII=9;}
message ShapeEntity {enum ShapeType {SHAPE=0; RECT=1; ELLIPSE=2; KEEP=3;}
message ShapeArgs {string d=1;} message RectArgs {float x=1; float y=2; float width=3; float height=4; float cornerRadius=5;}
message EllipseArgs {float x=1; float y=2; float radiusX=3; float radiusY=4;}
ShapeType type=1; ShapeArgs shape=2; RectArgs rect=3; EllipseArgs ellipse=4; ShapeStyle styles=10; Transform transform=11;}
message FrameEntity {float alpha=1; Layout layout=2; Transform transform=3; string clipPath=4; repeated ShapeEntity shapes=5; string blendMode=6;}
message SpriteEntity {string imageKey=1; repeated FrameEntity frames=2; string matteKey=3; string blendMode=4;}
message AudioEntity {string audioKey=1; int32 startFrame=2; int32 endFrame=3; int32 startTime=4; int32 totalTime=5;}
message MovieEntity {string version=1; MovieParams params=2; map<string,bytes> images=3; repeated SpriteEntity sprites=4; repeated AudioEntity audios=5;}`;

const Movie = (protobuf as any).parse(SVGA_PROTO_SCHEMA).root.lookupType('com.opensource.svga.MovieEntity');

const identity = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const matrix = (t: any) =>
  t ? Object.fromEntries(Object.keys(identity).map((k) => [k, Number(t[k] ?? (identity as any)[k])])) : { ...identity };
const finite = (n: any, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);
const cleanKey = (k: any) => String(k || '').replace(/\.(png|jpe?g|webp|gif|mp3|wav|m4a)$/i, '');

export const safeName = (name: any) => {
  let value =
    String(name || 'SVGA_Project')
      .replace(/\.svga$/i, '')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/[. ]+$/, '')
      .trim() || 'SVGA_Project';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value)) value = '_' + value;
  return value;
};

const asBytes = (value: any): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  if (typeof value === 'string') return Uint8Array.from(atob(value.replace(/^data:[^,]*,/, '')), (c) => c.charCodeAt(0));
  throw new Error('بيانات أحد الموارد غير صالحة');
};

const extension = (bytes: Uint8Array): string => {
  if (bytes[0] === 137 && bytes[1] === 80) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216) return 'jpg';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF')
    return String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'webp' : 'wav';
  if (bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) return 'gif';
  if ((bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) || (bytes[0] === 255 && (bytes[1] & 224) === 224))
    return 'mp3';
  if (String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') return 'm4a';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'OggS') return 'ogg';
  return '';
};

export function clipRgba(rgba: Uint8Array | number[], width: number, height: number, paths: any[] | null) {
  if (!paths) return new Uint8Array(rgba);
  const edges: number[][] = [];
  const line = (a: number[], b: number[]) => {
    if (a[1] !== b[1]) edges.push([a[0], a[1], b[0], b[1], b[1] > a[1] ? 1 : -1]);
  };
  const cubic = (a: number[], b: number[], c: number[], d: number[], depth = 0) => {
    const dx = d[0] - a[0],
      dy = d[1] - a[1],
      len = Math.hypot(dx, dy);
    const flat =
      len > 1e-9
        ? Math.max(Math.abs(dx * (b[1] - a[1]) - dy * (b[0] - a[0])), Math.abs(dx * (c[1] - a[1]) - dy * (c[0] - a[0]))) /
          len
        : Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
    if (flat < 0.08 || depth >= 16) {
      line(a, d);
      return;
    }
    const mid = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const ab = mid(a, b),
      bc = mid(b, c),
      cd = mid(c, d),
      abc = mid(ab, bc),
      bcd = mid(bc, cd),
      m = mid(abc, bcd);
    cubic(a, ab, abc, m, depth + 1);
    cubic(m, bcd, cd, d, depth + 1);
  };
  for (const p of paths) {
    const v = p.vertices,
      n = v.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n,
        a = v[i],
        d = v[j],
        ot = p.outTangents[i],
        it = p.inTangents[j];
      if (ot[0] || ot[1] || it[0] || it[1]) cubic(a, [a[0] + ot[0], a[1] + ot[1]], [d[0] + it[0], d[1] + it[1]], d);
      else line(a, d);
    }
  }
  const output = new Uint8Array(rgba),
    coverage = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    coverage.fill(0);
    for (let sub = 0; sub < 4; sub++) {
      const sy = y + (sub + 0.5) / 4,
        hits: number[][] = [];
      for (const e of edges)
        if (sy >= Math.min(e[1], e[3]) && sy < Math.max(e[1], e[3]))
          hits.push([e[0] + ((sy - e[1]) * (e[2] - e[0])) / (e[3] - e[1]), e[4]]);
      hits.sort((a, b) => a[0] - b[0]);
      let winding = 0,
        start = 0;
      for (const [x, direction] of hits) {
        const previous = winding;
        winding += direction;
        if (!previous && winding) start = x;
        if (previous && !winding) {
          const lo = Math.max(0, start),
            hi = Math.min(width, x);
          for (let pixel = Math.floor(lo); pixel < Math.ceil(hi); pixel++)
            coverage[pixel] += Math.max(0, Math.min(hi, pixel + 1) - Math.max(lo, pixel)) * 0.25;
        }
      }
    }
    for (let x = 0; x < width; x++)
      output[(y * width + x) * 4 + 3] = Math.round(output[(y * width + x) * 4 + 3] * Math.min(1, coverage[x]));
  }
  return output;
}

export async function parseSvga(input: Blob | File | ArrayBuffer | Uint8Array) {
  let bytes: Uint8Array;
  if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(await (input as Blob).arrayBuffer());
  }
  let payload = bytes;
  let zip: any = null;
  if (bytes[0] === 80 && bytes[1] === 75) {
    zip = await (JSZip as any).loadAsync(bytes);
    const binary = zip!.file('movie.binary');
    if (binary) payload = await binary.async('uint8array');
    else if (zip!.file('movie.spec')) {
      const spec = JSON.parse(await zip!.file('movie.spec')!.async('string'));
      const images: Record<string, Uint8Array> = {};
      for (const entry of Object.values(zip!.files) as any[]) {
        if (!entry.dir && /\.(png|jpe?g|webp|gif|mp3|wav|m4a)$/i.test(entry.name)) {
          images[cleanKey(entry.name.split('/').pop())] = await entry.async('uint8array');
        }
      }
      const movie = spec.movie || spec;
      const box = movie.viewBox || movie.videoSize || spec.params || {};
      const sprites = (spec.sprites || movie.sprites || []).map((s: any) => ({
        ...s,
        frames: (s.frames || []).map((f: any) => ({ ...f, alpha: f.alpha ?? 0 })),
      }));
      return validateMovie({
        version: '1.0',
        params: {
          viewBoxWidth: box.width || box.viewBoxWidth,
          viewBoxHeight: box.height || box.viewBoxHeight,
          fps: movie.fps || spec.params?.fps,
          frames: movie.frames || spec.params?.frames,
        },
        sprites,
        images,
        audios: spec.audios || movie.audios || [],
      });
    } else throw new Error('أرشيف SVGA لا يحتوي movie.binary أو movie.spec');
  } else {
    try {
      payload = pako.inflate(bytes);
    } catch {
      try {
        payload = pako.inflateRaw(bytes);
      } catch {
        payload = bytes;
      }
    }
  }
  let movie: any;
  try {
    movie = Movie.toObject(Movie.decode(payload), {
      defaults: true,
      arrays: true,
      objects: true,
      bytes: Array,
      enums: Number,
    });
  } catch {
    throw new Error('تعذر قراءة ملف SVGA. اختر ملف SVGA صالحًا.');
  }
  movie.images = movie.images || {};
  if (zip)
    for (const entry of Object.values(zip.files) as any[]) {
      if (!entry.dir && /\.(png|jpe?g|webp|gif|mp3|wav|m4a)$/i.test(entry.name))
        movie.images[cleanKey(entry.name.split('/').pop())] = await entry.async('uint8array');
    }
  return validateMovie(movie);
}

function validateMovie(movie: any) {
  const p = movie.params || {};
  if (!(p.viewBoxWidth > 0 && p.viewBoxHeight > 0 && p.fps > 0 && p.frames > 0) || !Array.isArray(movie.sprites))
    throw new Error('بيانات المقاسات أو الفريمات ناقصة في ملف SVGA');
  if (
    !Number.isFinite(p.viewBoxWidth) ||
    !Number.isFinite(p.viewBoxHeight) ||
    !Number.isFinite(p.fps) ||
    !Number.isInteger(p.frames) ||
    p.fps < 1 ||
    p.viewBoxWidth < 4 ||
    p.viewBoxHeight < 4
  )
    throw new Error('بيانات المقاسات أو الفريمات خارج القيم المقبولة في After Effects');
  if (p.viewBoxWidth > 30000 || p.viewBoxHeight > 30000 || p.fps > 99 || p.frames / p.fps > 10800)
    throw new Error('مقاسات أو مدة الملف خارج حدود Composition في After Effects');
  return movie;
}

export function decompose(t: any): number[] {
  const { a, b, c, d, tx, ty } = matrix(t),
    det = a * d - b * c;
  const x = Math.hypot(a, b),
    y = Math.hypot(c, d);
  if (Math.abs(a * c + b * d) < 1e-8 * Math.max(1, x * y)) {
    if (x > 1e-10) return [tx, ty, x * 100, (det / x) * 100, (Math.atan2(b, a) * 180) / Math.PI, 0];
    return [tx, ty, 0, y * 100, (Math.atan2(-c, d) * 180) / Math.PI, 0];
  }
  const theta = 0.5 * Math.atan2(2 * (a * b + c * d), a * a + c * c - b * b - d * d);
  const co = Math.cos(theta),
    si = Math.sin(theta);
  const sx = Math.hypot(co * a + si * b, co * c + si * d);
  const sy = sx > 1e-12 ? det / sx : 0;
  const phi = Math.atan2(-(co * c + si * d), co * a + si * b);
  return [tx, ty, sx * 100, sy * 100, (theta * 180) / Math.PI, (phi * 180) / Math.PI];
}

export function pathsFromSvg(d: string, transform?: any) {
  const commands = new SVGPathData(d).toAbs().normalizeHVZ(false, true, true).normalizeST().qtToC().aToC().commands;
  const paths: any[] = [];
  let path: any = null;
  const m = matrix(transform);
  const point = (x: number, y: number) => [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty];
  const delta = (x: number, y: number) => [m.a * x + m.c * y, m.b * x + m.d * y];
  function add(x: number, y: number) {
    path.vertices.push(point(x, y));
    path.inTangents.push([0, 0]);
    path.outTangents.push([0, 0]);
  }
  for (const cmd of commands) {
    if (cmd.type === SVGPathData.MOVE_TO) {
      path = { vertices: [], inTangents: [], outTangents: [], closed: false };
      paths.push(path);
      add(cmd.x, cmd.y);
    } else if (cmd.type === SVGPathData.CLOSE_PATH && path) {
      const n = path.vertices.length,
        last = path.vertices[n - 1],
        first = path.vertices[0];
      if (n > 1 && Math.hypot(last[0] - first[0], last[1] - first[1]) < 1e-7) {
        path.inTangents[0] = path.inTangents.pop();
        path.vertices.pop();
        path.outTangents.pop();
      }
      path.closed = true;
    } else if (path && cmd.type === SVGPathData.LINE_TO) add(cmd.x, cmd.y);
    else if (path && cmd.type === SVGPathData.CURVE_TO) {
      const last = path.vertices[path.vertices.length - 1],
        cp = point(cmd.x1, cmd.y1);
      path.outTangents[path.vertices.length - 1] = [cp[0] - last[0], cp[1] - last[1]];
      add(cmd.x, cmd.y);
      path.inTangents[path.vertices.length - 1] = delta(cmd.x2 - cmd.x, cmd.y2 - cmd.y);
    }
  }
  return paths.filter((p) => p.vertices.length > 1);
}

function shapeSpec(raw: any) {
  const type = String(raw.type).toLowerCase();
  let d = '';
  if (type === '0' || type === 'shape') d = (raw.shape || raw.pathArgs || raw.args || {}).d || '';
  else if (type === '1' || type === 'rect') {
    const r = raw.rect || raw.pathArgs || raw.args || {},
      x = finite(r.x),
      y = finite(r.y),
      w = finite(r.width),
      h = finite(r.height),
      c = Math.max(0, Math.min(finite(r.cornerRadius), Math.abs(w) / 2, Math.abs(h) / 2));
    d = c
      ? `M${x + c} ${y} H${x + w - c} A${c} ${c} 0 0 1 ${x + w} ${y + c} V${y + h - c} A${c} ${c} 0 0 1 ${x + w - c} ${y + h} H${x + c} A${c} ${c} 0 0 1 ${x} ${y + h - c} V${y + c} A${c} ${c} 0 0 1 ${x + c} ${y} Z`
      : `M${x} ${y}h${w}v${h}h${-w}Z`;
  } else if (type === '2' || type === 'ellipse') {
    const r = raw.ellipse || raw.pathArgs || raw.args || {},
      x = finite(r.x),
      y = finite(r.y),
      rx = finite(r.radiusX),
      ry = finite(r.radiusY);
    if (rx > 0 && ry > 0) d = `M${x - rx} ${y} A${rx} ${ry} 0 1 0 ${x + rx} ${y} A${rx} ${ry} 0 1 0 ${x - rx} ${y} Z`;
  }
  if (!d) return null;
  const styles = { ...(raw.styles || {}) };
  for (const k of ['fill', 'stroke'])
    if (Array.isArray(styles[k])) styles[k] = { r: styles[k][0], g: styles[k][1], b: styles[k][2], a: styles[k][3] ?? 1 };
  const m = matrix(raw.transform),
    areaScale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  styles.strokeWidth = finite(styles.strokeWidth) * areaScale;
  return { paths: pathsFromSvg(d, raw.transform), styles };
}

export async function createAePackage(
  movie: any,
  fileName: string,
  onProgress: (p: number, msg: string) => void = () => {},
  options: { bakeClips?: boolean } = {}
) {
  validateMovie(movie);
  const name = safeName(fileName);
  const p = movie.params;
  const warnings: string[] = [];
  const warn = (text: string) => {
    if (!warnings.includes(text)) warnings.push(text);
  };
  const zip = new JSZip();
  const folder = zip.folder(`${name}-assets`)!;
  const assets: any[] = [];
  const assetMap: Record<string, number> = Object.create(null);
  const audioKeys = new Set((movie.audios || []).map((a: any) => a.audioKey));
  const keys = Object.keys(movie.images || {});

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const bytes = asBytes(movie.images[key]);
    let ext = extension(bytes);
    if (!ext) {
      if (!key.endsWith('.json')) warn(`مورد غير معروف لم يُستورد: ${key}`);
      continue;
    }
    const isAudio = audioKeys.has(key) || ['mp3', 'wav', 'm4a', 'ogg'].includes(ext);
    if (!isAudio && ['webp', 'gif'].includes(ext)) {
      if (ext === 'gif') warn('موارد GIF تُحوّل إلى صورة PNG من الفريم الأول؛ راجع أي GIF متحرك.');
      if (typeof document === 'undefined') throw new Error('تحويل WebP/GIF إلى PNG يتطلب المتصفح');
      const url = URL.createObjectURL(new Blob([bytes as any]));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
        if (!blob) throw new Error('PNG conversion failed');
        const file = `assets/image_${assets.length + 1}.png`;
        folder.file(file, await blob.arrayBuffer());
        assets.push({ key, file, kind: 'image' });
        ext = 'converted';
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (ext !== 'converted') {
      const safe = safeName(key).replace(/\.(png|jpe?g|webp|gif|mp3|wav|m4a|ogg)$/i, '');
      let file = `assets/${safe}.${ext}`;
      let suffix = 1;
      while (assets.some((a) => a.file.toLowerCase() === file.toLowerCase())) file = `assets/${safe}_${suffix++}.${ext}`;
      folder.file(file, bytes);
      assets.push({ key, file, kind: isAudio ? 'audio' : 'image' });
    }
    assetMap[key] = assets.length - 1;
    if (assetMap[cleanKey(key)] === undefined) assetMap[cleanKey(key)] = assets.length - 1;
    onProgress(8 + Math.round(((i + 1) / Math.max(1, keys.length)) * 15), 'استخراج الصور والصوت');
  }

  const layers: any[] = [];
  for (let i = 0; i < movie.sprites.length; i++) {
    const sprite = movie.sprites[i];
    const frames = sprite.frames || [];
    const rows: number[][] = [];
    const shapeStates: any[] = [];
    const clipStates: any[] = [];
    let previousShapes: any[] = [];
    let needsParent = false;
    const imageIndex =
      assetMap[sprite.imageKey] ??
      assetMap[cleanKey(sprite.imageKey)] ??
      assetMap[cleanKey(sprite.imageKey).replace(/\.matte$/i, '')];
    const image = imageIndex !== undefined && assets[imageIndex].kind === 'image' ? imageIndex : null;

    for (let f = 0; f < p.frames; f++) {
      const frame = frames[f] || {};
      const alpha = f < frames.length ? Math.max(0, Math.min(1, finite(frame.alpha))) : 0;
      const row = decompose(frame.transform);
      needsParent = needsParent || Math.abs(row[5]) > 1e-6;
      rows.push([...row, alpha * 100]);
      const rawShapes = frame.shapes || [];
      if (rawShapes.length) {
        if (rawShapes.some((s: any) => ['3', 'keep'].includes(String(s.type).toLowerCase())))
          shapeStates.push(previousShapes);
        else {
          previousShapes = rawShapes.map(shapeSpec).filter(Boolean);
          shapeStates.push(previousShapes);
        }
        if (
          rawShapes.some(
            (s: any) =>
              s.styles?.strokeWidth > 0 &&
              s.transform &&
              Math.abs(Math.hypot(s.transform.a, s.transform.b) - Math.hypot(s.transform.c, s.transform.d)) > 1e-5
          )
        )
          warn('بعض حدود الأشكال ذات التحجيم غير المتساوي قد تختلف في السماكة داخل After Effects.');
      } else shapeStates.push([]);
      clipStates.push(frame.clipPath ? pathsFromSvg(frame.clipPath) : null);
      if (frame.blendMode && frame.blendMode !== sprite.blendMode)
        warn('Blend Mode المتغير بين الفريمات يُستخدم منه أول وضع؛ راجع الطبقة في After Effects.');
    }
    if (sprite.imageKey && image === null && !shapeStates.some((s) => s.length))
      throw new Error(`الصورة الأصلية للطبقة ${i + 1} مفقودة: ${sprite.imageKey}`);
    layers.push({
      name: `${String(i + 1).padStart(3, '0')} · ${sprite.imageKey || 'Shape'}`,
      imageKey: sprite.imageKey || '',
      image,
      matteKey: sprite.matteKey || '',
      blendMode: sprite.blendMode || frames.find((f: any) => f.blendMode)?.blendMode || 'NORMAL',
      rows,
      needsParent,
      shapeStates,
      clipStates,
    });
    onProgress(25 + Math.round(((i + 1) / Math.max(1, movie.sprites.length)) * 50), 'تحويل الطبقات ومفاتيح الحركة');
    if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  let bakedClipLayers = 0;
  const pools = new Map<number, any>();
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (
      options.bakeClips !== false &&
      layer.image !== null &&
      layer.clipStates.some(Boolean) &&
      !layer.shapeStates.some((s: any) => s.length)
    ) {
      let pool = pools.get(layer.image);
      if (!pool) {
        const resource = assets[layer.image];
        const bytes = await folder.file(resource.file)!.async('uint8array');
        let rgba: Uint8Array, width: number, height: number;
        if (extension(bytes) === 'png') {
          const png = (UPNG as any).decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
          width = png.width;
          height = png.height;
          rgba = new Uint8Array((UPNG as any).toRGBA8(png)[0]);
        } else {
          if (typeof document === 'undefined') throw new Error('قص موارد JPEG يتطلب المتصفح');
          const url = URL.createObjectURL(new Blob([bytes as any]));
          try {
            const img = new Image();
            img.src = url;
            await img.decode();
            width = img.naturalWidth;
            height = img.naturalHeight;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            rgba = ctx.getImageData(0, 0, width, height).data as any;
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        pool = {
          resource,
          originalFile: resource.file,
          bytes,
          rgba,
          width,
          height,
          files: [],
          states: new Map(),
          buckets: new Map(),
          alphas: [],
          sequenceFolder: `assets/shared_${String(layer.image + 1).padStart(3, '0')}`,
        };
        pools.set(layer.image, pool);
        await savePoolFrame(pool, null);
      }
      const sourceFrames: number[] = [];
      for (let f = 0; f < p.frames; f++) {
        sourceFrames.push(layer.rows[f][6] > 0 ? await savePoolFrame(pool, layer.clipStates[f]) : 0);
        if (f % 5 === 0) {
          onProgress(76, `حفظ اللمعات والأقنعة: طبقة ${i + 1}، فريم ${f + 1}`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      layer.sourceFrames = sourceFrames;
      layer.clipBaked = true;
      bakedClipLayers++;
    } else if (layer.clipStates.some((s: any) => s && s.length > 1)) {
      warn('قناع يحتوي عدة مسارات: يتم استيراده كأقنعة Add؛ راجع الثقوب المتداخلة في After Effects.');
    }
  }

  async function savePoolFrame(pool: any, clip: any): Promise<number> {
    const signature = JSON.stringify(clip);
    if (pool.states.has(signature)) return pool.states.get(signature);
    const pixels = clip ? clipRgba(pool.rgba, pool.width, pool.height, clip) : new Uint8Array(pool.rgba);
    const alpha = new Uint8Array(pool.width * pool.height);
    let hash = 2166136261;
    for (let pIdx = 0; pIdx < alpha.length; pIdx++) {
      alpha[pIdx] = pixels[pIdx * 4 + 3];
      hash = Math.imul(hash ^ alpha[pIdx], 16777619) >>> 0;
    }
    const bucket = pool.buckets.get(hash) || [];
    const existing = bucket.find((index: number) => pool.alphas[index].every((a: number, pIdx: number) => a === alpha[pIdx]));
    if (existing !== undefined) {
      pool.states.set(signature, existing);
      return existing;
    }
    const index = pool.files.length;
    const file = `${pool.sequenceFolder}/shared_${assets.indexOf(pool.resource) + 1}_${String(index).padStart(6, '0')}.png`;
    const png =
      !clip && extension(pool.bytes) === 'png'
        ? pool.bytes
        : (UPNG as any).encode([pixels.buffer], pool.width, pool.height, 0);
    folder.file(file, png);
    pool.files.push(file);
    pool.alphas.push(alpha);
    bucket.push(index);
    pool.buckets.set(hash, bucket);
    pool.states.set(signature, index);
    return index;
  }

  for (const [image, pool] of pools) {
    pool.resource.file = pool.files[0];
    pool.resource.kind = 'image';
    const indices = [image];
    for (let f = 1; f < pool.files.length; f++) {
      indices.push(assets.length);
      assets.push({ key: `clip_${image + 1}_${f}`, file: pool.files[f], kind: 'image' });
    }
    if (extension(pool.bytes) === 'png') folder.remove(pool.originalFile);
    for (const layer of layers) if (layer.image === image && !layer.sourceFrames) layer.sourceFrames = Array(p.frames).fill(0);
    for (const layer of layers)
      if (layer.image === image && layer.sourceFrames) {
        const segments: any[] = [];
        let current: any = null;
        for (let f = 0; f < p.frames; f++) {
          if (layer.rows[f][6] <= 0) {
            current = null;
            continue;
          }
          const asset = indices[layer.sourceFrames[f]];
          if (current && current.asset === asset && current.endFrame === f) current.endFrame = f + 1;
          else {
            current = { asset, startFrame: f, endFrame: f + 1 };
            segments.push(current);
          }
        }
        layer.imageSegments = segments;
        delete layer.sourceFrames;
      }
  }

  for (const layer of layers) if (layer.clipBaked) layer.clipStates = [];
  for (const layer of layers)
    if (layer.matteKey) {
      const source = layers.find((s) => s !== layer && s.imageKey === layer.matteKey);
      if (!source) warn(`طبقة القناع غير موجودة: ${layer.matteKey}`);
      else if (source.image !== null && source.shapeStates.some((s: any) => s.length))
        warn(`قناع يجمع صورة وأشكالًا يحتاج مراجعة داخل After Effects: ${layer.matteKey}`);
    }

  const audios = (movie.audios || []).map((t: any) => {
    const index = assetMap[t.audioKey] ?? assetMap[cleanKey(t.audioKey)];
    if (index === undefined) throw new Error(`مورد الصوت مفقود: ${t.audioKey}`);
    if (assets[index].kind !== 'audio') throw new Error(`مورد الصوت ليس ملف صوت صالحًا: ${t.audioKey}`);
    if (!(t.startFrame >= 0 && t.endFrame > t.startFrame && t.startFrame < p.frames))
      throw new Error(`توقيت الصوت غير صالح: ${t.audioKey}`);
    return { ...t, asset: index };
  });

  const data = {
    version: 5,
    name,
    width: Math.round(p.viewBoxWidth),
    height: Math.round(p.viewBoxHeight),
    fps: p.fps,
    totalFrames: p.frames,
    duration: p.frames / p.fps,
    assets,
    layers,
    audios,
    warnings,
    bakedClipLayers,
    sharedClipPools: pools.size,
    uniqueClipFrames: [...pools.values()].reduce((n, p) => n + p.files.length, 0),
    compatibility: 'SVGAConverter_AE shared still PNG layers',
  };

  const jsx =
    '#target aftereffects\n// Generated by SVGA to After Effects. No external plugin required.\n(' +
    AE_IMPORTER_SCRIPT_SOURCE +
    ')(' +
    JSON.stringify(data).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') +
    ');\n';

  folder.file(`${name}.jsx`, jsx);
  folder.file(
    'assets_info.json',
    JSON.stringify(
      {
        folderName: `${name}-assets`,
        timestamp: new Date().toISOString(),
        baseFileName: name,
        totalImages: assets.filter((a) => a.kind !== 'audio').length,
        totalAudios: assets.filter((a) => a.kind === 'audio').length,
        totalLayers: layers.length,
        bakedClipLayers,
        sharedClipPools: data.sharedClipPools,
        uniqueClipFrames: data.uniqueClipFrames,
        imageKeys: assets.filter((a) => a.kind !== 'audio').map((a) => a.key),
        audioKeys: assets.filter((a) => a.kind === 'audio').map((a) => a.key),
        animationInfo: { resolution: { width: data.width, height: data.height }, frameRate: data.fps, duration: data.duration },
        warnings,
      },
      null,
      2
    )
  );
  folder.file(
    'README.txt',
    `${name} — SVGA to After Effects\n\n1. Extract the complete ZIP. Keep assets/ beside ${name}.jsx.\n2. Open After Effects, choose File > Scripts > Run Script File.\n3. Select ${name}.jsx. The script imports separate assets and builds the composition.\n4. Save your project in After Effects as .aep. The browser exports a JSX package, not a binary .aep.\n\n${layers.length} sprite layers, ${data.width} x ${data.height}, ${data.fps} fps, ${data.totalFrames} frames.\nRepeated sprites remain separate layers even when they share an image.\nFrame samples use Hold interpolation to preserve the SVGA frame values.\nSome layers use a null parent to reproduce shear; these parents are labeled [Transform].\n\n${warnings.join('\n')}`
  );
  folder.file(
    'طريقة الاستخدام.txt',
    `1. فك ضغط الحزمة كاملة.\n2. افتح After Effects ثم File > Scripts > Run Script File.\n3. اختر ${name}.jsx من المجلد.\n4. انتظر إنشاء الطبقات والحركة ثم احفظ المشروع بصيغة AEP.\n\nالموارد داخل assets/، والطبقات المتكررة تظل مستقلة.\n\n${warnings.join('\n')}`
  );
  folder.file(
    '使用说明.txt',
    `SVGA → After Effects\n\n1. 解压完整 ZIP 文件。将 assets 文件夹保留在 ${name}.jsx 旁边。\n2. 打开 After Effects，选择 File > Scripts > Run Script File。\n3. 运行 ${name}.jsx，等待创建合成与独立图层。\n4. 在 After Effects 中将项目保存为 .aep。\n\n${layers.length} 图层，${data.width} × ${data.height}，${data.fps} FPS，${data.totalFrames} 帧。\n`
  );

  onProgress(80, 'ضغط حزمة After Effects');
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (m: any) => onProgress(80 + Math.round(m.percent * 0.2), 'ضغط حزمة After Effects')
  );

  return { blob, jsx, data, name, zipFileName: `${name}-AfterEffects.zip` };
}

/**
 * High-level one-step export function that parses SVGA and downloads the After Effects ZIP directly.
 */
export async function exportSvgaToAfterEffectsDirect(
  file: File | Blob,
  fileName?: string,
  onProgress: (p: number, msg: string) => void = () => {}
): Promise<{ blob: Blob; zipFileName: string; name: string }> {
  onProgress(5, 'جاري قراءة وتحليل ملف SVGA...');
  const movie = await parseSvga(file);
  const baseName = fileName || (file as File).name || 'SVGA_Animation';
  const pkg = await createAePackage(movie, baseName, onProgress, { bakeClips: true });
  onProgress(100, 'تم إنشاء حزمة After Effects بنجاح!');

  // Trigger browser download directly
  const zipUrl = URL.createObjectURL(pkg.blob);
  const a = document.createElement('a');
  a.href = zipUrl;
  a.download = pkg.zipFileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(zipUrl), 45000);

  return { blob: pkg.blob, zipFileName: pkg.zipFileName, name: pkg.name };
}
