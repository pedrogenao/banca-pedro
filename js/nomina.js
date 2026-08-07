/* ========================================================================
   NOMINA.JS
   Admin: nómina quincenal — descuentos y pagos a cada jugador.
   ======================================================================== */

/* ======================================================================
   ADMIN: NÓMINA — pago quincenal de cada vendedor
   - Cada vendedor tiene un "pagoQuincenal" fijo (campo en sistema_usuarios).
   - Si el vendedor no confirma una solicitud de cobro, pierde un ticket o
     su saldo no coincide con el flujo actual, el admin le aplica un
     "descuento" (sistema_nomina, tipo:'descuento', estado:'pendiente') que
     se descuenta de su PRÓXIMO pago.
   - Al pagar, se crea un registro tipo:'pago' con el neto pagado, se
     marcan como 'aplicado' los descuentos pendientes usados, y ese neto se
     resta del saldo actual de la banca (ver renderSaldo()).
   ====================================================================== */
function descuentosPendientes(usuario){
  return NOMINA.filter(n=> n.vendedor===usuario && n.tipo==='descuento' && n.estado==='pendiente');
}
function abrirModalDescuentoNomina(usuario){
  const v = VENDEDORES.find(x=>x.usuario===usuario);
  if(!v) return;
  document.getElementById('dnVendedorTxt').textContent = `${v.nombre} · @${v.usuario}`;
  document.getElementById('dnMonto').value = '';
  document.getElementById('dnMotivo').value = '';
  document.getElementById('modalDescuentoNomina').dataset.usuario = usuario;
  openModal('modalDescuentoNomina');
}
document.getElementById('btnGuardarDescuentoNomina').addEventListener('click', async ()=>{
  const usuario = document.getElementById('modalDescuentoNomina').dataset.usuario;
  const monto = Number(document.getElementById('dnMonto').value);
  const motivo = document.getElementById('dnMotivo').value.trim();
  if(!(monto > 0)){ toast('Ingresa un monto de descuento válido.', 'danger'); return; }
  if(!motivo){ toast('Escribe el motivo del descuento.', 'danger'); return; }
  await db.collection(COL_NOMINA).add({
    vendedor: usuario, tipo:'descuento', estado:'pendiente',
    monto, motivo, admin: CURRENT_USER.usuario,
    fecha: firebase.firestore.FieldValue.serverTimestamp(),
  });
  toast('Descuento aplicado. Se restará del próximo pago.', 'success');
  closeModal('modalDescuentoNomina');
});
function abrirModalPagarNomina(usuario){
  const v = VENDEDORES.find(x=>x.usuario===usuario);
  if(!v) return;
  const bruto = v.pagoQuincenal || 0;
  const descuentos = descuentosPendientes(usuario).reduce((sum,n)=> sum + (n.monto||0), 0);
  const neto = Math.max(0, bruto - descuentos);
  document.getElementById('pnVendedorTxt').textContent = `${v.nombre} · @${v.usuario}`;
  document.getElementById('pnBruto').textContent = fmtMoney(bruto);
  document.getElementById('pnDescuentos').textContent = fmtMoney(descuentos);
  document.getElementById('pnNeto').textContent = fmtMoney(neto);
  document.getElementById('modalPagarNomina').dataset.usuario = usuario;
  openModal('modalPagarNomina');
}
document.getElementById('btnConfirmarPagoNomina').addEventListener('click', async ()=>{
  const usuario = document.getElementById('modalPagarNomina').dataset.usuario;
  const v = VENDEDORES.find(x=>x.usuario===usuario);
  if(!v) return;
  const bruto = v.pagoQuincenal || 0;
  const pendientes = descuentosPendientes(usuario);
  const descuentos = pendientes.reduce((sum,n)=> sum + (n.monto||0), 0);
  const neto = Math.max(0, bruto - descuentos);

  const batch = db.batch();
  pendientes.forEach(n=> batch.update(db.collection(COL_NOMINA).doc(n.id), { estado:'aplicado' }));
  const refPago = db.collection(COL_NOMINA).doc();
  batch.set(refPago, {
    vendedor: usuario, tipo:'pago', montoBruto: bruto, descuentosAplicados: descuentos, montoNeto: neto,
    admin: CURRENT_USER.usuario, fecha: firebase.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  toast(`Nómina de ${v.nombre} pagada: ${fmtMoney(neto)}`, 'success');
  closeModal('modalPagarNomina');
});

function generarNominaCardHTML(v, descuentos, neto){
  return `
    <div class="cobro-card">
      <div class="cobro-head">
        <div class="cobro-head-left">
          <div class="cobro-ic"></div>
          <div>
            <div class="cobro-title">${v.nombre}</div>
            <div class="cobro-sub mono">@${v.usuario}</div>
          </div>
        </div>
      </div>
      <div class="cobro-body">
        <div class="cobro-info-grid">
          <div class="cobro-info-item"><div class="lbl">Pago quincenal</div><div class="val">${fmtMoney(v.pagoQuincenal||0)}</div></div>
          <div class="cobro-info-item"><div class="lbl">Descuentos pendientes</div><div class="val" style="color:${descuentos>0?'var(--danger)':'inherit'};">${fmtMoney(descuentos)}</div></div>
        </div>
        <div class="cobro-monto-wrap">
          <span class="lbl">Neto a pagar</span>
          <span class="val">${fmtMoney(neto)}</span>
        </div>
        <div class="action-row" style="margin-top:12px;">
          <button class="btn btn-outline btn-sm" onclick="abrirModalDescuentoNomina('${v.usuario}')">Aplicar descuento</button>
          <button class="btn btn-primary btn-sm" onclick="abrirModalPagarNomina('${v.usuario}')">Pagar nómina</button>
        </div>
      </div>
    </div>`;
}

function renderNomina(){
  const tbody = document.getElementById('tablaNomina');
  if(!tbody) return; // la vista aún no está en el DOM

  const activos = VENDEDORES.filter(v=>v.activo!==false);
  document.getElementById('nominaCantidadVendedores').textContent = `${activos.length} jugador${activos.length===1?'':'es'} activo${activos.length===1?'':'s'}`;

  const cardsWrap = document.getElementById('cardsNomina');
  if(activos.length===0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No hay jugadores activos.</td></tr>';
    if(cardsWrap) cardsWrap.innerHTML = '<div class="empty-state"><div class="ic"></div>No hay jugadores activos.</div>';
  } else {
    const filas = activos.map(v=>{
      const descuentos = descuentosPendientes(v.usuario).reduce((sum,n)=> sum + (n.monto||0), 0);
      const neto = Math.max(0, (v.pagoQuincenal||0) - descuentos);
      return { v, descuentos, neto };
    }).sort((a,b)=> a.v.nombre.localeCompare(b.v.nombre));

    tbody.innerHTML = filas.map(({v,descuentos,neto})=>`
      <tr>
        <td>${v.nombre}<div class="small-muted mono">@${v.usuario}</div></td>
        <td>${fmtMoney(v.pagoQuincenal||0)}</td>
        <td style="color:${descuentos>0?'var(--danger)':'inherit'};">${fmtMoney(descuentos)}</td>
        <td><b>${fmtMoney(neto)}</b></td>
        <td class="action-row">
          <button class="btn btn-outline btn-sm" onclick="abrirModalDescuentoNomina('${v.usuario}')">Descontar</button>
          <button class="btn btn-primary btn-sm" onclick="abrirModalPagarNomina('${v.usuario}')">Pagar</button>
        </td>
      </tr>`).join('');
    if(cardsWrap) cardsWrap.innerHTML = filas.map(({v,descuentos,neto})=> generarNominaCardHTML(v,descuentos,neto)).join('');
  }

  // Historial (últimos movimientos: descuentos y pagos)
  const tbodyHist = document.getElementById('tablaNominaHist');
  const cardsWrapHist = document.getElementById('cardsNominaHist');
  document.getElementById('nominaHistCantidad').textContent = `${NOMINA.length} movimiento${NOMINA.length===1?'':'s'}`;
  if(NOMINA.length===0){
    tbodyHist.innerHTML = '<tr class="empty-row"><td colspan="5">Sin movimientos todavía.</td></tr>';
    if(cardsWrapHist) cardsWrapHist.innerHTML = '<div class="empty-state"><div class="ic"></div>Sin movimientos todavía.</div>';
    return;
  }
  tbodyHist.innerHTML = NOMINA.map(n=>{
    const vend = VENDEDORES.find(v=>v.usuario===n.vendedor);
    const nombreVend = vend ? vend.nombre : n.vendedor;
    const esPago = n.tipo==='pago';
    const tipoTxt = esPago ? '<span class="tag tag-confirmada">Pago</span>' : (n.estado==='aplicado' ? '<span class="tag tag-abierta">Descuento aplicado</span>' : '<span class="tag tag-pendiente">Descuento pendiente</span>');
    const montoTxt = esPago ? fmtMoney(n.montoNeto) : fmtMoney(n.monto);
    const motivoTxt = esPago ? `Bruto ${fmtMoney(n.montoBruto)} − descuentos ${fmtMoney(n.descuentosAplicados)}` : (n.motivo || '—');
    return `<tr>
      <td>${nombreVend}</td>
      <td>${tipoTxt}</td>
      <td>${montoTxt}</td>
      <td class="small-muted">${motivoTxt}</td>
      <td class="small-muted">${fmtFechaHora(n.fecha)}</td>
    </tr>`;
  }).join('');
  if(cardsWrapHist) cardsWrapHist.innerHTML = NOMINA.map(n=>{
    const vend = VENDEDORES.find(v=>v.usuario===n.vendedor);
    const nombreVend = vend ? vend.nombre : n.vendedor;
    const esPago = n.tipo==='pago';
    const tipoTxt = esPago ? '<span class="tag tag-confirmada">Pago</span>' : (n.estado==='aplicado' ? '<span class="tag tag-abierta">Descuento aplicado</span>' : '<span class="tag tag-pendiente">Descuento pendiente</span>');
    const montoTxt = esPago ? fmtMoney(n.montoNeto) : fmtMoney(n.monto);
    const motivoTxt = esPago ? `Bruto ${fmtMoney(n.montoBruto)} − descuentos ${fmtMoney(n.descuentosAplicados)}` : (n.motivo || '—');
    return `
      <div class="cobro-card">
        <div class="cobro-head">
          <div class="cobro-head-left">
            <div class="cobro-ic"></div>
            <div>
              <div class="cobro-title">${nombreVend}</div>
              <div class="cobro-sub">${fmtFechaHora(n.fecha)}</div>
            </div>
          </div>
          ${tipoTxt}
        </div>
        <div class="cobro-body">
          <div class="cobro-monto-wrap"><span class="lbl">Monto</span><span class="val">${montoTxt}</span></div>
          <div class="small-muted" style="margin-top:8px;">${motivoTxt}</div>
        </div>
      </div>`;
  }).join('');
}

