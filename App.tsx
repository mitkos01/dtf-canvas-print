
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { UploadedFile, CanvasConfig, PackedImage, PackingStats } from './types';
import { packImages } from './services/packer';

const CANVAS_WIDTH_CM = 58;
const CANVAS_HEIGHT_CM = 250;
const DEFAULT_DPI = 300;

type Language = 'en' | 'uk';
type BgMode = 'checker' | 'green';

const translations = {
  en: {
    title: "Print Packer",
    canvasSettings: "Settings",
    width: "Width (cm)",
    height: "Max Height (cm)",
    resolution: "DPI",
    cuttingGap: "Gap (cm)",
    assets: "Source Files",
    dropzone: "Drop PNGs here",
    remove: "Remove",
    clearAll: "Clear All",
    packBtn: "Generate Layout",
    packing: "Processing...",
    downloadBtn: "Download PNG",
    items: "OBJECTS",
    efficiency: "UTILIZATION",
    zoom: "ZOOM",
    canvas: "CANVAS",
    empty: "DROP FILES",
    overflow: "Failed to Fit",
    previewBg: "Preview Background"
  },
  uk: {
    title: "Print Packer",
    canvasSettings: "Параметри",
    width: "Ширина (см)",
    height: "Макс. Висота (см)",
    resolution: "DPI",
    cuttingGap: "Відступ (см)",
    assets: "Файли",
    dropzone: "Додати PNG файли",
    remove: "Видалити",
    clearAll: "Очистити",
    packBtn: "Запустити пакування",
    packing: "Обробка...",
    downloadBtn: "Завантажити PNG",
    items: "ОБ'ЄКТІВ",
    efficiency: "ЗАПОВНЕННЯ",
    zoom: "ZOOM",
    canvas: "CANVAS",
    empty: "ДОДАЙТЕ ФАЙЛИ",
    overflow: "Не вмістилося",
    previewBg: "Фон превью"
  }
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('uk');
  const t = translations[lang];

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [packedImages, setPackedImages] = useState<PackedImage[]>([]);
  const [bgMode, setBgMode] = useState<BgMode>('checker');
  const [config, setConfig] = useState<CanvasConfig>({
    widthCm: CANVAS_WIDTH_CM,
    heightCm: CANVAS_HEIGHT_CM,
    dpi: DEFAULT_DPI,
    padding: 1.0,
    allowRotation: true
  });
  const [autoScale] = useState(true);
  const [shouldTrim] = useState(true);
  const [isPacking, setIsPacking] = useState(false);
  const [packProgress, setPackProgress] = useState(0);
  const [stats, setStats] = useState<PackingStats>({
    totalImages: 0, usedArea: 0, totalArea: 0, efficiency: 0, failedCount: 0
  });
  const [failedList, setFailedList] = useState<any[]>([]);
  
  const [zoom, setZoom] = useState(0.04);
  const [offset, setOffset] = useState({ x: 100, y: 120 });
  const [isDragging, setIsDragging] = useState(false);
  
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, offX: 0, offY: 0 });

  const canvasDims = useMemo(() => ({
    w: Math.floor((config.widthCm / 2.54) * config.dpi),
    h: Math.floor((config.heightCm / 2.54) * config.dpi)
  }), [config.widthCm, config.heightCm, config.dpi]);

  const applyBounds = useCallback((x: number, y: number, currentZoom: number) => {
    if (!viewportRef.current) return { x, y };
    const viewport = viewportRef.current.getBoundingClientRect();
    const canvasW = canvasDims.w * currentZoom;
    const canvasH = canvasDims.h * currentZoom;
    const minPadding = 50;
    const minX = -canvasW + minPadding;
    const maxX = viewport.width - minPadding;
    const minY = -canvasH + minPadding;
    const maxY = viewport.height - minPadding;
    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY)
    };
  }, [canvasDims]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.85 : 1.15;
    const nextZoom = Math.min(5, Math.max(0.005, zoom * zoomFactor));
    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - offset.x) / zoom;
      const worldY = (mouseY - offset.y) / zoom;
      let nextX = mouseX - worldX * nextZoom;
      let nextY = mouseY - worldY * nextZoom;
      const bounded = applyBounds(nextX, nextY, nextZoom);
      setOffset(bounded);
      setZoom(nextZoom);
    }
  }, [zoom, offset, applyBounds]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offX: offset.x,
      offY: offset.y
    };
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const nextX = dragStartRef.current.offX + dx;
      const nextY = dragStartRef.current.offY + dy;
      setOffset(applyBounds(nextX, nextY, zoom));
    };
    const onMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, zoom, applyBounds]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (vp) vp.addEventListener('wheel', handleWheel, { passive: false });
    return () => vp?.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).map((file: File) => ({
      id: Math.random().toString(36).slice(2, 11),
      file,
      preview: URL.createObjectURL(file),
      width: 0, height: 0, status: 'ready' as const
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const clearAll = () => {
    files.forEach(f => URL.revokeObjectURL(f.preview));
    packedImages.forEach(img => { if (img.previewUrl.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl); });
    setFiles([]);
    setPackedImages([]);
    setStats({ totalImages: 0, usedArea: 0, totalArea: 0, efficiency: 0, failedCount: 0 });
    setFailedList([]);
  };

  const startPacking = async () => {
    if (files.length === 0) return;
    setIsPacking(true);
    setPackProgress(0);
    packedImages.forEach(img => { if (img.previewUrl.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl); });

    try {
      const result = await packImages(files, config, autoScale, shouldTrim, (p) => {
        setPackProgress(Math.round(p * 100));
      });
      setPackedImages(result.packed);
      setFailedList(result.failed);
      const totalArea = config.widthCm * config.heightCm;
      const usedArea = result.packed.reduce((sum, img) => sum + ((img.width/config.dpi)*2.54 * (img.height/config.dpi)*2.54), 0);
      setStats({
        totalImages: result.packed.length,
        usedArea, totalArea,
        efficiency: (usedArea / totalArea) * 100,
        failedCount: result.failed.length
      });
    } catch (error) {
      console.error("Packing failed:", error);
    } finally {
      setIsPacking(false);
    }
  };

  const downloadCanvas = async () => {
    if (packedImages.length === 0) return;
    let maxUsedY = 0;
    packedImages.forEach(img => {
      const bottom = img.y + img.height;
      if (bottom > maxUsedY) maxUsedY = bottom;
    });
    const paddingPx = Math.floor((config.padding / 2.54) * config.dpi);
    const exportWidth = canvasDims.w;
    const exportHeight = Math.min(canvasDims.h, maxUsedY + paddingPx);

    const canvas = document.createElement('canvas');
    canvas.width = exportWidth;
    canvas.height = exportHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    for (const img of packedImages) {
      ctx.save();
      if (img.rotated) {
        ctx.translate(img.x + img.width, img.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img.source, 0, 0, img.height, img.width);
      } else {
        ctx.translate(img.x, img.y);
        ctx.drawImage(img.source, 0, 0, img.width, img.height);
      }
      ctx.restore();
    }

    canvas.toBlob(blob => {
      if (!blob) return;
      const link = document.createElement('a');
      const finalWidthCm = config.widthCm;
      const finalHeightCm = ((exportHeight / config.dpi) * 2.54).toFixed(1);
      link.download = `dtf_${finalWidthCm}x${finalHeightCm}cm_packed.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }, 'image/png');
  };

  return (
    <div className="flex h-screen bg-[#02040a] text-slate-300 overflow-hidden font-sans select-none">
      {isPacking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md transition-opacity duration-300">
          <div className="bg-[#12141c] border border-white/10 p-10 rounded-[3rem] shadow-[0_0_100px_rgba(79,70,229,0.3)] flex flex-col items-center gap-6 max-w-sm w-full mx-4">
             <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                   <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                   <circle 
                      cx="64" cy="64" r="56" 
                      stroke="currentColor" 
                      strokeWidth="8" 
                      fill="transparent" 
                      strokeDasharray={351.8} 
                      strokeDashoffset={351.8 - (351.8 * packProgress) / 100} 
                      className="text-indigo-500 transition-all duration-300 ease-out" 
                      strokeLinecap="round" 
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                   <span className="text-3xl font-black text-white">{packProgress}%</span>
                </div>
             </div>
             <div className="text-center">
                <h2 className="text-lg font-black text-white uppercase tracking-widest">{t.packing}</h2>
             </div>
          </div>
        </div>
      )}

      <aside className="w-[320px] flex-shrink-0 bg-[#0b0d12] border-r border-white/5 flex flex-col z-50 shadow-2xl relative">
        <div className="p-8 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeWidth={2.5}/></svg>
              </div>
              <h1 className="text-lg font-black text-white uppercase tracking-tighter leading-none">{t.title}</h1>
            </div>
            <button onClick={() => setLang(lang === 'en' ? 'uk' : 'en')} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-black text-slate-400 hover:text-white transition-all border border-white/5 uppercase">{lang}</button>
          </div>

          <div className="space-y-6">
            <section className="bg-white/[0.03] p-5 rounded-3xl border border-white/5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-3 bg-indigo-500 rounded-full"></div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.canvasSettings}</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-500 uppercase px-1">{t.width}</label>
                  <input type="number" value={config.widthCm} onChange={e => setConfig({...config, widthCm: +e.target.value})} className="w-full bg-[#161920] border border-white/5 p-3 rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500/50 text-white transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-500 uppercase px-1">{t.height}</label>
                  <input type="number" value={config.heightCm} onChange={e => setConfig({...config, heightCm: +e.target.value})} className="w-full bg-[#161920] border border-white/5 p-3 rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500/50 text-white transition-colors" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-500 uppercase px-1">{t.cuttingGap}</label>
                  <input type="number" step="0.1" value={config.padding} onChange={e => setConfig({...config, padding: +e.target.value})} className="w-full bg-[#161920] border border-white/5 p-3 rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500/50 text-white transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-500 uppercase px-1">{t.resolution}</label>
                  <input type="number" value={config.dpi} onChange={e => setConfig({...config, dpi: +e.target.value})} className="w-full bg-[#161920] border border-white/5 p-3 rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500/50 text-white transition-colors" />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-white/5">
                <label className="text-[8px] font-black text-slate-500 uppercase px-1 block">{t.previewBg}</label>
                <div className="flex gap-2">
                  <button onClick={() => setBgMode('checker')} className={`flex-1 flex items-center gap-3 p-3 rounded-xl border transition-all ${bgMode === 'checker' ? 'bg-indigo-600/20 border-indigo-500/50 text-white' : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'}`}>
                    <div className="w-4 h-4 bg-checkerboard-mini rounded ring-1 ring-white/10" />
                    <span className="text-[9px] font-black uppercase">Standard</span>
                  </button>
                  <button onClick={() => setBgMode('green')} className={`flex-1 flex items-center gap-3 p-3 rounded-xl border transition-all ${bgMode === 'green' ? 'bg-indigo-600/20 border-indigo-500/50 text-white' : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'}`}>
                    <div className="w-4 h-4 bg-[#00FF00] rounded ring-1 ring-white/10" />
                    <span className="text-[9px] font-black uppercase">Green</span>
                  </button>
                </div>
              </div>
            </section>

            <section className="space-y-4">
               <div className="flex justify-between items-center px-1">
                 <div className="flex items-center gap-2">
                    <div className="w-1 h-3 bg-emerald-500 rounded-full"></div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.assets} ({files.length})</h3>
                 </div>
                 <button onClick={clearAll} className="text-[9px] font-black text-rose-500 uppercase hover:text-rose-400 transition-colors">{t.clearAll}</button>
               </div>

               <div className="relative group">
                 <div className="relative border-2 border-dashed border-white/10 rounded-[2rem] p-8 text-center bg-white/[0.02] hover:bg-white/[0.04] hover:border-indigo-500/40 transition-all cursor-pointer overflow-hidden">
                   <input type="file" multiple accept="image/png" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                   <div className="relative z-0">
                      <svg className="w-8 h-8 text-indigo-500/50 mx-auto mb-3 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth={2.5} strokeLinecap="round"/></svg>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.dropzone}</p>
                   </div>
                 </div>
               </div>

               <div className="grid grid-cols-4 gap-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                  {files.map(f => (
                    <div key={f.id} className="aspect-square bg-[#161920] rounded-xl overflow-hidden border border-white/5 relative group hover:scale-95 transition-transform">
                      <img src={f.preview} className="w-full h-full object-contain p-2" />
                      <button onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))} className="absolute inset-0 bg-rose-600/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-black text-[9px] uppercase tracking-tighter">{t.remove}</button>
                    </div>
                  ))}
               </div>
            </section>
          </div>
        </div>

        <div className="p-8 space-y-4 border-t border-white/5 bg-[#0b0d12]/95 backdrop-blur-xl">
          {failedList.length > 0 && (
            <div className="text-rose-400 flex items-center gap-3 bg-rose-500/10 px-4 py-3 rounded-2xl border border-rose-500/20 animate-pulse mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{failedList.length} {t.overflow}</span>
            </div>
          )}

          <button 
            onClick={startPacking} 
            disabled={files.length === 0 || isPacking} 
            className="group relative w-full h-14 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-slate-700 text-white font-black rounded-2xl uppercase text-[11px] tracking-[0.15em] transition-all shadow-xl shadow-indigo-500/10 active:scale-95 flex items-center justify-center gap-3"
          >
            {t.packBtn}
          </button>
          
          <button 
            onClick={downloadCanvas} 
            disabled={packedImages.length === 0 || isPacking} 
            className="w-full h-12 border border-white/10 hover:bg-white/5 disabled:opacity-20 text-slate-300 font-black rounded-xl uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2"
          >
            {t.downloadBtn}
          </button>
        </div>
      </aside>

      <main className="flex-1 relative overflow-hidden flex flex-col bg-[#02040a]">
        {/* Statistics Bar - Pill Style based on screenshot */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-40">
           <div className="bg-[#12141c]/80 backdrop-blur-2xl border border-white/10 px-10 py-4 rounded-[4rem] flex items-center gap-12 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)]">
              <div className="flex flex-col items-center">
                <span className="text-lg font-black text-indigo-400 leading-none">{Math.round(zoom*100)}%</span>
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-2">{t.zoom}</span>
              </div>
              <div className="w-[1px] h-8 bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-emerald-400 text-lg font-black leading-none">{stats.efficiency.toFixed(1)}%</span>
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-2">{t.efficiency}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-indigo-400 text-lg font-black leading-none">{stats.totalImages}</span>
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-2">{t.items}</span>
              </div>
              <div className="w-[1px] h-8 bg-white/10" />
              <div className="flex flex-col items-center">
                 <span className="text-slate-200 text-lg font-black tracking-tight leading-none">{config.widthCm}×{config.heightCm}</span>
                 <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-2">{t.canvas}</span>
              </div>
           </div>
        </div>

        <div 
          ref={viewportRef} 
          onMouseDown={onMouseDown}
          className={`flex-1 relative bg-blueprint overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <div 
            className="absolute origin-top-left pointer-events-none"
            style={{ 
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            }}
          >
            <div 
              className={`relative shadow-[0_120px_250px_rgba(0,0,0,0.9)] ring-1 ring-white/10 transition-colors duration-500 ${bgMode === 'checker' ? 'bg-checkerboard' : 'bg-[#00FF00]'}`}
              style={{ 
                width: canvasDims.w,
                height: canvasDims.h,
              }}
            >
              {packedImages.map(img => (
                <div key={img.id} 
                  className="absolute group/item"
                  style={{
                    left: img.x,
                    top: img.y,
                    width: img.width,
                    height: img.height,
                  }}>
                  <img 
                    src={img.previewUrl} 
                    className="block pointer-events-none origin-top-left"
                    style={{
                      transform: img.rotated ? 'rotate(90deg) translate(0, -100%)' : 'none',
                      transformOrigin: 'top left',
                      width: img.rotated ? img.height : img.width,
                      height: img.rotated ? img.width : img.height,
                    }}
                  />
                  {(Math.min(img.originalWidth, img.originalHeight) / (Math.min(img.width, img.height) / config.dpi)) < 150 && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-amber-500/90 backdrop-blur shadow-2xl text-black text-[100px] font-black px-10 py-5 rounded-[50px] opacity-0 group-hover/item:opacity-100 transition-opacity z-50 pointer-events-none whitespace-nowrap">
                        LOW DPI
                      </div>
                  )}
                </div>
              ))}

              {packedImages.length === 0 && !isPacking && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-[0.03]">
                  <span className="text-[400px] font-black leading-none uppercase tracking-tighter text-center">{t.empty}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e212b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #313647; }
        .bg-blueprint {
          background-color: #02040a;
          background-image: radial-gradient(circle, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 80px 80px;
        }
        .bg-checkerboard {
          background-color: #ffffff;
          background-image: conic-gradient(#f1f1f1 0.25turn, transparent 0.25turn 0.5turn, #f1f1f1 0.5turn 0.75turn, transparent 0.75turn);
          background-size: 40px 40px;
        }
        .bg-checkerboard-mini {
          background-color: #ffffff;
          background-image: conic-gradient(#e2e2e2 0.25turn, transparent 0.25turn 0.5turn, #e2e2e2 0.5turn 0.75turn, transparent 0.75turn);
          background-size: 10px 10px;
        }
      `}</style>
    </div>
  );
};

export default App;
