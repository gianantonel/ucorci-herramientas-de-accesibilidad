import {test,expect} from '@playwright/test';
test('Whisper base transcribe un WAV real',async({page})=>{
 test.skip(process.env.RUN_STT_TESTS!=='1','Prueba de descarga de modelo opcional');
 test.setTimeout(360000);
 page.on('console',message=>{if(message.type()==='error')console.log('Consola:',message.text());});
 page.on('pageerror',error=>console.log('Error de página:',error.message));
 await page.goto('/');await page.getByRole('button',{name:'Registrarse gratis',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Nombre',{exact:true}).fill('Prueba');await dialog.getByLabel('Apellido',{exact:true}).fill('Whisper');await dialog.getByLabel('Correo electrónico').fill(`whisper-${Date.now()}@example.invalid`);await dialog.getByLabel('Contraseña',{exact:true}).fill('Prueba-Whisper-Local-2026');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Crear mi cuenta gratis'}).click();await expect(dialog).not.toBeVisible();
 await page.getByRole('link',{name:'Abrir Audio a texto',exact:true}).click();await page.getByLabel('Cargar audio').setInputFiles('data/voice-sample.wav');await page.getByRole('button',{name:'Convertir audio a texto',exact:true}).click();
 const logger=setInterval(async()=>{try{console.log('Whisper:',await page.getByRole('status').allTextContents(),await page.getByRole('alert').allTextContents());}catch{}},30000);
 try{await Promise.race([expect(page.getByLabel('Transcripción en texto plano')).toHaveValue(/Córdoba|Argentina/i,{timeout:300000}),page.getByRole('alert').waitFor({timeout:300000}).then(async()=>{throw Error(await page.getByRole('alert').innerText());})]);}finally{clearInterval(logger);}
 console.log('Transcripción real verificada.');
});
