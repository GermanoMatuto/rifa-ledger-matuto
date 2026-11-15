// Aggregate navigation counters only: no contact data, wallet, URL or session ID is sent.
export function trackNavigation(event:'landing'|'selection'|'checkout'){
 if(new URLSearchParams(window.location.search).get('teste')==='1')return;
 try{const key='matuto-navigation-v1:'+event;if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1')}catch{return}
 void fetch('/api/raffle/events',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,device:window.matchMedia('(max-width:700px)').matches?'mobile':'desktop'}),keepalive:true}).catch(()=>{});
}
