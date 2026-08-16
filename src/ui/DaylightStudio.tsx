"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { daylightAt, formatTime, localClockHours } from "../daylight/daylightModel";
import { solarAwareArtisticHour, solarElevation } from "../daylight/solarPosition";
import { WebGLRenderer, type ComparisonMode } from "../renderer/WebGLRenderer";

const DEFAULT_IMAGE = "/latest-download.png";

export default function DaylightStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Deterministic noon baseline avoids SSR/client timezone hydration drift; Auto updates after mount.
  const [hour, setHour] = useState(12);
  const [auto, setAuto] = useState(true);
  const [solar, setSolar] = useState<{lat:number; lon:number} | null>(null);
  const [solarAlt, setSolarAlt] = useState<number | null>(null);
  const [intensity, setIntensity] = useState(1);
  const [split, setSplit] = useState(.5);
  const [comparison, setComparison] = useState<ComparisonMode>("split");
  const [imageInfo, setImageInfo] = useState("leste-refugio.png · 1456 × 1080");
  const [status, setStatus] = useState("Initializing GPU pipeline…");
  const grade = useMemo(() => daylightAt(hour), [hour]);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const renderer = new WebGLRenderer(canvasRef.current);
      rendererRef.current = renderer;
      renderer.setImage(DEFAULT_IMAGE).then(({width,height}) => {
        setImageInfo(`leste-refugio.png · ${width} × ${height}`);
        setStatus("");
        renderer.setGrade(daylightAt(hour));
      }).catch((error) => setStatus(error instanceof Error ? error.message : "Image could not be loaded"));
      return () => renderer.destroy();
    } catch (error) {
      const message = error instanceof Error ? error.message : "WebGL initialization failed";
      queueMicrotask(() => setStatus(message));
    }
  // Renderer lifecycle is intentionally independent from reactive grade state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { rendererRef.current?.setGrade(grade); }, [grade]);
  useEffect(() => { rendererRef.current?.setIntensity(intensity); }, [intensity]);
  useEffect(() => { rendererRef.current?.setSplit(split); }, [split]);
  useEffect(() => { rendererRef.current?.setComparison(comparison); }, [comparison]);

  useEffect(() => {
    if (!auto) return;
    const update = () => {
      const now = new Date();
      if (solar) {
        setHour(solarAwareArtisticHour(now, solar.lat, solar.lon));
        setSolarAlt(solarElevation(now, solar.lat, solar.lon));
      } else setHour(localClockHours(now));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [auto, solar]);

  const loadFile = async (file?: File) => {
    if (!file || !rendererRef.current) return;
    setStatus("Loading local image…");
    try {
      const {width,height} = await rendererRef.current.setImage(file);
      setImageInfo(`${file.name} · ${width} × ${height}`);
      setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unsupported image"); }
  };

  const enableSolar = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({coords}) => { setSolar({lat: coords.latitude, lon: coords.longitude}); setAuto(true); },
      () => setSolar(null),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 3600000 },
    );
  };

  const updateSplit = useCallback((clientX: number) => {
    const rect = viewerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSplit(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  }, []);

  const startSplitDrag = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateSplit(event.clientX);
  };

  return (
    <main className="studio">
      <header className="topbar">
        <div className="brand"><i className="brand-mark" aria-hidden="true"/><span>Daylight / Color Studio</span></div>
        <div className="top-actions">
          <button className="chip source-chip" onClick={() => fileRef.current?.click()}>Open image</button>
          <button className={`chip ${comparison === "original" ? "active" : ""}`} onClick={() => setComparison(comparison === "original" ? "graded" : "original")}>{comparison === "original" ? "Show grade" : "Original"}</button>
          <button className={`chip ${comparison === "split" ? "active" : ""}`} onClick={() => setComparison(comparison === "split" ? "graded" : "split")}>Compare</button>
          <input ref={fileRef} className="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => loadFile(e.target.files?.[0])}/>
        </div>
      </header>

      <section className="workspace">
        <div className="viewer" ref={viewerRef}>
          <canvas ref={canvasRef} aria-label="GPU color graded image preview"/>
          {status && <div className="loading">{status}</div>}
          {comparison === "split" && <>
            <span className="compare-tag before">Original</span><span className="compare-tag after">Graded</span>
            <div className="split-handle" role="slider" aria-label="Before and after split" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split*100)} tabIndex={0} style={{left: `${split*100}%`}} onPointerDown={startSplitDrag} onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && updateSplit(e.clientX)} onKeyDown={(e) => { if (e.key === "ArrowLeft") setSplit(v => Math.max(0,v-.02)); if (e.key === "ArrowRight") setSplit(v => Math.min(1,v+.02)); }}/>
          </>}
          <span className="image-caption">{imageInfo}</span>
        </div>

        <aside className="panel" aria-label="Daylight grade controls">
          <div className="panel-section">
            <div className="eyebrow">Current atmosphere</div>
            <div className="phase-row"><div className="phase-name">{grade.name}</div><div className="timecode">{formatTime(hour)}</div></div>
            <div className="phase-sub">{grade.description}</div>
          </div>
          <div className="panel-section">
            <div className="control-head"><span>Time of day</span><span className="value">{formatTime(hour)}</span></div>
            <input aria-label="Time of day" type="range" min="0" max="1439" value={Math.round(hour*60)%1440} onInput={(e) => { setAuto(false); setHour(Number(e.currentTarget.value)/60); }}/>
            <div className="ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
            <div className="mode-row"><button className={`chip ${auto ? "active" : ""}`} onClick={() => setAuto(true)}>Auto time</button><button className={`chip ${!auto ? "active" : ""}`} onClick={() => setAuto(false)}>Manual</button></div>
            <div className="hint">{auto ? (solar ? "Solar elevation remaps the artistic cycle to local daylight." : "Following the device clock. Solar sync is optional.") : `Blending ${grade.previousName} → ${grade.nextName} · ${Math.round(grade.blend*100)}%`}</div>
          </div>
          <div className="panel-section">
            <div className="control-head"><span>Grade intensity</span><span className="value">{Math.round(intensity*100)}%</span></div>
            <input className="intensity" aria-label="Grade intensity" type="range" min="0" max="100" value={Math.round(intensity*100)} onInput={(e) => setIntensity(Number(e.currentTarget.value)/100)}/>
          </div>
          <div className="panel-section">
            <div className="control-head"><span>Daylight source</span><span className="value">{solar ? "SOLAR" : "CLOCK"}</span></div>
            <button className={`chip ${solar ? "active" : ""}`} onClick={enableSolar}>{solar ? "Solar sync enabled" : "Enable solar sync"}</button>
            <div className="hint">Location stays in this browser and is used only for on-device solar elevation.</div>
          </div>
          <div className="panel-section">
            <div className="stat-grid">
              <div><div className="stat-label">Exposure</div><div className="stat-value">{grade.exposure >= 0 ? "+" : ""}{grade.exposure.toFixed(2)} EV</div></div>
              <div><div className="stat-label">Temperature</div><div className="stat-value">{grade.temperature >= 0 ? "+" : ""}{grade.temperature.toFixed(2)}</div></div>
              <div><div className="stat-label">Film density</div><div className="stat-value">{Math.round(grade.filmStrength*100)}%</div></div>
              <div><div className="stat-label">Solar altitude</div><div className="stat-value">{solarAlt == null ? "—" : `${solarAlt.toFixed(1)}°`}</div></div>
            </div>
          </div>
        </aside>
      </section>

      <footer className="bottombar"><div className="legend"><span>WebGL2 active</span><span>32³ film LUT</span><span>sRGB managed</span></div><div>Drag the divider to compare · ← → for precision</div></footer>
    </main>
  );
}
