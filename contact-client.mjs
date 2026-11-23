
export async function sendNote(action, fields, signal, request = fetch) {
  const endpoint = new URL(action);
  if (endpoint.origin !== 'https://formsubmit.co') throw Error('Unexpected contact service.');
  endpoint.pathname = '/ajax' + endpoint.pathname;
  const response = await request(endpoint, {
    method:'POST', headers:{Accept:'application/json','Content-Type':'application/json'},
    credentials:'omit', referrerPolicy:'strict-origin-when-cross-origin', signal,
    body:JSON.stringify(Object.fromEntries(fields))
  });
  let result;
  try { result=await response.json(); } catch { result=null; }
  const note=String(result?.message || '');
  if (response.status === 429) return 'rate';
  if (/activat|confirm your email|verify your email/i.test(note)) return 'activation';
  if (/captcha|challenge/i.test(note)) return 'challenge';
  if (response.ok && (result?.success === true || result?.success === 'true')) return 'accepted';
  return 'failure';
}

export function enableContact(form) {
  const button=form.querySelector('[type="submit"]');
  const status=form.querySelector('[data-send-status]');
  const challenge=form.querySelector('[data-provider-check]');
  const messages={
    accepted:'FormSubmit accepted your note. Thank you for writing.',
    activation:'The service is waiting for inbox activation. Delivery is unconfirmed. You can reach me on Instagram.',
    challenge:'The service needs a verification step. Continue on FormSubmit to finish.',
    rate:'Too many attempts. Please wait a while and try again.',
    failure:'The service did not confirm your note. Your text is still here. Try again or contact me on Instagram.',
    timeout:'The request timed out. Delivery is unconfirmed. Your text is still here.'
  };
  let busy=false;
  let native=false;
  challenge.addEventListener('click',()=>{
    if(busy || !form.reportValidity()) return;
    native=true;
    form.requestSubmit();
  });
  form.addEventListener('input', event=>event.target.setCustomValidity?.(''));
  form.addEventListener('submit', async event=>{
    if(native){native=false;return;}
    event.preventDefault();
    if(busy) return;
    for(const name of ['name','email','message']){
      const field=form.elements.namedItem(name);
      field.value=field.value.trim();
      if(!field.value || (name==='message' && field.value.length < 5)) field.setCustomValidity(name==='message'?'Please write at least five characters.':'Please complete this field.');
    }
    if(!form.reportValidity()) return;
    if(form.elements.namedItem('_honey').value){status.textContent='This form could not be submitted.';return;}
    const fields=new FormData(form);
    fields.set('_url',location.origin + location.pathname);
    busy=true;button.disabled=true;form.setAttribute('aria-busy','true');
    challenge.hidden=true;status.textContent='Sending your note…';
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),16000);
    try {
      const outcome=await sendNote(form.action, fields, controller.signal);
      status.textContent=messages[outcome];
      challenge.hidden=outcome!=='challenge';
      if(outcome==='accepted') form.reset();
    } catch(error) {
      status.textContent=error.name==='AbortError'?messages.timeout:messages.failure;
    } finally {
      clearTimeout(timer);busy=false;button.disabled=false;form.removeAttribute('aria-busy');
    }
  });
}
