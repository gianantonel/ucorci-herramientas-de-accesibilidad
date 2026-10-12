import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
process.env.DATABASE_URL='file:./data/test-'+randomUUID()+'.db';
process.env.AUTH_SECRET='local-tests-only-'+randomUUID()+randomUUID();
const {default:app}=await import('../server/app.mjs');
const {database}=await import('../server/db.mjs');
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const origin='http://localhost:'+server.address().port;
process.env.APP_URL=origin;
let cookies={};
async function request(path,options={}){
 const response=await fetch(origin+path,{redirect:'manual',...options,headers:{Origin:origin,Cookie:Object.entries(cookies).map(([key,value])=>key+'='+value).join('; '),...options.headers}});
 for(const cookie of response.headers.getSetCookie()){const [pair]=cookie.split(';');const at=pair.indexOf('=');cookies[pair.slice(0,at)]=pair.slice(at+1);}
 return response;
}
const json=(body)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('SQLite, registro, sesión persistente, CSRF y métricas privadas',async()=>{
 try{
  assert.equal((await request('/api/me')).status,401);
  const registration={firstName:'Prueba',lastName:'Local',email:'prueba@example.invalid',password:'Prueba-segura-local-2026',consent:true};
  assert.equal((await request('/api/register',{...json(registration),headers:{'Content-Type':'application/json',Origin:'https://otro.example'}})).status,403);
  assert.equal((await request('/api/register',json({...registration,password:'short'}))).status,400);
  assert.equal((await request('/api/register',json(registration))).status,201);
  const row=(await database().client.execute('SELECT passwordHash FROM users')).rows[0];assert.notEqual(row.passwordHash,registration.password);assert.match(row.passwordHash,/^\$2[aby]\$/);
  const csrf=await(await request('/api/auth/csrf')).json();assert.ok(csrf.csrfToken);
  const login=await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({csrfToken:csrf.csrfToken,email:registration.email,password:registration.password,callbackUrl:origin})});
  const result=await login.json();assert.ok(!result.url.includes('error='),JSON.stringify(result));
  assert.ok(Object.keys(cookies).some(name=>name.includes('session-token')));
  const me=await(await request('/api/me')).json();assert.equal(me.user.email,registration.email);assert.equal(me.user.firstName,'Prueba');assert.equal(me.user.passwordHash,undefined);
  assert.equal((await request('/api/me')).status,200,'mismo dispositivo conserva la sesión');
  assert.equal((await request('/api/events',json({tool:'stt',durationMs:25,result:'success',text:'PRIVATE CONTENT'}))).status,200);
  assert.equal((await request('/api/events',json({tool:'unknown',durationMs:25,result:'success'}))).status,400);
  const exported=await(await request('/api/account/export')).json();assert.equal(exported.usage.length,1);assert.ok(!JSON.stringify(exported).includes('PRIVATE CONTENT'));assert.equal(exported.user.passwordHash,undefined);
  const stranger=await fetch(origin+'/api/account/export');assert.equal(stranger.status,401);
  assert.equal((await request('/api/account',{method:'DELETE'})).status,200);
  assert.equal((await request('/api/me')).status,401,'eliminar cuenta revoca el acceso con el JWT anterior');
  assert.equal((await database().client.execute('SELECT count(*) AS total FROM usage_events')).rows[0].total,0);
 }finally{await new Promise(resolve=>server.close(resolve));database().client.close();}
});
