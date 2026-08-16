import type { DaylightGrade } from "../daylight/artDirection";
import type { AtmosphereProfile } from "../daylight/clearSkyModel";
import { formatTime } from "../daylight/daylightModel";
import type { StoryMoonConfig } from "../daylight/moonlightModel";
import type { GeoLocation } from "../daylight/solarPosition";
import { WebGLRenderer } from "../renderer/WebGLRenderer";
import { collectDaylightStageSamples,slugify } from "./stageExportModel";
import { createZip,type ZipEntry } from "./zipArchive";

export type ImageExportStage="idle"|"preparing"|"rendering"|"packaging"|"complete"|"cancelled"|"error";
export interface ImageExportProgress { stage:ImageExportStage;progress:number;message:string }
interface CommonOptions { imageSource:string|Blob;intensity:number;opticalGlow:number;date:Date;onProgress?:(value:ImageExportProgress)=>void }
export interface CurrentImageExportOptions extends CommonOptions { hour:number;grade:DaylightGrade }
export interface StageArchiveExportOptions extends CommonOptions { location:GeoLocation|null;profile:AtmosphereProfile;storyMoon:StoryMoonConfig }

const stamp=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const pngBlob=(canvas:HTMLCanvasElement)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("The browser could not encode the rendered PNG.")),"image/png"));
const download=(blob:Blob,filename:string)=>{const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);};

export class ProcessedImageExporter {
  private cancelled=false;
  cancel(){this.cancelled=true;}

  private async prepare(options:CommonOptions){
    const canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;
    const renderer=new WebGLRenderer(canvas,{width:1,height:1,observeResize:false});
    const dimensions=await renderer.setImage(options.imageSource);
    if(this.cancelled){renderer.destroy();throw new DOMException("Export cancelled","AbortError");}
    renderer.setOutputSize(dimensions.width,dimensions.height);renderer.setIntensity(options.intensity);renderer.setOpticalGlow(options.opticalGlow);renderer.setComparison("graded");
    return {canvas,renderer,...dimensions};
  }

  async exportCurrent(options:CurrentImageExportOptions){
    this.cancelled=false;options.onProgress?.({stage:"preparing",progress:0,message:"Preparing original-resolution GPU render…"});let renderer:WebGLRenderer|null=null;
    try{const prepared=await this.prepare(options);renderer=prepared.renderer;renderer.setGrade(options.grade);renderer.renderFrame();const blob=await pngBlob(prepared.canvas);if(this.cancelled)throw new DOMException("Export cancelled","AbortError");
      const filename=`daylight-${stamp(options.date)}-${formatTime(options.hour).replace(":","")}-${slugify(options.grade.name)}.png`;download(blob,filename);options.onProgress?.({stage:"complete",progress:1,message:`PNG downloaded · ${prepared.width} × ${prepared.height}`});return {blob,filename,width:prepared.width,height:prepared.height};
    }catch(error){if(this.cancelled||(error instanceof DOMException&&error.name==="AbortError")){options.onProgress?.({stage:"cancelled",progress:0,message:"Image export cancelled"});return null;}options.onProgress?.({stage:"error",progress:0,message:error instanceof Error?error.message:"Image export failed"});throw error;}finally{renderer?.destroy();}
  }

  async exportStages(options:StageArchiveExportOptions){
    this.cancelled=false;options.onProgress?.({stage:"preparing",progress:0,message:"Finding continuous daylight stages…"});let renderer:WebGLRenderer|null=null;
    try{const samples=collectDaylightStageSamples(options.date,options.location,options.profile,options.storyMoon),prepared=await this.prepare(options);renderer=prepared.renderer;const entries:ZipEntry[]=[];
      for(let i=0;i<samples.length;i++){if(this.cancelled)throw new DOMException("Export cancelled","AbortError");const sample=samples[i];renderer.setGrade(sample.model.grade);renderer.renderFrame();const blob=await pngBlob(prepared.canvas),prefix=String(i+1).padStart(2,"0"),clock=sample.time.replace(":","");entries.push({name:`stages/${prefix}-${clock}-${slugify(sample.name)}.png`,data:blob,date:options.date});options.onProgress?.({stage:"rendering",progress:(i+1)/(samples.length+1),message:`Rendering ${i+1} / ${samples.length} · ${sample.time} ${sample.name}`});await new Promise<void>(resolve=>setTimeout(resolve,0));}
      const manifest={generatedAt:new Date().toISOString(),sourceResolution:{width:prepared.width,height:prepared.height},date:stamp(options.date),profile:options.profile,location:options.location,storyMoon:options.storyMoon,intensity:options.intensity,opticalGlow:options.opticalGlow,stages:samples.map(({index,hour,time,name,description})=>({index,hour,time,name,description}))};entries.unshift({name:"manifest.json",data:JSON.stringify(manifest,null,2),date:options.date});options.onProgress?.({stage:"packaging",progress:.98,message:"Packaging original-resolution PNG files…"});const blob=await createZip(entries);if(this.cancelled)throw new DOMException("Export cancelled","AbortError");const filename=`daylight-stages-${stamp(options.date)}.zip`;download(blob,filename);options.onProgress?.({stage:"complete",progress:1,message:`ZIP downloaded · ${samples.length} stages · ${prepared.width} × ${prepared.height}`});return {blob,filename,width:prepared.width,height:prepared.height,count:samples.length};
    }catch(error){if(this.cancelled||(error instanceof DOMException&&error.name==="AbortError")){options.onProgress?.({stage:"cancelled",progress:0,message:"Stage export cancelled"});return null;}options.onProgress?.({stage:"error",progress:0,message:error instanceof Error?error.message:"Stage export failed"});throw error;}finally{renderer?.destroy();}
  }
}
