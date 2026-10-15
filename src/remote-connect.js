import QRCode from 'qrcode';

export function createRemoteConnect(){
  const dialog=document.createElement('dialog');dialog.className='remote-connect-dialog';
  dialog.setAttribute('aria-labelledby','remoteConnectTitle');dialog.setAttribute('aria-describedby','remoteConnectHelp');
  dialog.innerHTML=`<div class="dialog-heading"><h2 id="remoteConnectTitle">Connect your phone</h2><button type="button" data-close aria-label="Close phone connection dialog">×</button></div>
    <div class="remote-connect-body"><div class="remote-connect-qr"><canvas role="img" aria-label="Scan to open this presentation’s phone remote"></canvas><p data-qr-error role="status" hidden>QR code unavailable. Use the link instead.</p></div>
    <div class="remote-connect-info"><p id="remoteConnectHelp">Scan with your phone camera, then sign in with the same Google account.</p><label>Phone remote link<input data-address readonly type="url" aria-label="Phone remote connection link"></label>
    <div class="remote-connect-actions"><button type="button" data-copy>Copy link</button><a data-open target="_blank" rel="noopener">Open remote ↗</a></div><p data-status role="status" aria-live="polite"></p></div></div>`;
  document.body.append(dialog);
  const input=dialog.querySelector('[data-address]'),canvas=dialog.querySelector('canvas'),error=dialog.querySelector('[data-qr-error]'),status=dialog.querySelector('[data-status]');
  let address='',opener=null,token=0;
  function update(value){
    if(value===address)return;
    address=value;const current=++token;input.value=value;dialog.querySelector('[data-open]').href=value;status.textContent='';
    canvas.hidden=true;error.hidden=true;
    // Generate the code in this browser; the session link never goes to a QR service.
    QRCode.toCanvas(canvas,value,{width:520,margin:4,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}}).then(()=>{if(current===token){canvas.style.width='100%';canvas.style.height='auto';canvas.hidden=false;}}).catch(()=>{if(current===token)error.hidden=false;});
  }
  dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{status.textContent='';if(opener?.isConnected)opener.focus({preventScroll:true});});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  dialog.querySelector('[data-copy]').addEventListener('click',async()=>{
    const copied=address;
    try{await navigator.clipboard.writeText(copied);if(address===copied)status.textContent='Link copied. Open it on your phone.';}
    catch{input.focus();input.select();status.textContent='Select and copy this link to open it on your phone.';}
  });
  return {update,open(value){opener=document.activeElement;update(value);if(!dialog.open)dialog.showModal();},close(){++token;address='';if(dialog.open)dialog.close();}};
}
