
import React, { useState, useRef, useEffect } from 'react';
import { UploadedFile, CanvasConfig, PackedImage, PackingStats } from './types';
import { packImages } from './services/packer';

const CANVAS_WIDTH_CM = 58;
const CANVAS_HEIGHT_CM = 250;
const DEFAULT_DPI = 300;

type Language = 'en' | 'uk';

const translations = {
  en: {
    title: "Print Packer",
    subtitle: "DTF Layout Automator",
    canvasSettings: "Canvas Settings",
    width: "Width (cm)",
    height: "Height (cm)",
    resolution: "Resolution",
    cuttingGap: "Cutting Gap (cm)",
    trim: "Trim Transparent Edges",
    rotation: "Allow Smart Rotation",
    scale: "Auto-scale to Fit",
    assets: "Assets",
    dropzone: "Click or Drag PNG Files",
    remove: "REMOVE",
    packBtn: "PACK CANVAS",
    packing: "PACKING",
    downloadBtn: "DOWNLOAD FINAL PNG",
    processing: "Processing Assets",
    packingLayout: "Packing layout for DTF Printing...",
    items: "Items",
    efficiency: "Efficiency",
    area: "Area",
    empty: "EMPTY",
    overflow: "ASSETS OVERFLOWED",
    native: "Native",
    limitError: "Canvas size exceeds browser limits. Please lower the DPI or canvas height.",
    error: "Error during packing process.",
    ready: "READY",
    packed: "Packed",
    gap: "GAP"
  },
  uk: {
    title: "Принт Пакер",
    subtitle: "Автоматизація макетів DTF",
    canvasSettings: "Налаштування полотна",
    width: "Ширина (см)",
    height: "Висота (см)",
    resolution: "Якість (DPI)",
    cuttingGap: "Відступ (см)",
    trim: "Обрізати прозорі краї",
    rotation: "Розумний поворот",
    scale: "Авто-масштабування",
    assets: "Зображення",
    dropzone: "Натисніть або перетягніть PNG",
    remove: "ВИДАЛИТИ",
    packBtn: "ЗАПОВНИТИ ПОЛОТНО",
    packing: "ПАКУВАННЯ",
    downloadBtn: "ЗАВАНТАЖИТИ ГОТОВИЙ PNG",
    processing: "Обробка активів",
    packingLayout: "Створення макету для DTF друку...",
    items: "Елементи",
    efficiency: "Ефективність",
    area: "Площа",
    empty: "ПУСТО",
    overflow: "НЕ ВМІСТИЛОСЯ",
    native: "Розмір",
    limitError: "Розмір полотна перевищує ліміти браузера. Спробуйте зменшити DPI або висоту.",
    error: "Помилка під час пакування.",
    ready: "ГОТОВО",
    packed: "Запаковано",
    gap: "ВІДСТУП"
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
    padding: 0.5,
    allowRotation: true
  });
  const [autoScale, setAutoScale] = useState(true);
  const [shouldTrim, setShouldTrim] = useState(true);
  const [isPacking, setIsPacking] = useState(false);
  const [packProgress, setPackProgress] = useState(0);
  const [stats, setStats] = useState<PackingStats>({
    totalImages: 0,
    usedArea: 0,
    totalArea: 0,
    efficiency: 0,
    failedCount: 0
  });
  const [failedList, setFailedList] = useState<{ file: UploadedFile; reason: string }[]>([]);
  const [zoom, setZoom] = useState(0.08);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      width: 0,
      height: 0,
      status: 'ready' as const
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const startPacking = async () => {
    if (files.length === 0) return;
    setIsPacking(true);
    setPackProgress(0);
    setFailedList([]);
    
    const pixelPadding = Math.round(((config.padding / 2) / 2.54) * config.dpi);

    try {
      const pixelConfig = { ...config, padding: pixelPadding };
      const { packed, failed } = await packImages(files, pixelConfig, autoScale, shouldTrim, (p) => {
        setPackProgress(Math.round(p * 100));
      });
      
      setPackedImages(packed);
      setFailedList(failed);
      
      const totalArea = config.widthCm * config.heightCm;
      const usedArea = packed.reduce((sum, img) => {
        const wCm = (img.width / config.dpi) * 2.54;
        const hCm = (img.height / config.dpi) * 2.54;
        return sum + (wCm * hCm);
      }, 0);

      setStats({
        totalImages: packed.length,
        usedArea,
        totalArea,
        efficiency: (usedArea / totalArea) * 100,
        failedCount: failed.length
      });
      setPackProgress(100);
      setTimeout(() => setIsPacking(false), 500);
    } catch (error) {
      console.error("Packing error:", error);
      alert(t.error);
      setIsPacking(false);
    }
  };

  const downloadCanvas = async () => {
    if (packedImages.length === 0) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const wPx = Math.floor((config.widthCm / 2.54) * config.dpi);
    const hPx = Math.floor((config.heightCm / 2.54) * config.dpi);

    if (hPx > 32000 || wPx > 32000) {
      alert(t.limitError);
      return;
    }

    canvas.width = wPx;
    canvas.height = hPx;
    ctx.clearRect(0, 0, wPx, hPx);

    packedImages.forEach(img => {
      ctx.save();
      ctx.translate(img.x, img.y);
      if (img.rotated) {
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img.source, 0, -img.width, img.height, img.width);
      } else {
        ctx.drawImage(img.source, 0, 0, img.width, img.height);
      }
      ctx.restore();
    });

    const link = document.createElement('a');
    link.download = `dtf_roll_${config.widthCm}x${config.heightCm}cm_${config.padding}cm_gap.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const canvasWidthPx = Math.floor((config.widthCm / 2.54) * config.dpi);
  const canvasHeightPx = Math.floor((config.heightCm / 2.54) * config.dpi);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Progress Overlay */}
      {isPacking && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-xl transition-all">
          <div className="w-80 space-y-4 text-center">
            <div className="relative h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all duration-300 ease-out"
                style={{ width: `${packProgress}%` }}
              />
            </div>
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">{t.processing}</span>
              <span className="text-[10px] font-black font-mono text-white">{packProgress}%</span>
            </div>
            <p className="text-xs text-slate-500 font-medium animate-pulse">{t.packingLayout}</p>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl z-30">
        <div className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
          <div className="flex justify-between items-start">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" strokeWidth={2} />
                </svg>
              </div>
              {t.title}
            </h1>
            <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
              <button 
                onClick={() => setLang('en')}
                className={`px-2 py-0.5 text-[10px] font-black rounded ${lang === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                EN
              </button>
              <button 
                onClick={() => setLang('uk')}
                className={`px-2 py-0.5 text-[10px] font-black rounded ${lang === 'uk' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                UA
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2 font-semibold">{t.subtitle}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
              {t.canvasSettings}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 focus-within:border-indigo-500/50 transition-colors">
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">{t.width}</label>
                <input type="number" value={config.widthCm} onChange={e => setConfig({...config, widthCm: Number(e.target.value)})} className="w-full bg-transparent text-sm font-mono focus:outline-none text-white" />
              </div>
              <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 focus-within:border-indigo-500/50 transition-colors">
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">{t.height}</label>
                <input type="number" value={config.heightCm} onChange={e => setConfig({...config, heightCm: Number(e.target.value)})} className="w-full bg-transparent text-sm font-mono focus:outline-none text-white" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 focus-within:border-indigo-500/50 transition-colors">
                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">{t.resolution}</label>
                <select value={config.dpi} onChange={e => setConfig({...config, dpi: Number(e.target.value)})} className="w-full bg-transparent text-sm outline-none text-white font-mono">
                  <option value={72}>72 DPI</option>
                  <option value={150}>150 DPI</option>
                  <option value={300}>300 DPI</option>
                </select>
              </div>
              <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 focus-within:border-indigo-500/50 transition-colors">
                <label className="block text-[10px] text-indigo-400 font-bold uppercase mb-1">{t.cuttingGap}</label>
                <input type="number" step="0.1" min="0" value={config.padding} onChange={e => setConfig({...config, padding: Number(e.target.value)})} className="w-full bg-transparent text-sm font-bold focus:outline-none text-indigo-300" />
              </div>
            </div>

            <div className="space-y-3 bg-slate-800/20 p-4 rounded-xl border border-slate-800/50">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={shouldTrim} onChange={e => setShouldTrim(e.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-indigo-600 focus:ring-offset-slate-900" />
                <span className="text-xs font-medium text-slate-300">{t.trim}</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={config.allowRotation} onChange={e => setConfig({...config, allowRotation: e.target.checked})} className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-indigo-600 focus:ring-offset-slate-900" />
                <span className="text-xs font-medium text-slate-300">{t.rotation}</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={autoScale} onChange={e => setAutoScale(e.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-indigo-600 focus:ring-offset-slate-900" />
                <span className="text-xs font-medium text-slate-300">{t.scale}</span>
              </label>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              {t.assets} ({files.length})
            </h3>
            <div className="relative group border-2 border-dashed border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/5 rounded-2xl p-8 text-center transition-all cursor-pointer">
              <input type="file" multiple accept="image/png" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <p className="text-xs font-bold text-slate-400 group-hover:text-indigo-300 transition-colors">{t.dropzone}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {files.map(file => (
                <div key={file.id} className="relative aspect-square bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700/30 group">
                  <img src={file.preview} className="w-full h-full object-contain" />
                  <button onClick={() => setFiles(prev => prev.filter(f => f.id !== file.id))} className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-bold text-[10px] tracking-widest">{t.remove}</button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="p-5 bg-slate-900 border-t border-slate-800 space-y-3">
          <button 
            disabled={files.length === 0 || isPacking} 
            onClick={startPacking} 
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-indigo-500/10 active:scale-[0.98]"
          >
            {isPacking ? `${t.packing} ${packProgress}%` : t.packBtn}
          </button>
          <button 
            disabled={packedImages.length === 0} 
            onClick={downloadCanvas} 
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-[11px] font-black uppercase tracking-widest py-3 rounded-xl transition-all active:scale-[0.98]"
          >
            {t.downloadBtn}
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 relative flex flex-col bg-[#020617] overflow-hidden">
        {/* Workspace Toolbar */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-slate-900/90 backdrop-blur-2xl px-6 py-3 rounded-2xl border border-white/5 flex items-center gap-8 shadow-2xl pointer-events-auto">
             <div className="flex items-center gap-5 border-r border-white/10 pr-6">
               <button onClick={() => setZoom(prev => Math.max(0.01, prev - 0.02))} className="text-slate-400 hover:text-white transition-colors">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 12H4" strokeWidth={2.5}/></svg>
               </button>
               <span className="text-sm font-black font-mono text-indigo-400 min-w-[50px] text-center">{Math.round(zoom * 100)}%</span>
               <button onClick={() => setZoom(prev => Math.min(1, prev + 0.02))} className="text-slate-400 hover:text-white transition-colors">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth={2.5}/></svg>
               </button>
             </div>
             {stats.totalImages > 0 && (
               <div className="flex items-center gap-8 text-[11px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">
                 <div className="flex flex-col">
                   <span className="text-[9px] text-slate-500 leading-none mb-1">{t.packed}</span>
                   <span className="text-indigo-400 leading-none">{stats.totalImages}/{files.length}</span>
                 </div>
                 <div className="flex flex-col">
                   <span className="text-[9px] text-slate-500 leading-none mb-1">{t.efficiency}</span>
                   <span className="text-emerald-400 leading-none">{stats.efficiency.toFixed(1)}%</span>
                 </div>
                 <div className="flex flex-col">
                   <span className="text-[9px] text-slate-500 leading-none mb-1">{t.area}</span>
                   <span className="text-amber-400 leading-none">{(stats.usedArea/10000).toFixed(2)} m²</span>
                 </div>
               </div>
             )}
          </div>
        </div>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-auto p-[20vh] pb-[40vh] custom-scrollbar bg-dots">
          <div className="origin-top-left transition-transform duration-200 ease-out"
               style={{ transform: `scale(${zoom})` }}>
            
            <div className="relative bg-white shadow-[0_0_100px_rgba(0,0,0,0.5)]"
              style={{
                width: `${canvasWidthPx}px`,
                height: `${canvasHeightPx}px`,
                backgroundImage: `linear-gradient(45deg, #f3f4f6 25%, transparent 25%), linear-gradient(-45deg, #f3f4f6 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f3f4f6 75%), linear-gradient(-45deg, transparent 75%, #f3f4f6 75%)`,
                backgroundSize: `40px 40px`,
              }}>
              
              {packedImages.map(img => (
                <div key={img.id} className="absolute group"
                  style={{
                    left: `${img.x}px`,
                    top: `${img.y}px`,
                    width: `${img.width}px`,
                    height: `${img.height}px`,
                  }}>
                  <div className="absolute -inset-[2px] border border-dashed border-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                  
                  <canvas 
                    ref={el => {
                      if (el) {
                        el.width = img.width; el.height = img.height;
                        const ctx = el.getContext('2d');
                        if (ctx) {
                          ctx.clearRect(0,0,el.width, el.height);
                          if (img.rotated) { 
                            ctx.save(); ctx.translate(0, el.height); ctx.rotate(-Math.PI/2); 
                            ctx.drawImage(img.source, 0,0, el.height, el.width); 
                            ctx.restore(); 
                          }
                          else { ctx.drawImage(img.source, 0, 0, el.width, el.height); }
                        }
                      }
                    }}
                    className="w-full h-full object-contain pointer-events-none drop-shadow-sm"
                  />
                  
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 border border-indigo-500/50 text-[14px] text-white px-3 py-1.5 rounded-lg font-black opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-2xl pointer-events-none">
                    {Math.round(img.width / config.dpi * 25.4)} x {Math.round(img.height / config.dpi * 25.4)} mm
                  </div>
                </div>
              ))}

              {packedImages.length === 0 && !isPacking && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="opacity-10 flex flex-col items-center gap-8">
                    <svg className="w-64 h-64 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth={0.5} />
                    </svg>
                    <h2 className="text-[120px] font-black text-slate-300 uppercase tracking-tighter select-none">
                      {t.empty}
                    </h2>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Status Bar */}
        <div className="h-12 bg-slate-900/80 backdrop-blur-md border-t border-slate-800 flex items-center px-8 text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] z-20">
           <div className="flex items-center gap-6 pr-8 border-r border-slate-800 font-mono">
             <span className="flex items-center gap-2">
               <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
               {config.widthCm}x{config.heightCm} CM
             </span>
             <span className="text-slate-600">|</span>
             <span>{config.dpi} DPI</span>
             <span className="text-slate-600">|</span>
             <span className="text-indigo-400">{t.gap}: {config.padding}CM</span>
           </div>
           
           <div className="flex-1 flex items-center justify-center gap-8">
             {failedList.length > 0 && (
               <div className="flex items-center gap-2 text-rose-500 font-black">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeWidth={2.5}/></svg>
                 <span>{failedList.length} {t.overflow}</span>
               </div>
             )}
           </div>

           <span className="font-mono text-slate-600 ml-auto">{t.native}: {canvasWidthPx}x{canvasHeightPx} px</span>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 20px; border: 2px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; background-clip: content-box; }
        .bg-dots {
          background-image: radial-gradient(#1e293b 1px, transparent 1px);
          background-size: 40px 40px;
        }
        @keyframes pulse-indigo {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default App;
