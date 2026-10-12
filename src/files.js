export const MAX_FILE_BYTES=20*1024*1024;
export async function extractText(file){
 if(file.size>MAX_FILE_BYTES)throw new Error('El archivo supera 20 MB. Usá un archivo más pequeño.');
 const extension=file.name.split('.').pop().toLowerCase();
 if(extension==='txt')return file.text();
 if(['html','htm'].includes(extension)){
  const doc=new DOMParser().parseFromString(await file.text(),'text/html');
  doc.querySelectorAll('script,style,noscript,template').forEach(el=>el.remove());
  doc.querySelectorAll('br,p,div,section,article,h1,h2,h3,li,tr').forEach(el=>el.append('\n'));
  return doc.body.textContent.replace(/\n\s*\n\s*\n/g,'\n\n').trim();
 }
 if(extension==='docx'){
  const mammoth=await import('mammoth/mammoth.browser');
  return (await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value;
 }
 if(extension==='xlsx'){
  const {default:readXlsxFile}=await import('read-excel-file');
  const {readSheetNames}=await import('read-excel-file');
  const names=await readSheetNames(file);let texts=[];
  for(const name of names){const rows=await readXlsxFile(file,{sheet:name});texts.push(name+'\n'+rows.map(row=>row.map(value=>value instanceof Date?value.toLocaleDateString('es-AR'):String(value??'')).join('\t')).join('\n'));}
  return texts.join('\n\n');
 }
 if(extension==='pdf'){
  const pdfjs=await import('pdfjs-dist');
  const {default:workerUrl}=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const pdf=await pdfjs.getDocument({data:await file.arrayBuffer(),isEvalSupported:false}).promise;
  try{let pages=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();pages.push(content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join(''));}const text=pages.join('\n\n').trim();if(!text)throw new Error('Este PDF contiene imágenes o está escaneado. Necesita reconocimiento óptico de caracteres (OCR), todavía no disponible.');return text;}finally{await pdf.destroy();}
 }
 throw new Error('Formato no compatible. Usá PDF con texto, Word .docx, Excel .xlsx, TXT o HTML. Convertí los archivos .doc y .xls al formato moderno.');
}
export function plainText(text){return text.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f\u20e3]/gu,'').replace(/[ \t]+/g,' ').trim();}
export function download(content,name,type='text/plain;charset=utf-8'){
 const blob=content instanceof Blob?content:new Blob([content],{type});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function mp3ToWav(blob){
 const context=new AudioContext();
 try{const audio=await context.decodeAudioData(await blob.arrayBuffer());const channels=audio.numberOfChannels,length=audio.length;const data=new ArrayBuffer(44+length*channels*2),view=new DataView(data);let offset=0;
 const word=s=>{for(const c of s)view.setUint8(offset++,c.charCodeAt(0));};const u16=n=>{view.setUint16(offset,n,true);offset+=2;};const u32=n=>{view.setUint32(offset,n,true);offset+=4;};
 word('RIFF');u32(data.byteLength-8);word('WAVE');word('fmt ');u32(16);u16(1);u16(channels);u32(audio.sampleRate);u32(audio.sampleRate*channels*2);u16(channels*2);u16(16);word('data');u32(length*channels*2);
 const samples=Array.from({length:channels},(_,i)=>audio.getChannelData(i));for(let i=0;i<length;i++)for(let ch=0;ch<channels;ch++){const sample=Math.max(-1,Math.min(1,samples[ch][i]));view.setInt16(offset,sample<0?sample*32768:sample*32767,true);offset+=2;}return new Blob([data],{type:'audio/wav'});
 }finally{await context.close();}
}
