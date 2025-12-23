
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { UploadedFile, CanvasConfig, PackedImage, PackingStats } from './types';
import { packImages } from './services/packer';

const CANVAS_WIDTH_CM = 58;
const CANVAS_HEIGHT_CM = 250;
const DEFAULT_DPI = 300;

type Language = 'en' | 'uk';

const translations = {
  en: {
    title: "Print Packer",
    subtitle: "DTF PRO WORKSTATION",
    canvasSettings: "Canvas",
    width: "Width (cm)",
    height: "Height (cm)",
    resolution: "DPI",
    cuttingGap: "Gap (cm)",
    trim: "Trim Transparency",
    rotation: "Auto Rotation",
    scale: "Scale to Fit",
    assets: "Assets",
    dropzone: "Upload Files",
    remove: "DEL",
    clearAll: "Clear",
    packBtn: "Pack Canvas",
    packing: "Packing...",
    downloadBtn: "Export PNG",
    items: "Items",
    efficiency: "Density",
    area: "Area",
    empty: "CANVAS READY",
    overflow: "Overflown",
    ready: "Ready",
    processing: "Processing",
    qualityWarning: "Low Resolution"
  },
  uk: {
    title: "Print Packer",
    subtitle: "DTF PRO СТАНЦІЯ",
    canvasSettings: "Полотно",
    width: "Ширина (см)",
    height: "Висота (см)",
    resolution: "DPI",
    cuttingGap: "Відступ (см)",
    trim: "Обрізати краї",
    rotation: "Розумний поворот",
    scale: "Масштабування",
    assets: "Файли",
    dropzone: "Додати PNG",
    remove: "ВИД",
    clearAll: "Очистити",
    packBtn: "Заповнити",
    packing: "Обробка...",
    downloadBtn: "Завантажити PNG",
    items: "Елементи",
    efficiency: "Щільність",
    area: "Площа",
    empty: "ПОЛОТНО ГОТОВЕ",
    overflow: "Не вмістилося",
    ready: "Готово",
    processing: "Завантаження",
    qualityWarning: "Низька якість"
  }
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('uk');
  const t = translations[lang];

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [packedImages, setPackedImages] = useState<PackedImage[]>([]);
  const [config, setConfig] = useState<CanvasConfig>({
    widthCm: CANVAS_WIDTH_CM,
    heightCm: CANVAS_HEIGHT_CM,
    dpi: DEFAULT_DPI,
    padding: 1.0,
    allowRotation: true
  });
  const [autoScale, setAutoScale] = useState(true);
  const [shouldTrim, setShouldTrim] = useState(true);
  const [isPacking, setIsPacking] = useState(false);
  const [packProgress, setPackProgress] = useState(0);
  const [stats, setStats] = useState<PackingStats>({
    totalImages: 0, usedArea: 0, totalArea: 0, efficiency: 0, failedCount: 0
  });
  const [failedList, setFailedList] = useState<any[]>([]);
  const [zoom, setZoom] = useState(0.04);
  const viewportRef = useRef<HTMLDivElement>(null);

  const canvasDims = useMemo(() => ({
    w: Math.floor((config.widthCm / 2.54) * config.dpi),
    h: Math.floor((config.heightCm / 2.54) * config.dpi)
  }), [config.widthCm, config.heightCm, config.dpi]);

  const changeZoom = useCallback((delta: number) => {
    setZoom(prev => {
      const next = delta > 0 ? prev * 1.15 : prev / 1.15;
      return Math.min(2, Math.max(0.005, next));
    });
  }, []);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        changeZoom(-e.deltaY);
      }
    };
    const vp = viewportRef.current;
    if (vp) vp.addEventListener('wheel', handleWheel, { passive: false });
    return () => vp?.removeEventListener('wheel', handleWheel);
  }, [changeZoom]);

  // Чистимо пам'ять при розмонтуванні або зміні результатів
  const cleanupBlobs = useCallback((images: PackedImage[]) => {
    images.forEach(img => {
      if (img.previewUrl.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl);
    });
  }, []);

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
    cleanupBlobs(packedImages);
    setFiles([]);
    setPackedImages([]);
    setStats({ totalImages: 0, usedArea: 0, totalArea: 0, efficiency: 0, failedCount: 0 });
    setFailedList([]);
  };

  const startPacking = async () => {
    if (files.length === 0) return;
    setIsPacking(true);
    setPackProgress(0);
    
    // Попереднє очищення
    cleanupBlobs(packedImages);

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
    const canvas = document.createElement('canvas');
    canvas.width = canvasDims.w;
    canvas.height = canvasDims.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Малюємо по черзі для стабільності пам'яті
    for (const img of packedImages) {
      ctx.save();
      ctx.translate(img.x, img.y);
      if (img.rotated) {
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img.source, 0, -img.width, img.height, img.width);
      } else {
        ctx.drawImage(img.source, 0, 0, img.width, img.height);
      }
      ctx.restore();
    }

    canvas.toBlob(blob => {
      if (!blob) return;
      const link = document.createElement('a');
      link.download = `dtf_${config.widthCm}x${config.heightCm}_pro.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }, 'image/png');
  };

  return (
    <div className="flex h-screen bg-[#050608] text-slate-300 overflow-hidden font-sans select-none">
      <aside className="w-[320px] flex-shrink-0 bg-[#0f1116] border-r border-white/5 flex flex-col z-50 shadow-2xl relative">
        {isPacking && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/5 z-[60]">
            <div 
              className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] transition-all duration-300 ease-linear" 
              style={{ width: `${packProgress}%` }}
            />
          </div>
        )}

        <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/20">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" strokeWidth={2.5}/></svg>
              </div>
              <div>
                <h1 className="text-sm font-black text-white uppercase tracking-tighter leading-none">{t.title}</h1>
                <p className="text-[10px] font-bold text-indigo-400/60 mt-1 uppercase tracking-widest">Optimized Engine</p>
              </div>
            </div>
            <button onClick={() => setLang(lang === 'en' ? 'uk' : 'en')} className="px-2.5 py-1 bg-white/5 rounded-lg text-[10px] font-black text-slate-400 hover:text-white hover:bg-white/10 transition-all uppercase border border-white/5">{lang}</button>
          </div>

          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{t.canvasSettings}</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
                  <label className="text-[8px] font-black text-slate-500 uppercase block mb-1">{t.width}</label>
                  <input type="number" value={config.widthCm} onChange={e => setConfig({...config, widthCm: +e.target.value})} className="w-full bg-transparent text-sm font-bold focus:outline-none text-white" />
                </div>
                <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
                  <label className="text-[8px] font-black text-slate-500 uppercase block mb-1">{t.height}</label>
                  <input type="number" value={config.heightCm} onChange={e => setConfig({...config, heightCm: +e.target.value})} className="w-full bg-transparent text-sm font-bold focus:outline-none text-white" />
                </div>
              </div>
            </section>

            <section className="space-y-4">
               <div className="flex justify-between items-center px-1">
                 <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{t.assets} ({files.length})</h3>
                 <button onClick={clearAll} className="text-[9px] font-black text-rose-500 uppercase hover:text-rose-400 transition-colors">{t.clearAll}</button>
               </div>
               <div className="relative group">
                 <div className="relative border-2 border-dashed border-white/5 rounded-2xl p-6 text-center hover:bg-white/5 hover:border-indigo-500/30 transition-all cursor-pointer">
                   <input type="file" multiple accept="image/png" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                   <svg className="w-6 h-6 text-slate-600 mx-auto mb-2 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth={2}/></svg>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.dropzone}</p>
                 </div>
               </div>
               <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {files.map(f => (
                    <div key={f.id} className="aspect-square bg-white/[0.03] rounded-xl overflow-hidden border border-white/5 relative group">
                      <img src={f.preview} className="w-full h-full object-contain p-2" />
                      <button onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))} className="absolute inset-0 bg-rose-600/95 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-black text-[9px] uppercase">{t.remove}</button>
                    </div>
                  ))}
               </div>
            </section>
          </div>
        </div>

        <div className="p-6 space-y-3 border-t border-white/5 bg-[#0f1116] shadow-[0_-20px_40px_rgba(0,0,0,0.3)]">
          <button 
            onClick={startPacking} 
            disabled={files.length === 0 || isPacking} 
            className="group relative w-full h-14 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-slate-700 text-white font-black rounded-2xl uppercase text-xs tracking-[0.15em] transition-all overflow-hidden shadow-2xl shadow-indigo-500/20"
          >
            {isPacking ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-700">
                <span className="text-[10px] mb-1 animate-pulse">{t.packing} {packProgress}%</span>
              </div>
            ) : (
              <span className="relative z-10 flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth={2.5}/></svg>
                {t.packBtn}
              </span>
            )}
          </button>
          <button 
            onClick={downloadCanvas} 
            disabled={packedImages.length === 0 || isPacking} 
            className="w-full h-11 border border-white/10 hover:bg-white/10 disabled:border-transparent disabled:text-slate-800 text-slate-300 font-bold py-3 rounded-xl uppercase text-[10px] tracking-widest transition-all"
          >
            {t.downloadBtn}
          </button>
        </div>
      </aside>

      <main className="flex-1 relative overflow-hidden flex flex-col bg-[#08090b]">
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-40">
           <div className="bg-[#12141a]/80 backdrop-blur-3xl border border-white/10 px-8 py-4 rounded-[2.5rem] flex items-center gap-10 shadow-[0_40px_100px_rgba(0,0,0,0.7)]">
              <div className="flex items-center gap-6 pr-10 border-r border-white/5">
                <button onClick={() => changeZoom(-1)} className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-slate-400 hover:text-white active:scale-95">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 12H4" strokeWidth={3.5}/></svg>
                </button>
                <div className="flex flex-col items-center min-w-[60px]">
                  <span className="text-sm font-mono font-black text-indigo-400 select-none tracking-tight">{Math.round(zoom*100)}%</span>
                  <span className="text-[7px] text-slate-600 font-black uppercase tracking-widest mt-0.5">Scale</span>
                </div>
                <button onClick={() => changeZoom(1)} className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-slate-400 hover:text-white active:scale-95">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth={3.5}/></svg>
                </button>
              </div>
              <div className="flex items-center gap-12">
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">{t.efficiency}</span>
                  <span className="text-emerald-400 text-lg font-black">{stats.efficiency.toFixed(1)}%</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">{t.items}</span>
                  <span className="text-indigo-400 text-lg font-black">{stats.totalImages}</span>
                </div>
              </div>
           </div>
        </div>

        <div ref={viewportRef} className="flex-1 overflow-auto custom-scrollbar-stage bg-blueprint relative">
          <div className="flex items-center justify-center min-w-full min-h-full p-[600px]">
            <div 
              className="relative shadow-[0_100px_200px_rgba(0,0,0,0.9)] bg-checkerboard ring-1 ring-white/5 transition-transform duration-200 ease-out"
              style={{ 
                width: canvasDims.w * zoom,
                height: canvasDims.h * zoom,
                minWidth: canvasDims.w * zoom,
                minHeight: canvasDims.h * zoom,
              }}
            >
              <div 
                className="absolute inset-0 origin-top-left"
                style={{ 
                  transform: `scale(${zoom})`,
                  backgroundImage: zoom > 0.1 ? 'linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px)' : 'none',
                  backgroundSize: '118.11px 118.11px'
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
                      className="block pointer-events-none origin-top-left w-full h-full"
                      style={{
                        transform: img.rotated ? `translate(0, ${img.height}px) rotate(-90deg)` : 'none',
                        width: img.rotated ? img.height : img.width,
                        height: img.rotated ? img.width : img.height,
                      }}
                    />
                    {/* Quality Warning Tooltip */}
                    {(Math.min(img.originalWidth, img.originalHeight) / (Math.min(img.width, img.height) / config.dpi)) < 150 && (
                       <div className="absolute -top-6 left-0 bg-amber-500 text-black text-[120px] font-black px-4 py-1 rounded opacity-0 group-hover/item:opacity-100 transition-opacity z-50 pointer-events-none whitespace-nowrap">
                         LOW DPI
                       </div>
                    )}
                  </div>
                ))}

                {packedImages.length === 0 && !isPacking && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-[0.015]">
                    <span className="text-[450px] font-black rotate-[-10deg] leading-none uppercase tracking-tighter whitespace-nowrap">{t.empty}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="h-14 bg-[#0f1116] border-t border-white/5 flex items-center px-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 z-50">
           <div className="flex items-center gap-12">
             <div className="flex items-center gap-4">
               <span className="text-white bg-white/5 px-3 py-1 rounded-lg border border-white/5">{config.widthCm} x {config.heightCm} CM</span>
               <span className="font-mono text-slate-600 tracking-normal">{canvasDims.w} x {canvasDims.h} PX @ {config.dpi} DPI</span>
             </div>
             <div className="h-4 w-[1px] bg-white/10" />
             <div className="flex items-center gap-2">
               <span className="text-slate-400">{(stats.usedArea/10000).toFixed(3)} m²</span>
               <span className="text-slate-700">of</span>
               <span className="text-slate-400">{(stats.totalArea/10000).toFixed(3)} m²</span>
             </div>
           </div>
           
           <div className="ml-auto flex items-center gap-6">
             {failedList.length > 0 && (
               <div className="text-rose-400 flex items-center gap-2 bg-rose-500/10 px-5 py-2 rounded-full border border-rose-500/20 shadow-2xl">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeWidth={3}/></svg>
                 <span className="font-black">{failedList.length} {t.overflow}</span>
               </div>
             )}
             <div className="flex items-center gap-3 bg-white/[0.03] px-5 py-2 rounded-xl border border-white/5 shadow-inner">
               <div className={`w-2.5 h-2.5 rounded-full ${isPacking ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'} shadow-[0_0_10px_rgba(16,185,129,0.3)]`}></div>
               <span className="text-slate-400 font-bold">{isPacking ? t.processing : t.ready}</span>
             </div>
           </div>
        </footer>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }

        .custom-scrollbar-stage::-webkit-scrollbar { width: 12px; height: 12px; }
        .custom-scrollbar-stage::-webkit-scrollbar-track { background: #050608; }
        .custom-scrollbar-stage::-webkit-scrollbar-thumb { background: #1e222d; border: 3px solid #050608; border-radius: 12px; }
        .custom-scrollbar-stage::-webkit-scrollbar-thumb:hover { background: #2d3446; }

        .bg-blueprint {
          background-color: #08090b;
          background-image: 
            radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        .bg-checkerboard {
          background-color: #ffffff;
          background-image: 
            conic-gradient(#f0f0f0 0.25turn, transparent 0.25turn 0.5turn, #f0f0f0 0.5turn 0.75turn, transparent 0.75turn);
          background-size: 32px 32px;
        }
      `}</style>
    </div>
  );
};

export default App;
