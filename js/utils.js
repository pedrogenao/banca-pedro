/* ========================================================================
   UTILS.JS
   Utilidades compartidas por toda la app: formateo de dinero/fechas/horas, retención y purga de datos antiguos, sonido de notificación, cuenta regresiva del sorteo, abrir/cerrar modales.
   ======================================================================== */

/* ======================================================================
   RETENCIÓN DE DATOS: la app solo conserva los últimos 30 días de
   actividad (jugadas, cobros, depósitos, cajas, ajustes/recargas y
   nómina). Se ejecuta de forma silenciosa cada vez que el admin inicia
   sesión.

   IMPORTANTE — "arrastre" de saldo: la pantalla "Saldo" de la banca resta
   el historial de ajustes/nómina y SUMA la ganancia neta acumulada de las
   rachas de martingala ya cerradas (ver calcularCiclosGananciaNetaMartingala
   en resultados-engine.js), calculada a partir de las jugadas confirmadas.
   Si simplemente borráramos esos registros al cumplir 30 días, esa suma se
   rompería y el saldo mostrado quedaría mal para siempre. Por eso, antes
   de borrar cada grupo de registros viejos, sumamos su efecto en el saldo
   y lo guardamos en sistema_config/arrastreSaldo (ver ARRASTRE_SALDO en
   state.js). El cálculo de "Saldo" (saldo.js y admin-core.js) le suma ese
   arrastre al total en vivo, así el número sigue siendo correcto aunque
   el detalle día a día de hace más de 30 días ya no exista.
   ====================================================================== */
const RETENCION_DIAS = 30;
const RETENCION_CHAT_DIAS = 7; // el chat conserva siempre la última semana

function limiteRetencion(){
  const limite = new Date();
  limite.setHours(0,0,0,0);
  limite.setDate(limite.getDate() - RETENCION_DIAS);
  return limite;
}
function limiteRetencionChat(){
  // Para el chat usamos hora exacta (no medianoche): "última semana" = últimas
  // 7x24 horas desde ahora mismo, no desde el inicio del día.
  return new Date(Date.now() - RETENCION_CHAT_DIAS*24*60*60*1000);
}
function limiteRetencionStr(){
  return fechaStrDeTimestamp(limiteRetencion());
}
async function purgarPorFechaString(coleccion, limiteStr){
  try{
    const snap = await db.collection(coleccion).where('fecha','<', limiteStr).get();
    if(snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(d=> batch.delete(d.ref));
    await batch.commit();
  }catch(e){ console.error(`No se pudo limpiar ${coleccion}:`, e); }
}
async function purgarPorTimestamp(coleccion, campo, limiteDate){
  try{
    const snap = await db.collection(coleccion).where(campo,'<', limiteDate).get();
    if(snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(d=> batch.delete(d.ref));
    await batch.commit();
  }catch(e){ console.error(`No se pudo limpiar ${coleccion}:`, e); }
}

/* Suma un incremento al documento sistema_config/arrastreSaldo dentro del
   MISMO batch que borra los registros, para que la resta/suma nunca quede
   descuadrada (o se hacen las dos cosas, o no se hace ninguna). */
function incrementarArrastreEnBatch(batch, campo, monto){
  if(!monto) return;
  batch.set(db.collection(COL_CONFIG).doc('arrastreSaldo'),
    { [campo]: firebase.firestore.FieldValue.increment(monto) },
    { merge:true });
}

/* Ajustes/recargas: TODOS suman al saldo asignado a los vendedores (sin
   importar el tipo, inicial o recarga), así que se guarda el 100% de lo
   purgado. */
async function purgarAjustesConArrastre(limiteDate){
  try{
    const snap = await db.collection(COL_AJUSTES).where('fecha','<', limiteDate).get();
    if(snap.empty) return;
    const suma = snap.docs.reduce((s,d)=> s + (d.data().monto||0), 0);
    const batch = db.batch();
    snap.docs.forEach(d=> batch.delete(d.ref));
    incrementarArrastreEnBatch(batch, 'asignadoVendedores', suma);
    await batch.commit();
  }catch(e){ console.error('No se pudo limpiar ajustes:', e); }
}

/* Depósitos: nunca se purgan los "pendientes" (todavía esperan que el
   admin los confirme o rechace, sin importar su fecha). De los que sí se
   purgan, solo los "confirmado" suman al saldo. */
async function purgarDepositosConArrastre(limiteDate){
  try{
    const snap = await db.collection(COL_DEPOSITOS).where('fechaEnvio','<', limiteDate).get();
    if(snap.empty) return;
    const docsAPurgar = snap.docs.filter(d=> d.data().estado !== 'pendiente');
    if(docsAPurgar.length===0) return;
    const suma = docsAPurgar.reduce((s,d)=> s + (d.data().estado==='confirmado' ? (d.data().monto||0) : 0), 0);
    const batch = db.batch();
    docsAPurgar.forEach(d=> batch.delete(d.ref));
    incrementarArrastreEnBatch(batch, 'depositosConfirmados', suma);
    await batch.commit();
  }catch(e){ console.error('No se pudo limpiar depósitos:', e); }
}

/* Nómina: nunca se purgan los descuentos "pendientes" (todavía no se han
   aplicado a un pago, sin importar su fecha; hay que conservarlos hasta
   que se paguen). De los que sí se purgan, solo los "pago" suman
   (restando) al saldo. */
async function purgarNominaConArrastre(limiteDate){
  try{
    const snap = await db.collection(COL_NOMINA).where('fecha','<', limiteDate).get();
    if(snap.empty) return;
    const docsAPurgar = snap.docs.filter(d=> d.data().estado !== 'pendiente');
    if(docsAPurgar.length===0) return;
    const suma = docsAPurgar.reduce((s,d)=> s + (d.data().tipo==='pago' ? (d.data().montoNeto||0) : 0), 0);
    const batch = db.batch();
    docsAPurgar.forEach(d=> batch.delete(d.ref));
    incrementarArrastreEnBatch(batch, 'pagosNomina', suma);
    await batch.commit();
  }catch(e){ console.error('No se pudo limpiar nómina:', e); }
}

/* Cobros: nunca se purgan los "pendiente"/"aceptada" (siguen un flujo
   activo con el jugador). De los que sí se purgan (confirmada/rechazada),
   solo los "confirmada" suman al saldo. */
async function purgarCobrosConArrastre(limiteDate){
  try{
    const snap = await db.collection(COL_COBROS).where('fechaEnvio','<', limiteDate).get();
    if(snap.empty) return;
    const docsAPurgar = snap.docs.filter(d=> d.data().estado==='confirmada' || d.data().estado==='rechazada');
    if(docsAPurgar.length===0) return;
    const suma = docsAPurgar.reduce((s,d)=> s + (d.data().estado==='confirmada' ? (d.data().monto||0) : 0), 0);
    const batch = db.batch();
    docsAPurgar.forEach(d=> batch.delete(d.ref));
    incrementarArrastreEnBatch(batch, 'cobrosConfirmados', suma);
    await batch.commit();
  }catch(e){ console.error('No se pudo limpiar cobros:', e); }
}

/* Jugadas: "Saldo actual" ya no suma cobros/depósitos directamente, sino
   la GANANCIA NETA de las rachas de martingala que se cerraron ganando
   (ver calcularCiclosGananciaNetaMartingala en resultados-engine.js), que
   se calcula a partir de las jugadas confirmadas. Por eso, antes de
   borrar las jugadas con más de 30 días, hay que congelar en el arrastre
   la parte de esa ganancia neta que corresponde a rachas cuyo sorteo
   ganador (el que cierra la racha) ya quedó fuera del período de
   retención — si no, "Saldo" perdería ese dinero apenas se purgue el
   detalle día a día. */
async function purgarJugadasConArrastre(limiteStr){
  try{
    const ciclos = await calcularCiclosGananciaNetaMartingala();
    const sumaArrastre = ciclos
      .filter(c => c.fecha < limiteStr)
      .reduce((s,c)=> s + c.gananciaNeta, 0);

    const snap = await db.collection(COL_JUGADAS).where('fecha','<', limiteStr).get();
    if(snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(d=> batch.delete(d.ref));
    incrementarArrastreEnBatch(batch, 'gananciaNetaMartingala', sumaArrastre);
    await batch.commit();
  }catch(e){ console.error('No se pudo limpiar jugadas:', e); }
}

async function purgarDatosAntiguos(){
  if(!esAdmin()) return; // solo el admin dispara la limpieza automática
  const limite = limiteRetencion();
  const limiteStr = fechaStrDeTimestamp(limite);
  // Jugadas: con arrastre hacia sistema_config/arrastreSaldo (ver arriba)
  // para no dañar el cálculo de "Saldo" cuando se purgan rachas de martingala ya cerradas.
  await purgarJugadasConArrastre(limiteStr);
  await purgarPorFechaString(COL_CAJA, limiteStr);
  // Colecciones con fecha como Timestamp de Firestore, con arrastre hacia
  // sistema_config/arrastreSaldo para no dañar el cálculo de "Saldo".
  await purgarCobrosConArrastre(limite);
  await purgarDepositosConArrastre(limite);
  await purgarAjustesConArrastre(limite);
  await purgarNominaConArrastre(limite);
  // Chat: conserva siempre la última semana (retención propia, más corta)
  if(typeof limpiarMensajesChatAntiguos === 'function') await limpiarMensajesChatAntiguos(false);
}

/* ---------------- utilidades ---------------- */
function toast(msg, tipo){
  const el = document.createElement('div');
  el.className = 'toast' + (tipo ? ' '+tipo : '');
  el.textContent = msg;
  document.getElementById('toastWrap').appendChild(el);
  setTimeout(()=>el.remove(), 4200);
}

/* ======================================================================
   TIMBRE / SONIDO DE NOTIFICACIÓN
   Suena cada vez que el vendedor recibe una jugada nueva enviada por el
   admin. Se genera con Web Audio (sin archivos externos) para que el
   único archivo de la app siga siendo este HTML.
   Los navegadores bloquean el audio hasta que hay una interacción del
   usuario, así que "desbloqueamos" el AudioContext en el primer toque o
   clic en la página (y también al enviar el formulario de login).
   ====================================================================== */
let audioCtxNotificacion = null;
function obtenerAudioCtxNotificacion(){
  if(!audioCtxNotificacion){
    try{ audioCtxNotificacion = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e){ return null; }
  }
  if(audioCtxNotificacion.state === 'suspended'){ audioCtxNotificacion.resume().catch(()=>{}); }
  return audioCtxNotificacion;
}
['click','touchstart','keydown'].forEach(ev=>{
  document.addEventListener(ev, ()=> obtenerAudioCtxNotificacion(), { once:true, passive:true });
});
function reproducirTimbreNotificacion(){
  const ctx = obtenerAudioCtxNotificacion();
  if(!ctx) return;
  const ahora = ctx.currentTime;
  // "Ding-dong, ding-dong" clásico: dos tonos alternos
  const notas = [
    { freq:880, inicio:0.00, dur:0.22 },
    { freq:659, inicio:0.22, dur:0.28 },
    { freq:880, inicio:0.60, dur:0.22 },
    { freq:659, inicio:0.82, dur:0.30 },
  ];
  notas.forEach(n=>{
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0, ahora + n.inicio);
    gain.gain.linearRampToValueAtTime(0.35, ahora + n.inicio + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ahora + n.inicio + n.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ahora + n.inicio);
    osc.stop(ahora + n.inicio + n.dur + 0.03);
  });
  if(navigator.vibrate){ navigator.vibrate([160,80,160]); }
}
/* Muestra el toast + hace sonar el timbre. Se usa cuando llega algo
   nuevo del admin mientras el vendedor tiene la app abierta. */
function notificarNuevoEnvioAdmin(mensaje){
  toast(mensaje, 'success');
  reproducirTimbreNotificacion();
}

function fmtMoney(n){ return 'RD$' + (Number(n)||0).toLocaleString('es-DO',{minimumFractionDigits:0, maximumFractionDigits:2}); }
function fmtFechaHora(ts){
  if(!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('es-DO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
/// Equivalente en JS de VentasHelpers.parseNumeros (Dart): el campo
/// 'numeros_generados' puede venir como lista (lo normal) o como texto
/// legado separado por espacios/comas. Nunca hacemos raw.toString() de
/// una lista completa (eso rompería el formato "[05, 12, 33]").
function parseNumerosField(raw){
  if(raw === null || raw === undefined) return [];
  if(Array.isArray(raw)){
    return raw.map(e=>String(e).trim().replace(/[^0-9]/g,'')).filter(e=>e.length>0);
  }
  const matches = String(raw).match(/\d+/g);
  return matches || [];
}

function generarTicketId(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0/I/1 para evitar confusión
  let out = '';
  for(let i=0;i<7;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
async function sha256(texto){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function tagEstado(estado){
  const map = { pendiente:'Pendiente', aceptada:'Aceptada', confirmada:'Confirmada', confirmado:'Confirmado', solicitado:'Solicitado', rechazada:'Rechazada' };
  return `<span class="tag tag-${estado}">${map[estado]||estado}</span>`;
}
function tagMetodo(metodo){
  if(metodo === 'transferencia') return `<span class="metodo-tag transferencia"> Transferencia</span>`;
  return `<span class="metodo-tag efectivo"> Efectivo</span>`;
}

/* ======================================================================
   CUENTA REGRESIVA HASTA LA HORA DEL SORTEO
   Cada jugada pendiente/aceptada muestra cuánto tiempo queda para jugar
   sus números, en base al campo limiteJuego ("YYYY-MM-DDTHH:MM:SS").
   ====================================================================== */
function renderCountdownHTML(jugada){
  if(!jugada.limiteJuego) return '';
  return `<span class="countdown" data-limite="${jugada.limiteJuego}"><span class="dot"></span><span class="cd-txt">calculando…</span></span>`;
}
function textoCountdown(limiteIso){
  const destino = new Date(limiteIso).getTime();
  if(isNaN(destino)) return { texto:'Sin hora definida', clase:'cd-closed' };
  const restante = destino - Date.now();
  if(restante <= 0) return { texto:' Sorteo cerrado', clase:'cd-closed' };
  const totalSeg = Math.floor(restante/1000);
  const h = Math.floor(totalSeg/3600);
  const m = Math.floor((totalSeg%3600)/60);
  const s = totalSeg%60;
  const pad = n=>String(n).padStart(2,'0');
  const texto = h>0 ? ` ${h}h ${pad(m)}m para el sorteo` : ` ${pad(m)}:${pad(s)} para el sorteo`;
  let clase = 'cd-ok';
  if(restante <= 5*60*1000) clase = 'cd-danger';
  else if(restante <= 30*60*1000) clase = 'cd-warn';
  return { texto, clase };
}
function actualizarCountdowns(){
  document.querySelectorAll('.countdown[data-limite]').forEach(el=>{
    const { texto, clase } = textoCountdown(el.dataset.limite);
    el.classList.remove('cd-ok','cd-warn','cd-danger','cd-closed');
    el.classList.add(clase);
    const txtEl = el.querySelector('.cd-txt');
    if(txtEl) txtEl.textContent = texto;
  });
}
setInterval(actualizarCountdowns, 1000);

function openModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }
document.querySelectorAll('[data-close]').forEach(b=>{
  b.addEventListener('click', (e)=>{
    e.target.closest('.modal-bg').classList.remove('show');
  });
});


function formatHora12(hora24){
  if(!hora24) return '';
  const [h,m] = hora24.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if(h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2,'0')} ${periodo}`;
}


function fmtMoneySigned(n){
  const signo = n < 0 ? '-' : '';
  return signo + fmtMoney(Math.abs(n));
}
function hoyStrLocal(){ return hoyStr(); }

