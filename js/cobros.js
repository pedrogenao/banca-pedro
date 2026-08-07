/* ========================================================================
   COBROS.JS
   Cobros de jugadas ganadoras: selección y envío por el admin, y aceptación/confirmación por el jugador.
   ======================================================================== */

let JUGADAS_EN_ESPERA = []; // [jugada, ...] — confirmadas cuyo sorteo aún no publica resultado oficial
let JUGADAS_GANADORAS = []; // [{ jugada, aciertos, monto }] — solo jugadas confirmadas con acierto y sin cobro activo
let cobroSeleccionIds = new Set(); // ids de las jugadas ganadoras elegidas para enviar el cobro (selección múltiple)

/* Recorre las jugadas confirmadas y las separa en dos grupos:
   - en espera: aún no hay resultado oficial publicado para su lotería/fecha
   - ganadoras: ya hay resultado y al menos un número acertó */
async function poblarListaCobros(){
  const contEspera = document.getElementById('ncListaEspera');
  const contGanadoras = document.getElementById('ncListaGanadoras');
  contEspera.innerHTML = '<div class="cobro-select-empty">Buscando jugadas...</div>';
  contGanadoras.innerHTML = '<div class="cobro-select-empty">Buscando jugadas...</div>';
  document.getElementById('ncPreview').style.display = 'none';
  cobroSeleccionIds = new Set();
  actualizarBotonEnviarCobro();

  const confirmadas = JUGADAS.filter(j=>j.estado==='confirmada');
  JUGADAS_EN_ESPERA = [];
  JUGADAS_GANADORAS = [];

  for(const j of confirmadas){
    // Si ya hay un cobro activo (no rechazado) para esta jugada, no la ofrecemos de nuevo.
    const yaTieneCobro = COBROS.some(c=>c.jugadaId===j.id && c.estado!=='rechazada');
    if(yaTieneCobro) continue;
    const numerosResultado = await obtenerResultadoOficial(j.loteria, j.fecha);
    if(!numerosResultado){
      JUGADAS_EN_ESPERA.push(j);
      continue;
    }
    const calculo = calcularAciertosJugada(j, numerosResultado);
    if(calculo) JUGADAS_GANADORAS.push({ jugada:j, ...calculo });
  }

  // En espera: la más próxima a sortear primero. Ganadoras: el premio más alto primero.
  JUGADAS_EN_ESPERA.sort((a,b)=> new Date(a.limiteJuego||0) - new Date(b.limiteJuego||0));
  JUGADAS_GANADORAS.sort((a,b)=> b.monto - a.monto);

  renderListaEspera();
  renderListaGanadoras();
}

function renderListaEspera(){
  const cont = document.getElementById('ncListaEspera');
  document.getElementById('ncCountEspera').textContent = JUGADAS_EN_ESPERA.length;
  if(JUGADAS_EN_ESPERA.length===0){
    cont.innerHTML = '<div class="cobro-select-empty">No hay jugadas confirmadas esperando resultado.</div>';
    return;
  }
  cont.innerHTML = JUGADAS_EN_ESPERA.map(j=>{
    const vend = VENDEDORES.find(v=>v.usuario===j.vendedor);
    const nombreVend = vend ? vend.nombre : j.vendedor;
    const cd = renderCountdownHTML(j) || '<span class="countdown cd-closed"><span class="dot"></span><span class="cd-txt"> Esperando resultado oficial</span></span>';
    return `
      <div class="cobro-select-card espera">
        <div class="csc-top">
          <div class="csc-ticket">🎫 Ticket <span class="mono">${j.ticketId}</span></div>
          ${cd}
        </div>
        <div class="csc-mid">
          <span class="csc-tag">${j.loteria}</span>
          <span class="csc-tag">${j.tipoJugada || '—'}</span>
          <span class="csc-tag">${j.fecha}${j.horaSorteo ? ' · ' + j.horaSorteo : ''}</span>
        </div>
        <div class="csc-foot">@${nombreVend}${j.banca ? ' · ' + j.banca : ''}</div>
      </div>`;
  }).join('');
  actualizarCountdowns();
}

function renderListaGanadoras(){
  const cont = document.getElementById('ncListaGanadoras');
  document.getElementById('ncCountGanadoras').textContent = JUGADAS_GANADORAS.length;
  if(JUGADAS_GANADORAS.length===0){
    cont.innerHTML = '<div class="cobro-select-empty">Aún no hay jugadas confirmadas con números acertados.</div>';
    return;
  }
  cont.innerHTML = JUGADAS_GANADORAS.map(g=>{
    const vend = VENDEDORES.find(v=>v.usuario===g.jugada.vendedor);
    const nombreVend = vend ? vend.nombre : g.jugada.vendedor;
    return `
      <div class="cobro-select-card ganadora" data-id="${g.jugada.id}">
        <div class="csc-check" aria-hidden="true"></div>
        <div class="csc-top">
          <div class="csc-ticket"> Ticket <span class="mono">${g.jugada.ticketId}</span></div>
          <div class="csc-monto">${fmtMoney(g.monto)}</div>
        </div>
        <div class="csc-mid">
          <span class="csc-tag">${g.jugada.loteria}</span>
          <span class="csc-tag">${g.jugada.tipoJugada || '—'}</span>
          <span class="csc-tag">${g.jugada.fecha}</span>
        </div>
        <div class="csc-numeros">${g.aciertos.map(chipPremioHTML).join('')}</div>
        <div class="csc-foot">@${nombreVend}${g.jugada.banca ? ' · ' + g.jugada.banca : ''}</div>
        <div class="csc-select-hint"></div>
      </div>`;
  }).join('');
  cont.querySelectorAll('.cobro-select-card.ganadora').forEach(card=>{
    card.classList.toggle('selected', cobroSeleccionIds.has(card.dataset.id));
    card.addEventListener('click', ()=> toggleSeleccionCobro(card.dataset.id));
  });
}

/* Selección múltiple: cada toque agrega o quita la jugada del conjunto
   a enviar, sin afectar a las demás ya marcadas. */
function toggleSeleccionCobro(jugadaId){
  if(cobroSeleccionIds.has(jugadaId)) cobroSeleccionIds.delete(jugadaId);
  else cobroSeleccionIds.add(jugadaId);

  const card = document.querySelector(`#ncListaGanadoras .cobro-select-card[data-id="${jugadaId}"]`);
  if(card) card.classList.toggle('selected', cobroSeleccionIds.has(jugadaId));

  actualizarBotonEnviarCobro();
  actualizarPreviewCobro();
}

function actualizarBotonEnviarCobro(){
  const btn = document.getElementById('btnEnviarCobro');
  const n = cobroSeleccionIds.size;
  btn.disabled = n === 0;
  btn.textContent = n > 1 ? `Enviar ${n} solicitudes` : 'Enviar solicitud';
}

function chipPremioHTML(a){
  const medalla = a.posicion===1 ? '' : a.posicion===2 ? '' : '';
  const etiqueta = a.posicion===1 ? '1ra' : a.posicion===2 ? '2da' : '3ra';
  const clase = a.posicion===1 ? 'p1' : a.posicion===2 ? 'p2' : 'p3';
  return `<span class="premio-chip ${clase}">${medalla} <span class="num">${a.numero}</span> · ${etiqueta}· x${a.multiplicador} · ${fmtMoney(a.premio)}</span>`;
}
function actualizarPreviewCobro(){
  const preview = document.getElementById('ncPreview');
  const seleccionadas = JUGADAS_GANADORAS.filter(x=>cobroSeleccionIds.has(x.jugada.id));
  if(seleccionadas.length===0){ preview.style.display = 'none'; return; }

  if(seleccionadas.length===1){
    // Una sola jugada: mostramos el detalle completo como antes.
    const g = seleccionadas[0];
    document.getElementById('ncPreviewTitulo').textContent = 'Resumen del cobro';
    document.getElementById('ncPreviewLista').innerHTML = `
      <div class="cobro-info-item"><div class="lbl"> Ticket</div><div class="val mono">${g.jugada.ticketId}</div></div>
      <div class="cobro-info-grid">
        <div class="cobro-info-item"><div class="lbl"> Banca</div><div class="val">${g.jugada.banca || '—'}</div></div>
        <div class="cobro-info-item"><div class="lbl"> Ticket del jugador</div><div class="val mono">${g.jugada.ticketFisico || '—'}</div></div>
        <div class="cobro-info-item"><div class="lbl"> Lotería</div><div class="val">${g.jugada.loteria} · ${g.jugada.tipoJugada}</div></div>
        <div class="cobro-info-item"><div class="lbl"> Sorteo</div><div class="val">${g.jugada.fecha}</div></div>
      </div>
      <div class="cobro-info-item" style="margin-bottom:10px;"><div class="lbl">Números acertados</div><div style="margin-top:6px;">${g.aciertos.map(chipPremioHTML).join('')}</div></div>`;
  } else {
    // Varias jugadas: una fila resumida por cada una, más el total.
    document.getElementById('ncPreviewTitulo').textContent = `Resumen del cobro · ${seleccionadas.length} jugadas`;
    document.getElementById('ncPreviewLista').innerHTML = seleccionadas.map(g=>`
      <div class="cobro-info-item" style="margin-bottom:8px;">
        <div class="lbl">Ticket <span class="mono">${g.jugada.ticketId}</span> · ${g.jugada.loteria} · ${g.jugada.fecha}</div>
        <div style="margin-top:4px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div>${g.aciertos.map(chipPremioHTML).join('')}</div>
          <div class="val">${fmtMoney(g.monto)}</div>
        </div>
      </div>`).join('');
  }

  const total = seleccionadas.reduce((s,g)=>s+g.monto, 0);
  document.getElementById('ncPreviewMonto').textContent = fmtMoney(total);
  document.getElementById('ncPreviewMontoLabel').textContent = seleccionadas.length>1 ? 'Importe total a cobrar' : 'Importe a cobrar';
  preview.style.display = 'block';
  preview.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

document.getElementById('btnNuevoCobro').addEventListener('click', async ()=>{
  openModal('modalNuevoCobro');
  await poblarListaCobros();
  if(JUGADAS_GANADORAS.length===0){ toast('No hay jugadas confirmadas con números acertados por ahora.', 'danger'); }
});
document.getElementById('btnEnviarCobro').addEventListener('click', async ()=>{
  const seleccionadas = JUGADAS_GANADORAS.filter(x=>cobroSeleccionIds.has(x.jugada.id));
  if(seleccionadas.length===0){ toast('Selecciona al menos una jugada ganadora de la lista.', 'danger'); return; }

  const btn = document.getElementById('btnEnviarCobro');
  btn.disabled = true;
  try{
    const batch = db.batch();
    seleccionadas.forEach(g=>{
      const jugada = g.jugada;
      const ref = db.collection(COL_COBROS).doc();
      batch.set(ref, {
        jugadaId: jugada.id, ticketId: jugada.ticketId, ticketFisico: jugada.ticketFisico || null,
        banca: jugada.banca || null, vendedor: jugada.vendedor,
        numerosAcertados: g.aciertos.map(a=>a.numero),
        detalleAciertos: g.aciertos,
        monto: g.monto, estado:'pendiente',
        enviadoPor: CURRENT_USER.usuario,
        fechaEnvio: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    toast(seleccionadas.length>1 ? `${seleccionadas.length} solicitudes de cobro enviadas` : 'Solicitud de cobro enviada', 'success');
    closeModal('modalNuevoCobro');
  }catch(err){
    console.error(err);
    toast('Error al enviar: ' + err.message, 'danger');
    btn.disabled = false;
  }
});

/* Genera la tarjeta visual de un cobro, reutilizada tanto en la vista
   del admin (con nombre del vendedor) como en la del vendedor (con
   botones de acción). opts: { mostrarVendedor, accionesHTML } */
function generarCobroCardHTML(c, opts){
  opts = opts || {};
  const numerosHTML = (c.detalleAciertos && c.detalleAciertos.length)
    ? c.detalleAciertos.map(chipPremioHTML).join('')
    : (c.numerosAcertados||[]).map(n=>`<span class="numchip hit">${n}</span>`).join('');
  const vend = opts.mostrarVendedor ? VENDEDORES.find(v=>v.usuario===c.vendedor) : null;
  
  // Buscar la jugada original para obtener loteria y tipoJugada
  const jugadaOriginal = JUGADAS.find(j => j.id === c.jugadaId);
  
  return `
    <div class="cobro-card">
      <div class="cobro-head">
        <div class="cobro-head-left">
          <div class="cobro-ic"></div>
          <div>
            <div class="cobro-title">Ticket <span class="mono">${c.ticketId}</span></div>
            <div class="cobro-sub">Enviado: ${fmtFechaHora(c.fechaEnvio)}${vend ? ' · ' + (vend.nombre||c.vendedor) : ''}</div>
          </div>
        </div>
        ${tagEstado(c.estado)}
      </div>
      <div class="cobro-body">
        <div class="cobro-info-grid">
          <div class="cobro-info-item"><div class="lbl"> Banca</div><div class="val">${c.banca||'—'}</div></div>
          <div class="cobro-info-item"><div class="lbl"> Ticket del jugador</div><div class="val mono">${c.ticketFisico||'—'}</div></div>
          ${opts.mostrarVendedor ? `<div class="cobro-info-item"><div class="lbl"> Jugador</div><div class="val">${vend ? vend.nombre : c.vendedor}</div></div>` : ''}
          ${jugadaOriginal ? `
            <div class="cobro-info-item"><div class="lbl"> Lotería</div><div class="val">${jugadaOriginal.loteria || '—'}</div></div>
            <div class="cobro-info-item"><div class="lbl"> Tipo de jugada</div><div class="val">${jugadaOriginal.tipoJugada || '—'}</div></div>
          ` : `
            <div class="cobro-info-item"><div class="lbl"> Lotería</div><div class="val">—</div></div>
            <div class="cobro-info-item"><div class="lbl"> Tipo de jugada</div><div class="val">—</div></div>
          `}
        </div>
        <div class="cobro-info-item" style="margin-bottom:12px;"><div class="lbl">Números acertados</div><div style="margin-top:6px;">${numerosHTML || '<span class="small-muted">—</span>'}</div></div>
        <div class="cobro-monto-wrap">
          <span class="lbl">Importe a cobrar</span>
          <span class="val">${fmtMoney(c.monto)}</span>
        </div>
        ${c.estado==='rechazada' && c.motivoRechazo ? `<div class="small-muted" style="margin-top:10px;">Motivo del rechazo: ${c.motivoRechazo}</div>` : ''}
        ${opts.accionesHTML ? `<div class="action-row" style="margin-top:14px;">${opts.accionesHTML}</div>` : ''}
      </div>
    </div>`;
}

// FILTRO POR ESTADO - ADMIN COBROS (dropdown)
document.getElementById('filtroCobrosAdminSelect').addEventListener('change', function() {
  renderCobrosAdmin();
});

// FILTRO POR FECHA - ADMIN COBROS
let filtroFechaCobrosAdmin = '';
document.getElementById('filtroFechaCobrosAdmin').addEventListener('change', function(e) {
  filtroFechaCobrosAdmin = e.target.value;
  renderCobrosAdmin();
});
document.getElementById('btnLimpiarFechaCobrosAdmin').addEventListener('click', function() {
  filtroFechaCobrosAdmin = '';
  document.getElementById('filtroFechaCobrosAdmin').value = '';
  renderCobrosAdmin();
});

function renderCobrosAdmin(){
  const wrap = document.getElementById('listaCobrosAdmin');
  const estadoFiltro = document.getElementById('filtroCobrosAdminSelect').value;
  
  let datos = COBROS;
  if(estadoFiltro && estadoFiltro !== '') {
    datos = datos.filter(c => c.estado === estadoFiltro);
  }
  if(filtroFechaCobrosAdmin) datos = datos.filter(c => fechaStrDeTimestamp(c.fechaEnvio) === filtroFechaCobrosAdmin);
  
  if(datos.length === 0){
    wrap.innerHTML = `<div class="empty-state"><div class="ic"></div>No hay solicitudes de cobro para este filtro.</div>`;
    return;
  }
  wrap.innerHTML = datos.map(c => generarCobroCardHTML(c, { mostrarVendedor:true })).join('');
}


document.getElementById('filtroCobrosVendedorSelect').addEventListener('change', function() {
  renderCobrosVendedor();
});

// FILTRO POR FECHA - VENDEDOR COBROS
let filtroFechaCobrosVendedor = '';
document.getElementById('filtroFechaCobrosVendedor').addEventListener('change', function(e) {
  filtroFechaCobrosVendedor = e.target.value;
  renderCobrosVendedor();
});
document.getElementById('btnLimpiarFechaCobrosVendedor').addEventListener('click', function() {
  filtroFechaCobrosVendedor = '';
  document.getElementById('filtroFechaCobrosVendedor').value = '';
  renderCobrosVendedor();
});

function renderCobrosVendedor(){
  const wrap = document.getElementById('listaCobrosVendedor');
  const estadoFiltro = document.getElementById('filtroCobrosVendedorSelect').value;
  
  let datos = COBROS;
  if(estadoFiltro && estadoFiltro !== '') {
    datos = datos.filter(c => c.estado === estadoFiltro);
  }
  if(filtroFechaCobrosVendedor) datos = datos.filter(c => fechaStrDeTimestamp(c.fechaEnvio) === filtroFechaCobrosVendedor);
  
  if(datos.length === 0){
    wrap.innerHTML = `<div class="empty-state"><div class="ic"></div>No tienes solicitudes de cobro en este filtro.</div>`;
    return;
  }
  
  wrap.innerHTML = datos.map(c => {
    let acciones = '';
    if(c.estado === 'pendiente'){
      acciones = `<button class="btn btn-success btn-sm" onclick="aceptarCobro('${c.id}')">Aceptar</button>
        <button class="btn btn-danger btn-sm" onclick="abrirRechazo('cobro','${c.id}')">Rechazar</button>`;
    } else if(c.estado === 'aceptada'){
      acciones = `<button class="btn btn-primary btn-sm" onclick="confirmarCobro('${c.id}')">Confirmar cobro recibido</button>`;
    }
    return generarCobroCardHTML(c, { mostrarVendedor:false, accionesHTML: acciones });
  }).join('');
}

async function aceptarCobro(id){
  await db.collection(COL_COBROS).doc(id).update({ estado:'aceptada', fechaAceptacion: firebase.firestore.FieldValue.serverTimestamp() });
  toast('Cobro aceptado', 'success');
}
async function confirmarCobro(id){
  if(!requiereCajaAbierta()) return;
  try{
    await db.runTransaction(async (tx)=>{
      const refCobro = db.collection(COL_COBROS).doc(id);
      const refUser = db.collection(COL_USUARIOS).doc(CURRENT_USER.usuario);
      const cobroDoc = await tx.get(refCobro);
      const userDoc = await tx.get(refUser);
      if(cobroDoc.data().estado !== 'aceptada') throw new Error('Este cobro ya no está pendiente de confirmación.');
      const saldoActual = userDoc.data().saldo || 0;
      const monto = cobroDoc.data().monto || 0;
      tx.update(refUser, { saldo: saldoActual + monto });
      tx.update(refCobro, { estado:'confirmada', fechaConfirmacion: firebase.firestore.FieldValue.serverTimestamp() });
    });
    toast('Cobro confirmado, saldo actualizado', 'success');
  }catch(err){ console.error(err); toast('Error: ' + err.message, 'danger'); }
}

/* ---- Depositar ---- */
