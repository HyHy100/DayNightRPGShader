import { daylightAt,formatTime } from "../daylight/daylightModel";
import { WebGLRenderer } from "../renderer/WebGLRenderer";
import { chooseWebMMimeType,exportFilename,exportFrameCount,exportFrameProgress,getExportDimensions,sampleDayCycleTimeline,type VideoExportOptions,type VideoExportStage } from "./videoExportModel";
import { fixWebmDuration } from "./fixWebmDuration";
export type { VideoComposition,VideoExportOptions,VideoExportProgress,VideoResolution } from "./videoExportModel";

function roundedRect(context:CanvasRenderingContext2D,x:number,y:number,width:number,height:number,radius:number){
  const r=Math.min(radius,width/2,height/2);context.beginPath();context.roundRect(x,y,width,height,r);context.fill();
}

function drawOverlay(context:CanvasRenderingContext2D,width:number,height:number,time:string,name:string,comparison:boolean){
  const scale=height/1080,cx=width/2;
  context.save();context.textAlign="center";context.textBaseline="middle";
  context.font=`600 ${Math.round(18*scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const timeWidth=context.measureText(time).width;
  context.font=`${Math.round(46*scale)}px Georgia, "Times New Roman", serif`;
  const nameWidth=context.measureText(name).width,boxWidth=Math.max(nameWidth,timeWidth)+72*scale,boxHeight=116*scale;
  const boxTop=38*scale,cy=boxTop+boxHeight/2;
  context.fillStyle="rgba(5, 6, 7, .48)";roundedRect(context,cx-boxWidth/2,boxTop,boxWidth,boxHeight,12*scale);
  context.shadowColor="rgba(0,0,0,.9)";context.shadowBlur=18*scale;context.fillStyle="#f2eee5";
  context.fillText(name,cx,cy+15*scale);
  context.shadowBlur=10*scale;context.font=`600 ${Math.round(18*scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;context.fillStyle="#e9b866";
  context.fillText(time,cx,cy-28*scale);
  if(comparison){
    context.shadowBlur=0;context.fillStyle="rgba(244,241,234,.82)";context.fillRect(cx-.75*scale,0,1.5*scale,height);
    context.font=`700 ${Math.round(12*scale)}px Inter, ui-sans-serif, system-ui, sans-serif`;context.letterSpacing=`${2*scale}px`;
    const labelY=36*scale,labelWidth=104*scale,labelHeight=30*scale;
    for(const [label,labelX] of [["ORIGINAL",30*scale],["GRADED",width-30*scale-labelWidth]] as const){
      context.fillStyle="rgba(5,6,7,.64)";roundedRect(context,labelX,labelY,labelWidth,labelHeight,5*scale);
      context.fillStyle="#f2eee5";context.textAlign="center";context.fillText(label,labelX+labelWidth/2,labelY+labelHeight/2);
    }
  }
  context.restore();
}

export class DayCycleVideoExporter {
  private cancelled=false;
  private recorder:MediaRecorder|null=null;
  private stream:MediaStream|null=null;
  private timer=0;
  private resolveWait:(()=>void)|null=null;
  cancel(){this.cancelled=true;if(this.timer)clearTimeout(this.timer);this.resolveWait?.();}

  async export(options:VideoExportOptions){
    this.cancelled=false;
    if(typeof MediaRecorder==="undefined"||typeof HTMLCanvasElement.prototype.captureStream!=="function")throw new Error("This browser cannot record canvas video. MediaRecorder and canvas capture are required.");
    const mimeType=chooseWebMMimeType(type=>MediaRecorder.isTypeSupported(type));
    if(!mimeType)throw new Error("This browser does not provide a compatible WebM encoder.");
    const {width,height}=getExportDimensions(options.resolution),renderCanvas=document.createElement("canvas"),outputCanvas=document.createElement("canvas");
    renderCanvas.width=width;renderCanvas.height=height;outputCanvas.width=width;outputCanvas.height=height;
    const context=outputCanvas.getContext("2d",{alpha:false});if(!context)throw new Error("Unable to initialize the video compositor.");
    let renderer:WebGLRenderer|null=null;
    const report=(stage:VideoExportStage,progress:number,message:string)=>options.onProgress?.({stage,progress,message});
    try{
      report("preparing",0,"Preparing 24-hour render…");
      renderer=new WebGLRenderer(renderCanvas,{width,height,observeResize:false});
      await renderer.setImage(options.imageSource);if(this.cancelled)throw new DOMException("Export cancelled","AbortError");
      renderer.setIntensity(options.intensity);renderer.setOpticalGlow(options.opticalGlow);renderer.setComparison(options.composition==="comparison"?"split":"graded");renderer.setSplit(.5);
      const renderAt=(progress:number)=>{
        const sample=sampleDayCycleTimeline(options.date,progress),model=daylightAt(sample.hour,sample.date,options.location,options.profile,options.storyMoon);
        renderer!.setGrade(model.grade);renderer!.renderFrame();context.drawImage(renderCanvas,0,0,width,height);
        drawOverlay(context,width,height,formatTime(sample.hour),model.grade.name,options.composition==="comparison");
      };
      renderAt(0);
      // A zero-rate capture track lets each deterministic timeline sample be
      // submitted explicitly. This prevents slow 1080p GPU/encoder frames from
      // making wall-clock progress skip short twilight stages. Older browsers
      // fall back to a normal fixed-rate capture stream; the render loop still
      // advances by frame index, never by elapsed time.
      this.stream=outputCanvas.captureStream(0);
      let captureTrack=this.stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack|undefined;
      const manualCapture=typeof captureTrack?.requestFrame==="function";
      if(!manualCapture){this.stream.getTracks().forEach(track=>track.stop());this.stream=outputCanvas.captureStream(options.frameRate);captureTrack=this.stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack|undefined;}
      const chunks:BlobPart[]=[];this.recorder=new MediaRecorder(this.stream,{mimeType,videoBitsPerSecond:options.resolution==="1080p"?12_000_000:7_000_000});
      const stopped=new Promise<Blob>((resolve,reject)=>{
        this.recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
        this.recorder.onerror=()=>reject(new Error("The browser video encoder stopped unexpectedly."));
        this.recorder.onstop=()=>resolve(new Blob(chunks,{type:mimeType}));
      });
      this.recorder.start(1000);report("recording",0,"Recording midnight → midnight…");
      const setPaused=async(paused:boolean)=>{
        if(!this.recorder||this.recorder.state==="inactive"||paused===(this.recorder.state==="paused"))return;
        const event=paused?"pause":"resume";
        await new Promise<void>((resolve,reject)=>{
          const onError=()=>{cleanup();reject(new Error("The browser could not synchronize the video clock."));};
          const onState=()=>{cleanup();resolve();};
          const cleanup=()=>{this.recorder?.removeEventListener(event,onState);this.recorder?.removeEventListener("error",onError);};
          this.recorder!.addEventListener(event,onState,{once:true});this.recorder!.addEventListener("error",onError,{once:true});
          if(paused)this.recorder!.pause();else this.recorder!.resume();
        });
      };
      const totalFrames=exportFrameCount(options.durationSeconds,options.frameRate),frameInterval=1000/options.frameRate;
      // MediaRecorder timestamps follow wall-clock time. Suspend that clock
      // while WebGL computes each frame, then expose the completed frame for
      // one exact interval. Day and night therefore occupy equal timeline
      // distances even when their bloom passes have different GPU costs.
      await setPaused(true);
      for(let frameIndex=0;frameIndex<totalFrames&&!this.cancelled;frameIndex++){
        const progress=exportFrameProgress(frameIndex,totalFrames);renderAt(progress);
        await setPaused(false);if(manualCapture)captureTrack?.requestFrame();
        report("recording",progress,`Recording ordered frame ${frameIndex+1} / ${totalFrames}`);
        await new Promise<void>(resolve=>{this.resolveWait=resolve;this.timer=window.setTimeout(resolve,frameInterval);});
        this.timer=0;this.resolveWait=null;
        if(!this.cancelled)await setPaused(true);
      }
      if(!this.cancelled){report("finalizing",1,"Finalizing WebM…");await new Promise(resolve=>setTimeout(resolve,80));}
      if(this.recorder.state!=="inactive")this.recorder.stop();const recordedBlob=await stopped;
      if(this.cancelled){report("cancelled",0,"Export cancelled");return null;}
      if(!recordedBlob.size)throw new Error("The browser returned an empty video.");
      report("finalizing",1,"Writing WebM duration metadata…");
      const blob=await fixWebmDuration(recordedBlob,options.durationSeconds*1000);
      const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=exportFilename(options.date,options.composition);link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
      report("complete",1,"WebM downloaded");return {blob,filename:link.download,mimeType};
    }catch(error){
      if(error instanceof DOMException&&error.name==="AbortError"){report("cancelled",0,"Export cancelled");return null;}
      report("error",0,error instanceof Error?error.message:"Video export failed");throw error;
    }finally{
      if(this.timer)clearTimeout(this.timer);this.timer=0;this.resolveWait=null;
      if(this.recorder?.state!=="inactive")this.recorder?.stop();this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;this.recorder=null;renderer?.destroy();
    }
  }
}
