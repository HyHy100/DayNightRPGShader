import { daylightAt,formatTime } from "../daylight/daylightModel";
import { WebGLRenderer } from "../renderer/WebGLRenderer";
import { exportFilename,exportFrameCount,exportFrameProgress,getExportDimensions,sampleDayCycleTimeline,type VideoExportOptions,type VideoExportStage } from "./videoExportModel";
import { extractWebMVideoFrames,muxWebM,type WebMVideoChunk } from "./webmMuxer";
export type { VideoComposition,VideoExportOptions,VideoExportProgress,VideoResolution } from "./videoExportModel";

function roundedRect(context:CanvasRenderingContext2D,x:number,y:number,width:number,height:number,radius:number){
  const r=Math.min(radius,width/2,height/2);context.beginPath();context.roundRect(x,y,width,height,r);context.fill();
}

function drawOverlay(context:CanvasRenderingContext2D,width:number,height:number,time:string,comparison:boolean){
  const scale=height/1080,cx=width/2;
  context.save();context.textAlign="center";context.textBaseline="middle";
  context.font=`600 ${Math.round(22*scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const timeWidth=context.measureText(time).width,boxWidth=timeWidth+64*scale,boxHeight=56*scale;
  const boxTop=38*scale,cy=boxTop+boxHeight/2;
  context.fillStyle="rgba(5, 6, 7, .48)";roundedRect(context,cx-boxWidth/2,boxTop,boxWidth,boxHeight,12*scale);
  context.shadowColor="rgba(0,0,0,.9)";context.shadowBlur=12*scale;context.fillStyle="#e9b866";
  context.fillText(time,cx,cy);
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
  private encoder:VideoEncoder|null=null;
  private recorder:MediaRecorder|null=null;
  private stream:MediaStream|null=null;
  private timer=0;
  private resolveWait:(()=>void)|null=null;
  cancel(){
    this.cancelled=true;try{this.encoder?.reset();}catch{/* already closed */}
    if(this.timer)clearTimeout(this.timer);this.resolveWait?.();
    if(this.recorder?.state!=="inactive")this.recorder?.stop();
  }

  async export(options:VideoExportOptions){
    this.cancelled=false;
    const canUseWebCodecs=typeof VideoEncoder!=="undefined"&&typeof VideoFrame!=="undefined";
    const canUseRecorder=typeof MediaRecorder!=="undefined"&&typeof HTMLCanvasElement.prototype.captureStream==="function";
    if(!canUseWebCodecs&&!canUseRecorder)throw new Error("This browser does not provide a compatible VP9/VP8 video encoder.");
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
        drawOverlay(context,width,height,formatTime(sample.hour),options.composition==="comparison");
      };
      renderAt(0);
      const bitrate=options.resolution==="1080p"?12_000_000:7_000_000;
      const candidates=[{codec:"vp09.00.10.08",webmCodec:"vp9" as const},{codec:"vp8",webmCodec:"vp8" as const}];
      let selected:(typeof candidates)[number]|null=null,configuration:VideoEncoderConfig|null=null;
      if(canUseWebCodecs)for(const candidate of candidates){
        const proposed:VideoEncoderConfig={codec:candidate.codec,width,height,bitrate,framerate:options.frameRate,latencyMode:"quality"};
        try{if((await VideoEncoder.isConfigSupported(proposed)).supported){selected=candidate;configuration=proposed;break;}}catch{/* try the next WebM codec */}
      }
      const totalFrames=exportFrameCount(options.durationSeconds,options.frameRate),frameDurationUs=1_000_000/options.frameRate;
      let blob:Blob;
      if(selected&&configuration){
        const chunks:WebMVideoChunk[]=[];let encoderError:Error|null=null;
        this.encoder=new VideoEncoder({
          output:chunk=>{const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);chunks.push({timestamp:chunk.timestamp,duration:chunk.duration??Math.round(frameDurationUs),type:chunk.type,data});},
          error:error=>{encoderError=error;},
        });
        this.encoder.configure(configuration);report("recording",0,"Encoding timestamped midnight → midnight frames…");
        for(let frameIndex=0;frameIndex<totalFrames&&!this.cancelled;frameIndex++){
          const progress=exportFrameProgress(frameIndex,totalFrames);renderAt(progress);
          const timestamp=Math.round(frameIndex*frameDurationUs),nextTimestamp=Math.round((frameIndex+1)*frameDurationUs);
          const frame=new VideoFrame(outputCanvas,{timestamp,duration:nextTimestamp-timestamp});
          this.encoder.encode(frame,{keyFrame:frameIndex%Math.round(options.frameRate*2)===0});frame.close();
          if(this.encoder.encodeQueueSize>=6)await this.encoder.flush();
          if(encoderError)throw encoderError;
          report("recording",progress,`Encoding ordered frame ${frameIndex+1} / ${totalFrames}`);
          if(frameIndex%2===1)await new Promise<void>(resolve=>setTimeout(resolve,0));
        }
        if(this.cancelled){report("cancelled",0,"Export cancelled");return null;}
        await this.encoder.flush();if(encoderError)throw encoderError;this.encoder.close();this.encoder=null;
        chunks.sort((a,b)=>a.timestamp-b.timestamp);
        blob=muxWebM({width,height,frameRate:options.frameRate,durationUs:options.durationSeconds*1_000_000,codec:selected.webmCodec,chunks});
      }else{
        const mimeCandidates=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"],mimeType=mimeCandidates.find(type=>MediaRecorder.isTypeSupported(type));
        if(!mimeType)throw new Error("This browser does not provide a MediaRecorder VP9 or VP8 encoder.");
        this.stream=outputCanvas.captureStream(0);const track=this.stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack|undefined;
        if(!track||typeof track.requestFrame!=="function")throw new Error("This browser cannot submit deterministic canvas frames for export.");
        const recorded:BlobPart[]=[];this.recorder=new MediaRecorder(this.stream,{mimeType,videoBitsPerSecond:bitrate});
        const stopped=new Promise<Blob>((resolve,reject)=>{
          this.recorder!.ondataavailable=event=>{if(event.data.size)recorded.push(event.data);};
          this.recorder!.onerror=()=>reject(new Error("The browser video encoder stopped unexpectedly."));
          this.recorder!.onstop=()=>resolve(new Blob(recorded,{type:mimeType}));
        });
        this.recorder.start();report("recording",0,"Encoding ordered midnight → midnight frames…");
        for(let frameIndex=0;frameIndex<totalFrames&&!this.cancelled;frameIndex++){
          const progress=exportFrameProgress(frameIndex,totalFrames);renderAt(progress);track.requestFrame();
          report("recording",progress,`Encoding ordered frame ${frameIndex+1} / ${totalFrames}`);
          await new Promise<void>(resolve=>{this.resolveWait=resolve;this.timer=window.setTimeout(resolve,1000/options.frameRate);});
          this.timer=0;this.resolveWait=null;
        }
        if(this.recorder.state!=="inactive")this.recorder.stop();const recordedBlob=await stopped;
        if(this.cancelled){report("cancelled",0,"Export cancelled");return null;}
        const frames=await extractWebMVideoFrames(recordedBlob),durationUs=options.durationSeconds*1_000_000;
        if(frames.length<totalFrames*.9)throw new Error(`The browser encoded only ${frames.length} of ${totalFrames} requested frames.`);
        const chunks=frames.map((frame,index)=>{const timestamp=Math.round(index*durationUs/frames.length),next=Math.round((index+1)*durationUs/frames.length);return {...frame,timestamp,duration:next-timestamp};});
        blob=muxWebM({width,height,frameRate:frames.length/options.durationSeconds,durationUs,codec:mimeType.includes("vp8")?"vp8":"vp9",chunks});
      }
      report("finalizing",1,"Muxing exact 30 FPS WebM timeline…");
      if(!blob.size)throw new Error("The browser returned an empty video.");
      const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=exportFilename(options.date,options.composition);link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
      report("complete",1,"WebM downloaded");return {blob,filename:link.download,mimeType:blob.type};
    }catch(error){
      if(this.cancelled||(error instanceof DOMException&&error.name==="AbortError")){report("cancelled",0,"Export cancelled");return null;}
      report("error",0,error instanceof Error?error.message:"Video export failed");throw error;
    }finally{
      if(this.encoder&&this.encoder.state!=="closed")this.encoder.close();this.encoder=null;renderer?.destroy();
      if(this.timer)clearTimeout(this.timer);this.timer=0;this.resolveWait=null;
      if(this.recorder?.state!=="inactive")this.recorder?.stop();this.recorder=null;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    }
  }
}
