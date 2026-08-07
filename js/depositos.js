/* ========================================================================
   DEPOSITOS.JS
   Depósitos que el jugador reporta a la banca (efectivo/transferencia): revisión por el admin y el formulario del jugador.
   ======================================================================== */

/* ======================================================================
   ADMIN: DEPÓSITOS
   ====================================================================== */
/* --- Filtro: por vendedor y por fecha del reporte --- */
let filtroVendedorDepositosAdmin = 'todos';
let filtroFechaDepositosAdmin = '';
function renderFiltroVendedorDepositosAdmin(){
  const cont = document.getElementById('filtroVendedorDepositosAdmin');
  if(!cont) return;
  const activos = VENDEDORES.filter(v=>v.activo!==false);
  cont.innerHTML = `<div class="filter-tab${filtroVendedorDepositosAdmin==='todos'?' active':''}" data-v="todos">Todos los jugadores</div>` +
    activos.map(v=>`<div class="filter-tab${filtroVendedorDepositosAdmin===v.usuario?' active':''}" data-v="${v.usuario}">${v.nombre}</div>`).join('');
}
document.getElementById('filtroVendedorDepositosAdmin').addEventListener('click', (e)=>{
  const tab = e.target.closest('.filter-tab');
  if(!tab) return;
  filtroVendedorDepositosAdmin = tab.dataset.v;
  renderFiltroVendedorDepositosAdmin();
  renderDepositosAdmin();
});
document.getElementById('filtroFechaDepositosAdmin').addEventListener('change', (e)=>{
  filtroFechaDepositosAdmin = e.target.value;
  renderDepositosAdmin();
});
document.getElementById('btnLimpiarFechaDepositosAdmin').addEventListener('click', ()=>{
  filtroFechaDepositosAdmin = '';
  document.getElementById('filtroFechaDepositosAdmin').value = '';
  renderDepositosAdmin();
});

/* ======================================================================
   TOTAL DEPOSITADO (confirmados), filtrado por rango de fecha
   ------------------------------------------------------------------
   Independiente del filtro de la lista de arriba: usa la fecha en que
   el admin CONFIRMÓ cada depósito (fechaConfirmacion), no la fecha en
   que el jugador lo reportó, porque lo que importa acá es "cuánto dinero
   entró realmente a la banca en este rango de días". Solo cuenta
   depósitos con estado 'confirmado' — los 'pendiente' y 'solicitado' no
   son dinero confirmado todavía.
   ====================================================================== */
function renderDepTotalDepositado(){
  const desdeEl = document.getElementById('depTotalDesde');
  const hastaEl = document.getElementById('depTotalHasta');
  if(!desdeEl) return;
  const desde = desdeEl.value;
  const hasta = hastaEl.value;

  const confirmados = DEPOSITOS.filter(d=>{
    if(d.estado !== 'confirmado') return false;
    if(!desde && !hasta) return true;
    const fecha = fechaStrDeTimestamp(d.fechaConfirmacion || d.fechaEnvio);
    if(desde && fecha < desde) return false;
    if(hasta && fecha > hasta) return false;
    return true;
  });

  const total = confirmados.reduce((sum,d)=> sum + (d.monto||0), 0);
  document.getElementById('depTotalConfirmadoVal').textContent = fmtMoney(total);
  document.getElementById('depTotalConfirmadoCant').textContent = `${confirmados.length} depósito${confirmados.length===1?'':'s'}`;
}
document.getElementById('depTotalDesde').addEventListener('change', renderDepTotalDepositado);
document.getElementById('depTotalHasta').addEventListener('change', renderDepTotalDepositado);
document.getElementById('btnDepTotalHoy').addEventListener('click', ()=>{
  const hoy = hoyStrLocal();
  document.getElementById('depTotalDesde').value = hoy;
  document.getElementById('depTotalHasta').value = hoy;
  renderDepTotalDepositado();
});
document.getElementById('btnDepTotalLimpiar').addEventListener('click', ()=>{
  document.getElementById('depTotalDesde').value = '';
  document.getElementById('depTotalHasta').value = '';
  renderDepTotalDepositado();
});

/* ======================================================================
   SOLICITAR DEPÓSITO A UN JUGADOR
   ------------------------------------------------------------------
   Crea un documento en la MISMA colección de depósitos (sistema_depositos)
   con estado 'solicitado' — no mueve saldo ni cuenta como depósito real,
   solo le muestra al jugador un aviso en su pantalla de "Depositar" para
   que reporte el monto. Cuando el jugador reporta el depósito real desde
   ese aviso, la solicitud se borra sola (ver btnEnviarDeposito).
   ====================================================================== */
function renderSelectJugadorSolicitudDeposito(){
  const sel = document.getElementById('solDepJugador');
  const activos = VENDEDORES.filter(v=>v.activo!==false);
  sel.innerHTML = activos.map(v=>`<option value="${v.usuario}">${v.nombre}</option>`).join('');
}
document.getElementById('btnSolicitarDeposito').addEventListener('click', ()=>{
  renderSelectJugadorSolicitudDeposito();
  document.getElementById('solDepMonto').value = '';
  document.getElementById('solDepNota').value = '';
  openModal('modalSolicitarDeposito');
});
document.getElementById('btnEnviarSolicitudDeposito').addEventListener('click', async ()=>{
  const vendedor = document.getElementById('solDepJugador').value;
  const montoTxt = document.getElementById('solDepMonto').value;
  const monto = montoTxt ? Number(montoTxt) : null;
  const nota = document.getElementById('solDepNota').value.trim();
  if(!vendedor){ toast('Elige un jugador.', 'danger'); return; }
  try{
    await db.collection(COL_DEPOSITOS).add({
      vendedor, monto: monto || 0, montoSugerido: monto,
      nota: nota || null, metodo: null,
      estado: 'solicitado', solicitadoPor: CURRENT_USER.usuario,
      fechaEnvio: firebase.firestore.FieldValue.serverTimestamp(),
    });
    toast('Solicitud de depósito enviada.', 'success');
    closeModal('modalSolicitarDeposito');
  }catch(err){ console.error(err); toast('Error: ' + err.message, 'danger'); }
});
async function cancelarSolicitudDeposito(id){
  if(!confirm('¿Cancelar esta solicitud de depósito? El jugador ya no la verá.')) return;
  try{
    await db.collection(COL_DEPOSITOS).doc(id).delete();
    toast('Solicitud cancelada.', 'success');
  }catch(err){ console.error(err); toast('Error: ' + err.message, 'danger'); }
}

function generarDepositoAdminCardHTML(d){
  const vend = VENDEDORES.find(v=>v.usuario===d.vendedor);
  const esSolicitud = d.estado === 'solicitado';
  return `
    <div class="cobro-card">
      <div class="cobro-head">
        <div class="cobro-head-left">
          <div class="cobro-ic"></div>
          <div>
            <div class="cobro-title">${vend ? vend.nombre : d.vendedor}</div>
            <div class="cobro-sub">${esSolicitud ? 'Solicitado' : 'Reportado'}: ${fmtFechaHora(d.fechaEnvio)}</div>
          </div>
        </div>
        ${tagEstado(d.estado)}
      </div>
      <div class="cobro-body">
        ${!esSolicitud ? `<div class="cobro-info-grid">
          <div class="cobro-info-item"><div class="lbl">Método</div><div class="val">${tagMetodo(d.metodo)}</div></div>
          ${d.metodo==='transferencia' && d.cuentaBanco ? `<div class="cobro-info-item"><div class="lbl">Cuenta</div><div class="val">${d.cuentaBanco} · ${d.cuentaNumero||''}</div></div>` : ''}
        </div>` : ''}
        ${d.nota ? `<div class="small-muted" style="margin-bottom:10px;">${d.nota}</div>` : ''}
        <div class="cobro-monto-wrap">
          <span class="lbl">${esSolicitud ? 'Monto sugerido' : 'Monto'}</span>
          <span class="val">${esSolicitud && !d.montoSugerido ? '—' : fmtMoney(d.monto)}</span>
        </div>
        ${d.estado==='pendiente' ? `<div class="action-row" style="margin-top:12px;"><button class="btn btn-success btn-sm" style="width:100%;" onclick="confirmarDeposito('${d.id}')">Confirmar recibido</button></div>` : ''}
        ${esSolicitud ? `<div class="action-row" style="margin-top:12px;"><button class="btn btn-outline btn-sm" style="width:100%;" onclick="cancelarSolicitudDeposito('${d.id}')">Cancelar solicitud</button></div>` : ''}
      </div>
    </div>`;
}
function renderDepositosAdmin(){
  const tbody = document.getElementById('tablaDepositosAdmin');
  const cardsWrap = document.getElementById('cardsDepositosAdmin');
  let datos = DEPOSITOS;
  if(filtroVendedorDepositosAdmin !== 'todos') datos = datos.filter(d=>d.vendedor===filtroVendedorDepositosAdmin);
  if(filtroFechaDepositosAdmin) datos = datos.filter(d=>fechaStrDeTimestamp(d.fechaEnvio)===filtroFechaDepositosAdmin);
  renderDepTotalDepositado();
  if(datos.length===0){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No hay depósitos para este filtro.</td></tr>`;
    if(cardsWrap) cardsWrap.innerHTML = `<div class="empty-state"><div class="ic"></div>No hay depósitos para este filtro.</div>`;
    return;
  }
  tbody.innerHTML = datos.map(d=>{
    const vend = VENDEDORES.find(v=>v.usuario===d.vendedor);
    const esSolicitud = d.estado === 'solicitado';
    let accion = '';
    if(d.estado==='pendiente') accion = `<button class="btn btn-success btn-sm" onclick="confirmarDeposito('${d.id}')">Confirmar recibido</button>`;
    else if(esSolicitud) accion = `<button class="btn btn-outline btn-sm" onclick="cancelarSolicitudDeposito('${d.id}')">Cancelar</button>`;
    return `<tr>
      <td>${vend ? vend.nombre : d.vendedor}${d.nota ? `<div class="small-muted">${d.nota}</div>`:''}</td>
      <td><b>${esSolicitud && !d.montoSugerido ? '—' : fmtMoney(d.monto)}</b></td>
      <td>${esSolicitud ? '<span class="small-muted">—</span>' : (tagMetodo(d.metodo) + (d.metodo==='transferencia' && d.cuentaBanco ? `<div class="small-muted">${d.cuentaBanco} · ${d.cuentaNumero||''}</div>`:''))}</td>
      <td>${tagEstado(d.estado)}</td>
      <td class="small-muted">${fmtFechaHora(d.fechaEnvio)}</td>
      <td>${accion}</td>
    </tr>`;
  }).join('');
  if(cardsWrap) cardsWrap.innerHTML = datos.map(generarDepositoAdminCardHTML).join('');
}
async function confirmarDeposito(id){
  const dep = DEPOSITOS.find(d=>d.id===id);
  if(!dep) return;
  try{
    await db.runTransaction(async (tx)=>{
      const refUser = db.collection(COL_USUARIOS).doc(dep.vendedor);
      const refDep = db.collection(COL_DEPOSITOS).doc(id);
      const userDoc = await tx.get(refUser);
      const depDoc = await tx.get(refDep);
      if(depDoc.data().estado !== 'pendiente') throw new Error('Este depósito ya fue procesado.');
      const saldoActual = userDoc.data().saldo || 0;
      tx.update(refUser, { saldo: saldoActual - dep.monto });
      tx.update(refDep, { estado:'confirmado', fechaConfirmacion: firebase.firestore.FieldValue.serverTimestamp() });
    });
    toast('Depósito confirmado y saldo actualizado', 'success');
  }catch(err){ console.error(err); toast('Error: ' + err.message, 'danger'); }
}


/* ======================================================================
   VENDEDOR: banner de solicitud de depósito pendiente
   ====================================================================== */
let depositoSolicitudActual = null; // id de la solicitud que se está por resolver, si el jugador la usa
function renderSolicitudDepositoVendedor(){
  const banner = document.getElementById('depositoSolicitudBanner');
  if(!banner) return;
  const solicitud = DEPOSITOS.find(d=>d.estado==='solicitado' && d.vendedor===CURRENT_USER.usuario);
  if(!solicitud){
    banner.style.display = 'none';
    depositoSolicitudActual = null;
    return;
  }
  depositoSolicitudActual = solicitud.id;
  const partes = [];
  if(solicitud.montoSugerido) partes.push(`Monto sugerido: ${fmtMoney(solicitud.montoSugerido)}`);
  if(solicitud.nota) partes.push(solicitud.nota);
  document.getElementById('depositoSolicitudTexto').textContent = partes.join(' · ') || 'Repórtalo cuando puedas.';
  banner.style.display = 'block';
}
document.getElementById('btnUsarSolicitudDeposito').addEventListener('click', ()=>{
  const solicitud = DEPOSITOS.find(d=>d.id===depositoSolicitudActual);
  if(solicitud?.montoSugerido) document.getElementById('depositoMonto').value = solicitud.montoSugerido;
  if(solicitud?.nota) document.getElementById('depositoNota').value = solicitud.nota;
  document.getElementById('depositoMonto').focus();
  document.getElementById('depositoMonto').scrollIntoView({ behavior:'smooth', block:'center' });
});

function renderDepositosVendedor(){
  renderSolicitudDepositoVendedor();
  const tbody = document.getElementById('tablaDepositosVendedor');
  const datos = DEPOSITOS.filter(d=>d.estado!=='solicitado'); // las solicitudes no son depósitos reales, no van en el historial
  if(datos.length===0){ tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Aún no has reportado depósitos.</td></tr>`; return; }
  tbody.innerHTML = datos.map(d=>`
    <tr>
      <td><b>${fmtMoney(d.monto)}</b>${d.nota?`<div class="small-muted">${d.nota}</div>`:''}</td>
      <td>${tagMetodo(d.metodo)}${d.metodo==='transferencia' && d.cuentaBanco ? `<div class="small-muted">${d.cuentaBanco} · ${d.cuentaNumero||''}</div>`:''}</td>
      <td>${tagEstado(d.estado)}</td>
      <td class="small-muted">${fmtFechaHora(d.fechaEnvio)}</td>
    </tr>
  `).join('');
}

/* --- Método de depósito: efectivo / transferencia --- */
let depositoMetodoActual = 'efectivo';
let depositoCuentaSeleccionada = null;
document.querySelectorAll('#depositoMetodoTabs .filter-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('#depositoMetodoTabs .filter-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    depositoMetodoActual = tab.dataset.metodo;
    const wrap = document.getElementById('depositoCuentaWrap');
    if(depositoMetodoActual === 'transferencia'){
      wrap.style.display = 'block';
      renderCuentasDepositoVendedor();
    } else {
      wrap.style.display = 'none';
      depositoCuentaSeleccionada = null;
    }
  });
});
function renderCuentasDepositoVendedor(){
  const cont = document.getElementById('depositoCuentaLista');
  const vacio = document.getElementById('depositoCuentaVacio');
  if(!cont) return;
  if(CUENTAS_BANCARIAS.length === 0){
    cont.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';
  // Si la cuenta previamente seleccionada ya no existe/activa, se limpia.
  if(depositoCuentaSeleccionada && !CUENTAS_BANCARIAS.find(c=>c.id===depositoCuentaSeleccionada)){
    depositoCuentaSeleccionada = null;
  }
  cont.innerHTML = CUENTAS_BANCARIAS.map(c=>`
    <div class="cuenta-opcion${depositoCuentaSeleccionada===c.id?' selected':''}" onclick="seleccionarCuentaDeposito('${c.id}')">
      <div class="cuenta-info">
        <div class="cuenta-banco">${c.banco}${c.tipo?` · ${c.tipo}`:''}</div>
        <div class="cuenta-num">N.° ${c.numero}${c.titular?` · ${c.titular}`:''}</div>
      </div>
      <div class="check"></div>
    </div>
  `).join('');
}
function seleccionarCuentaDeposito(id){
  depositoCuentaSeleccionada = id;
  renderCuentasDepositoVendedor();
}

document.getElementById('btnEnviarDeposito').addEventListener('click', async ()=>{
  const monto = Number(document.getElementById('depositoMonto').value);
  const nota = document.getElementById('depositoNota').value.trim();
  if(!monto || monto<=0){ toast('Ingresa un monto válido.', 'danger'); return; }

  const datosDeposito = {
    vendedor: CURRENT_USER.usuario, monto, nota: nota || null,
    metodo: depositoMetodoActual, estado:'pendiente',
    fechaEnvio: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if(depositoMetodoActual === 'transferencia'){
    const cuenta = CUENTAS_BANCARIAS.find(c=>c.id===depositoCuentaSeleccionada);
    if(!cuenta){ toast('Elige la cuenta a la que hiciste la transferencia.', 'danger'); return; }
    datosDeposito.cuentaId = cuenta.id;
    datosDeposito.cuentaBanco = cuenta.banco;
    datosDeposito.cuentaNumero = cuenta.numero;
    datosDeposito.cuentaTitular = cuenta.titular || null;
  }

  await db.collection(COL_DEPOSITOS).add(datosDeposito);

  // Si este reporte resuelve una solicitud del admin, la borramos: ya
  // cumplió su propósito (avisarle al jugador) y no debe seguir
  // apareciendo como pendiente.
  if(depositoSolicitudActual){
    try{ await db.collection(COL_DEPOSITOS).doc(depositoSolicitudActual).delete(); }
    catch(err){ console.error('No se pudo limpiar la solicitud de depósito:', err); }
    depositoSolicitudActual = null;
  }

  toast('Depósito reportado. Queda pendiente de confirmación del admin.', 'success');
  document.getElementById('depositoMonto').value='';
  document.getElementById('depositoNota').value='';
  depositoCuentaSeleccionada = null;
  renderCuentasDepositoVendedor();
});

