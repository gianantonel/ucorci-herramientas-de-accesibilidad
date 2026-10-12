import app from './app.mjs';
import express from 'express';
import {createServer} from 'vite';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {limited} from './db.mjs';
app.post('/api/tts',async(req,res)=>{
 try{
  const {getSession}=await import('@auth/express');
  // Use the same protected endpoint as the production Python function.
  const allowed=await fetch((process.env.APP_URL||'http://localhost:3000')+'/api/tts-permit',{headers:{Cookie:req.headers.cookie||''}});
  if(allowed.status!==200)return res.status(allowed.status).json(await allowed.json());
  if(req.get('origin')!==(process.env.APP_URL||'http://localhost:3000'))return res.status(403).json({error:'Origen no permitido.'});
  const text=typeof req.body?.text==='string'?req.body.text.trim():'';
  if(!text||text.length>5000)return res.status(400).json({error:'Ingresá entre 1 y 5000 caracteres.'});
  const python=spawn(process.env.PYTHON_BIN||'python',['api/tts.py'],{env:{...process.env,PYTHONPATH:resolve('.python-local')},windowsHide:true});
  let chunks=[],size=0;let sent=false;
  const timer=setTimeout(()=>python.kill(),55000);
  python.stdout.on('data',chunk=>{size+=chunk.length;if(size>4000000)python.kill();else chunks.push(chunk);});
  python.stderr.on('data',()=>{});
  python.on('error',()=>{clearTimeout(timer);if(!sent){sent=true;res.status(503).json({error:'Configurá PYTHON_BIN e instalá requirements.txt para generar audio en desarrollo.'});}});
  python.on('close',code=>{clearTimeout(timer);if(sent)return;sent=true;if(code!==0||!size||size>4000000)return res.status(503).json({error:'Google Translate no respondió. Intentá más tarde.'});res.type('audio/mpeg').set('Cache-Control','no-store').send(Buffer.concat(chunks));});
  python.stdin.end(JSON.stringify({text,slow:Boolean(req.body.slow)}));
 }catch{res.status(503).json({error:'No se pudo generar audio.'});}
});
if(process.env.NODE_ENV==='production'){app.use(express.static('dist'));app.get('*',(req,res)=>res.sendFile('index.html',{root:'dist'}));}
else {const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
app.listen(3000,'127.0.0.1',()=>console.log('UCORCI disponible en http://localhost:3000'));
