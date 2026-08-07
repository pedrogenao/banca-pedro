/* ========================================================================
   CAJA.JS
   Jugador: apertura/cierre de caja del día, arqueo y su historial.
   ======================================================================== */

function renderCajaVendedor(){
  const existe = !!CAJA_HOY;
  const abierta = existe && CAJA_HOY.estado !== 'cerrada';
  const cerrada = existe && CAJA_HOY.estado === 'cerrada';

  document.getElementById('cajaIcono').textContent = abierta ? '' : (cerrada ? '' : '');
  document.getElementById('cajaEstadoTxt').textContent = abierta ? 'Caja abierta hoy' : (cerrada ? 'Caja ya cerrada hoy' : 'Caja cerrada');

  let detalle = 'Fecha: ' + hoyStr();
  if(abierta && CAJA_HOY.horaApertura) detalle += ' · Abierta a las ' + fmtFechaHora(CAJA_HOY.horaApertura) + ` (${fmtMoney(CAJA_HOY.montoApertura||0)})`;
  if(cerrada){
    if(CAJA_HOY.horaApertura) detalle += ' · Apertura ' + fmtFechaHora(CAJA_HOY.horaApertura) + ` (${fmtMoney(CAJA_HOY.montoApertura||0)})`;
    if(CAJA_HOY.horaCierre) detalle += ' · Cierre ' + fmtFechaHora(CAJA_HOY.horaCierre) + ` (${fmtMoney(CAJA_HOY.montoCierre||0)})`;
  }
  document.getElementById('cajaFechaTxt').textContent = detalle;

  const hint = document.getElementById('cajaHint');
  if(abierta) hint.textContent = 'Ya puedes recibir jugadas y enviar cobros. No olvides cerrar la caja al terminar tu jornada.';
  else if(cerrada) hint.textContent = 'Ya cerraste tu caja de hoy. Mañana deberás abrirla de nuevo antes de trabajar.';
  else hint.textContent = 'Debes abrir la caja cada día antes de poder aceptar o confirmar jugadas y cobros.';

  document.getElementById('btnAbrirCaja').style.display = existe ? 'none' : 'inline-flex';
  document.getElementById('btnCerrarCaja').style.display = abierta ? 'inline-flex' : 'none';

  const pill = document.getElementById('cajaPillTop');
  pill.textContent = abierta ? 'Caja abierta' : (cerrada ? 'Caja cerrada' : 'Caja sin abrir');
  pill.className = 'caja-pill ' + (abierta ? 'abierta' : 'cerrada');
}
document.getElementById('btnAbrirCaja').addEventListener('click', ()=>{
  document.getElementById('cajaMontoApertura').value = '';
  openModal('modalAbrirCaja');
});
document.getElementById('btnConfirmarAbrirCaja').addEventListener('click', async ()=>{
  const monto = Number(document.getElementById('cajaMontoApertura').value);
  if(!(monto >= 0)){ toast('Ingresa el monto de apertura.', 'danger'); return; }
  const usuario = CURRENT_USER.usuario;
  await db.collection(COL_CAJA).doc(`${usuario}_${hoyStr()}`).set({
    vendedor: usuario, fecha: hoyStr(),
    horaApertura: firebase.firestore.FieldValue.serverTimestamp(),
    montoApertura: monto,
    horaCierre: null, montoCierre: null,
    estado: 'abierta',
  });
  toast('Caja abierta. Ya puedes jugar y cobrar hoy.', 'success');
  closeModal('modalAbrirCaja');
  cargarHistorialCaja();
});
/* ---- Arqueo automático de caja ----
   Calcula, con los movimientos ya CONFIRMADOS del vendedor durante el día
   de hoy, cuánto efectivo debería haber físicamente en la caja:
     esperado = apertura + cobros de premios confirmados − jugadas confirmadas − depósitos en efectivo entregados
   Esto permite comparar contra el efectivo real contado al cerrar y, si
   falta dinero, generar automáticamente un descuento de nómina con el
   detalle completo de movimientos para total transparencia. */
/* ---- Arqueo automático de caja ----
   Calcula, con los movimientos ya CONFIRMADOS del vendedor durante el día
   de hoy, cuánto debería haber en caja:
     esperado = apertura + cobros de premios confirmados + recargas de saldo recibidas
                − jugadas confirmadas − depósitos CONFIRMADOS (efectivo Y transferencia)
   Se consideran TODOS los movimientos de entrada y salida del día (lo que
   entra: cobros + recargas; lo que sale: jugadas + depósitos, sin
   importar el método del depósito) para que el cuadre sea real y
   consistente. Esto permite comparar contra el efectivo real contado al
   cerrar y, si falta dinero, generar automáticamente un descuento de
   nómina con el detalle completo de movimientos para total transparencia. */
function calcularArqueoCaja(){
  const usuario = CURRENT_USER.usuario;
  const fecha = hoyStr();
  const montoApertura = (CAJA_HOY && CAJA_HOY.montoApertura) || 0;

  const cobrosHoy = COBROS.filter(c=> c.vendedor===usuario && c.estado==='confirmada' && fechaStrDeTimestamp(c.fechaConfirmacion)===fecha);
  const jugadasHoy = JUGADAS.filter(j=> j.vendedor===usuario && j.estado==='confirmada' && fechaStrDeTimestamp(j.fechaConfirmacion)===fecha);
  // Depósitos CONFIRMADOS de hoy, sin importar el método (efectivo o
  // transferencia) — antes solo se contaban los de efectivo, y ni
  // siquiera se exigía que estuvieran confirmados, lo que descuadraba el
  // cierre. Se filtra por la fecha en que se CONFIRMÓ (no la de reporte),
  // igual que cobros y jugadas.
  const depositosHoy = DEPOSITOS.filter(d=> d.vendedor===usuario && d.estado==='confirmado' && fechaStrDeTimestamp(d.fechaConfirmacion)===fecha);
  // Recargas de saldo que el admin le dio hoy (sistema_ajustes, tipo
  // 'recarga'). El saldo inicial ('inicial') no entra aquí porque no es
  // un movimiento del día, es la apertura de la cuenta.
  const recargasHoy = AJUSTES.filter(a=> a.vendedor===usuario && a.tipo==='recarga' && fechaStrDeTimestamp(a.fecha)===fecha);

  const totalCobros = cobrosHoy.reduce((s,c)=> s + (c.monto||0), 0);
  const totalJugadas = jugadasHoy.reduce((s,j)=> s + (j.montoTotal||0), 0);
  const totalDepositos = depositosHoy.reduce((s,d)=> s + (d.monto||0), 0);
  const totalRecargas = recargasHoy.reduce((s,a)=> s + (a.monto||0), 0);

  const esperado = montoApertura + totalCobros + totalRecargas - totalJugadas - totalDepositos;

  return { montoApertura, cobrosHoy, jugadasHoy, depositosHoy, recargasHoy, totalCobros, totalJugadas, totalDepositos, totalRecargas, esperado };
}

function renderArqueoModal(arq){
  document.getElementById('arqApertura').textContent = fmtMoney(arq.montoApertura);
  document.getElementById('arqCobrosCant').textContent = arq.cobrosHoy.length;
  document.getElementById('arqCobros').textContent = '+' + fmtMoney(arq.totalCobros);
  document.getElementById('arqRecargasCant').textContent = arq.recargasHoy.length;
  document.getElementById('arqRecargas').textContent = '+' + fmtMoney(arq.totalRecargas);
  document.getElementById('arqJugadasCant').textContent = arq.jugadasHoy.length;
  document.getElementById('arqJugadas').textContent = '−' + fmtMoney(arq.totalJugadas);
  document.getElementById('arqDepositosCant').textContent = arq.depositosHoy.length;
  document.getElementById('arqDepositos').textContent = '−' + fmtMoney(arq.totalDepositos);
  document.getElementById('arqEsperado').textContent = fmtMoney(arq.esperado);

  const filas = [];
  arq.cobrosHoy.forEach(c=> filas.push({ hora:c.fechaConfirmacion, signo:'+', monto:c.monto||0,
    texto:`Cobro de premio · ticket ${c.ticketId||'—'}` }));
  arq.recargasHoy.forEach(a=> filas.push({ hora:a.fecha, signo:'+', monto:a.monto||0,
    texto:`Recarga de saldo${a.motivo?' · '+a.motivo:''}` }));
  arq.jugadasHoy.forEach(j=> filas.push({ hora:j.fechaConfirmacion, signo:'−', monto:j.montoTotal||0,
    texto:`Jugada realizada · ${j.loteria||''} ${j.tipoJugada||''} · ticket ${j.ticketId||'—'}` }));
  arq.depositosHoy.forEach(d=> filas.push({ hora:d.fechaConfirmacion, signo:'−', monto:d.monto||0,
    texto:`Depósito confirmado (${d.metodo==='transferencia'?'transferencia':'efectivo'})${d.nota?' · '+d.nota:''}` }));
  filas.sort((a,b)=> (a.hora?.seconds||0) - (b.hora?.seconds||0));

  const lista = document.getElementById('arqListaMovimientos');
  if(filas.length===0){
    lista.innerHTML = '<div class="small-muted">No hubo movimientos confirmados hoy.</div>';
  } else {
    lista.innerHTML = filas.map(f=>`
      <div style="display:flex; justify-content:space-between; gap:10px; padding:5px 0; border-bottom:1px solid var(--border);">
        <span>${f.texto}<br><span class="small-muted" style="font-size:11px;">${f.hora ? fmtFechaHora(f.hora) : ''}</span></span>
        <span class="mono" style="white-space:nowrap; color:${f.signo==='+'?'var(--success)':'var(--danger)'};">${f.signo}${fmtMoney(f.monto)}</span>
      </div>`).join('');
  }
  document.getElementById('arqDetalleMovimientos').style.display = 'block';
}

function actualizarDiferenciaArqueo(){
  const box = document.getElementById('arqDiferenciaBox');
  const inputVal = document.getElementById('cajaMontoCierre').value;
  if(inputVal === '' || !ARQUEO_ACTUAL){ box.style.display = 'none'; return; }
  const contado = Number(inputVal);
  const diferencia = contado - ARQUEO_ACTUAL.esperado;
  box.style.display = 'block';
  if(Math.abs(diferencia) < 0.005){
    box.style.background = 'var(--success-soft)'; box.style.color = 'var(--success)';
    box.textContent = ' Cuadre exacto: el efectivo contado coincide con lo esperado.';
  } else if(diferencia < 0){
    box.style.background = 'var(--danger-soft)'; box.style.color = 'var(--danger)';
    box.textContent = ` Falta ${fmtMoney(Math.abs(diferencia))} en caja. Este monto se descontará automáticamente de tu próximo pago de nómina al cerrar.`;
  } else {
    box.style.background = 'var(--accent-soft)'; box.style.color = 'var(--accent)';
    box.textContent = ` Sobran ${fmtMoney(diferencia)} respecto a lo esperado. Verifica el conteo antes de cerrar.`;
  }
}
document.getElementById('cajaMontoCierre').addEventListener('input', actualizarDiferenciaArqueo);

document.getElementById('btnCerrarCaja').addEventListener('click', ()=>{
  document.getElementById('cajaMontoCierre').value = '';
  document.getElementById('arqDiferenciaBox').style.display = 'none';
  ARQUEO_ACTUAL = calcularArqueoCaja();
  renderArqueoModal(ARQUEO_ACTUAL);
  openModal('modalCerrarCaja');
});
document.getElementById('btnConfirmarCerrarCaja').addEventListener('click', async ()=>{
  const monto = Number(document.getElementById('cajaMontoCierre').value);
  if(!(monto >= 0)){ toast('Ingresa el monto de cierre.', 'danger'); return; }
  const usuario = CURRENT_USER.usuario;
  const arq = ARQUEO_ACTUAL || calcularArqueoCaja();
  const diferencia = Math.round((monto - arq.esperado) * 100) / 100;
  const faltante = diferencia < -0.005;

  const btn = document.getElementById('btnConfirmarCerrarCaja');
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Cerrando...';

  try{
    await db.collection(COL_CAJA).doc(`${usuario}_${hoyStr()}`).set({
      horaCierre: firebase.firestore.FieldValue.serverTimestamp(),
      montoCierre: monto,
      montoEsperado: arq.esperado,
      totalCobrosDia: arq.totalCobros,
      totalRecargasDia: arq.totalRecargas,
      totalJugadasDia: arq.totalJugadas,
      totalDepositosDia: arq.totalDepositos,
      cantCobrosDia: arq.cobrosHoy.length,
      cantRecargasDia: arq.recargasHoy.length,
      cantJugadasDia: arq.jugadasHoy.length,
      cantDepositosDia: arq.depositosHoy.length,
      diferencia: diferencia,
      estado: 'cerrada',
    }, { merge:true });

    if(faltante){
      const montoFaltante = Math.abs(diferencia);
      const motivo = `Faltante en caja del día ${hoyStr()}: apertura ${fmtMoney(arq.montoApertura)} `
        + `+ cobros confirmados ${fmtMoney(arq.totalCobros)} (${arq.cobrosHoy.length}) `
        + `+ recargas de saldo ${fmtMoney(arq.totalRecargas)} (${arq.recargasHoy.length}) `
        + `− jugadas confirmadas ${fmtMoney(arq.totalJugadas)} (${arq.jugadasHoy.length}) `
        + `− depósitos confirmados ${fmtMoney(arq.totalDepositos)} (${arq.depositosHoy.length}) `
        + `= esperado ${fmtMoney(arq.esperado)}. Efectivo contado: ${fmtMoney(monto)}. Faltante: ${fmtMoney(montoFaltante)}.`;
      await db.collection(COL_NOMINA).add({
        vendedor: usuario, tipo:'descuento', estado:'pendiente',
        monto: montoFaltante, motivo,
        origen: 'faltante_caja', fecha: hoyStr(),
        fechaCreado: firebase.firestore.FieldValue.serverTimestamp(),
      });
      toast(`Caja cerrada con un faltante de ${fmtMoney(montoFaltante)}. Se descontará automáticamente de tu próximo pago.`, 'danger');
    } else if(diferencia > 0.005){
      toast(`Caja cerrada con un sobrante de ${fmtMoney(diferencia)}. ¡Buen trabajo!`, 'success');
    } else {
      toast('Caja cerrada con cuadre exacto. ¡Buen trabajo hoy!', 'success');
    }
    closeModal('modalCerrarCaja');
    cargarHistorialCaja();
  }catch(err){
    console.error('Error cerrando caja:', err);
    toast('No se pudo cerrar la caja: ' + err.message, 'danger');
  }finally{
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});
function requiereCajaAbierta(){
  if(!CAJA_HOY || CAJA_HOY.estado === 'cerrada'){
    toast('Debes abrir la caja de hoy antes de continuar.', 'danger');
    cambiarVista('v-caja');
    return false;
  }
  return true;
}

/* ---- Historial de caja (filtro por fecha, por defecto los últimos 18 días) ---- */
const cajaHistDesdeInput = document.getElementById('cajaHistDesde');
const cajaHistHastaInput = document.getElementById('cajaHistHasta');
if(cajaHistDesdeInput && cajaHistHastaInput){
  cajaHistDesdeInput.value = limiteRetencionStr();
  cajaHistHastaInput.value = hoyStr();
  document.getElementById('btnCajaHistFiltrar').addEventListener('click', cargarHistorialCaja);
}
async function cargarHistorialCaja(){
  const tbody = document.getElementById('cajaHistTabla');
  if(!tbody || !CURRENT_USER) return;
  const desde = cajaHistDesdeInput.value || limiteRetencionStr();
  const hasta = cajaHistHastaInput.value || hoyStr();
  tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Cargando historial...</td></tr>';
  try{
    const snap = await db.collection(COL_CAJA)
      .where('vendedor','==', CURRENT_USER.usuario)
      .get();
    const dias = snap.docs.map(d=>d.data())
      .filter(c=> c.fecha && c.fecha>=desde && c.fecha<=hasta)
      .sort((a,b)=> (b.fecha||'').localeCompare(a.fecha||''));
    document.getElementById('cajaHistCantidad').textContent = `${dias.length} día${dias.length===1?'':'s'}`;
    if(dias.length===0){
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No hay registros de caja en este rango de fechas.</td></tr>';
      return;
    }
    tbody.innerHTML = dias.map(c=>{
      const estaCerrada = c.estado === 'cerrada';
      const etiqueta = estaCerrada ? 'Cerrada' : 'Abierta';
      const claseTag = estaCerrada ? 'cerrada' : 'abierta';
      const esperadoTxt = c.montoEsperado!=null ? fmtMoney(c.montoEsperado) : '—';
      let diferenciaTxt = '—', diferenciaColor = 'inherit';
      if(c.diferencia!=null){
        if(Math.abs(c.diferencia) < 0.005){ diferenciaTxt = 'Exacto'; diferenciaColor = 'var(--success)'; }
        else if(c.diferencia < 0){ diferenciaTxt = 'Falta ' + fmtMoney(Math.abs(c.diferencia)); diferenciaColor = 'var(--danger)'; }
        else { diferenciaTxt = 'Sobra ' + fmtMoney(c.diferencia); diferenciaColor = 'var(--accent)'; }
      }
      return `
        <tr>
          <td class="mono">${c.fecha}</td>
          <td>${c.horaApertura ? fmtFechaHora(c.horaApertura) : '—'}</td>
          <td>${c.montoApertura!=null ? fmtMoney(c.montoApertura) : '—'}</td>
          <td>${c.horaCierre ? fmtFechaHora(c.horaCierre) : '—'}</td>
          <td>${c.montoCierre!=null ? fmtMoney(c.montoCierre) : '—'}</td>
          <td>${esperadoTxt}</td>
          <td style="color:${diferenciaColor}; font-weight:600;">${diferenciaTxt}</td>
          <td><span class="roi-resultado-tag ${claseTag}">${etiqueta}</span></td>
        </tr>`;
    }).join('');
  }catch(e){
    console.error('No se pudo cargar el historial de caja:', e);
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No se pudo cargar el historial. Intenta de nuevo.</td></tr>';
  }
}

/* ---- Mis jugadas ---- */
// FILTRO POR ESTADO - VENDEDOR JUGADAS (dropdown)
