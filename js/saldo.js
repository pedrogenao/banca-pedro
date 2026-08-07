/* ========================================================================
   SALDO.JS
   Admin: pantalla de Saldo — capital inicial, invertido y actual de la banca.
   ======================================================================== */

/* ======================================================================
   ADMIN: SALDO — capital de la banca
   - Saldo inicial: capital base que el admin define manualmente (punto de
     partida de todo el cálculo).
   - Saldo invertido: suma del saldo (en vivo) de todos los vendedores
     activos; por vendedor se muestra con cuánto inició y su saldo actual.
   - Saldo actual: Saldo inicial + depósitos confirmados de vendedores
     − todo lo que el admin les ha asignado/recargado (incluye el saldo
     inicial con el que se creó cada cuenta).
   Acceso exclusivo para admin.
   ====================================================================== */
document.getElementById('btnEditarSaldoInicial').addEventListener('click', ()=>{
  document.getElementById('siMonto').value = SALDO_INICIAL_GLOBAL || '';
  openModal('modalSaldoInicial');
});
document.getElementById('btnGuardarSaldoInicial').addEventListener('click', async ()=>{
  const valor = Number(document.getElementById('siMonto').value);
  if(!(valor >= 0)){ toast('Ingresa un saldo inicial válido.', 'danger'); return; }
  await db.collection(COL_CONFIG).doc('saldoInicial').set({
    valor, actualizadoPor: CURRENT_USER.usuario,
    fecha: firebase.firestore.FieldValue.serverTimestamp(),
  });
  toast('Saldo inicial actualizado', 'success');
  closeModal('modalSaldoInicial');
});

function generarSaldoVendedorCardHTML(v, saldoInicialVendedor){
  const diferencia = (v.saldo||0) - saldoInicialVendedor;
  const claseDif = diferencia > 0 ? 'positivo' : (diferencia < 0 ? 'negativo' : '');
  return `
    <div class="cobro-card">
      <div class="cobro-head">
        <div class="cobro-head-left">
          <div class="cobro-ic">👤</div>
          <div>
            <div class="cobro-title">${v.nombre}</div>
            <div class="cobro-sub mono">@${v.usuario}</div>
          </div>
        </div>
      </div>
      <div class="cobro-body">
        <div class="cobro-info-grid">
          <div class="cobro-info-item"><div class="lbl">Saldo inicial asignado</div><div class="val">${fmtMoney(saldoInicialVendedor)}</div></div>
          <div class="cobro-info-item"><div class="lbl">Saldo actual</div><div class="val">${fmtMoney(v.saldo||0)}</div></div>
          <div class="cobro-info-item"><div class="lbl">Variación</div><div class="val roi-valor ${claseDif}" style="font-size:14.5px;">${fmtMoneySigned(diferencia)}</div></div>
        </div>
      </div>
    </div>`;
}

async function renderSaldo(){
  const elIni = document.getElementById('saldoInicialVal');
  if(!elIni) return; // la vista aún no está en el DOM

  document.getElementById('saldoInicialVal').textContent = fmtMoney(SALDO_INICIAL_GLOBAL);

  const activos = VENDEDORES.filter(v=>v.activo!==false);

  // Saldo inicial asignado + recargas de TODOS los jugadores (AJUSTES:
  // tipo 'inicial' al crear la cuenta, tipo 'recarga' cada vez que se le
  // suma saldo). Esto es "cuánto capital les ha entregado la banca en
  // total" — NO su saldo en vivo (eso es "Saldo total jugadores", que se
  // muestra aparte en Resumen). Se calcula antes porque saldoActual
  // también la necesita más abajo.
  const totalAsignadoVendedores = AJUSTES.reduce((sum,a)=> sum + (a.monto||0), 0) + (ARRASTRE_SALDO.asignadoVendedores||0);
  document.getElementById('saldoInvertidoVal').textContent = fmtMoney(totalAsignadoVendedores);

  // Saldo actual = Saldo inicial
  //   − saldo asignado/recargado a los vendedores (lo que el admin les entregó)
  //   − pagos de nómina ya realizados
  //   + GANANCIA NETA acumulada de todas las rachas de martingala que se
  //     cerraron ganando (ver calcularCiclosGananciaNetaMartingala en
  //     resultados-engine.js): cada racha completa —todo lo perdido en sus
  //     niveles previos + el sorteo que finalmente ganó— ya viene neta de
  //     su propia inversión total, así que sumarla acá refleja la
  //     ganancia REAL de la banca, no el bruto de cada jugada suelta.
  // ✅ Cobros y depósitos confirmados YA NO se suman aquí directamente:
  //    el dinero que entra por un acierto ahora se refleja a través de la
  //    ganancia neta de martingala (que es lo que realmente entró después
  //    de cubrir toda la racha), y no se cuenta dos veces.
  // Se le suma ARRASTRE_SALDO: el efecto de los ajustes/nómina que ya se
  // purgaron por tener más de 30 días (ver purgarDatosAntiguos en utils.js),
  // para que este total nunca se descuadre aunque el detalle ya no exista.
  const totalPagosNomina = NOMINA.filter(n=>n.tipo==='pago').reduce((sum,n)=> sum + (n.montoNeto||0), 0) + (ARRASTRE_SALDO.pagosNomina||0);
  const ciclosGananciaNeta = await calcularCiclosGananciaNetaMartingala();
  const totalGananciaNeta = ciclosGananciaNeta.reduce((sum,c)=> sum + c.gananciaNeta, 0) + (ARRASTRE_SALDO.gananciaNetaMartingala||0);
  const saldoActual = SALDO_INICIAL_GLOBAL - totalAsignadoVendedores - totalPagosNomina + totalGananciaNeta;

  const valActualEl = document.getElementById('saldoActualVal');
  valActualEl.textContent = fmtMoneySigned(saldoActual);
  valActualEl.classList.remove('positivo','negativo');
  valActualEl.style.color = saldoActual < 0 ? 'var(--danger)' : (saldoActual > 0 ? 'var(--success)' : '');

  document.getElementById('saldoCantidadVendedores').textContent = `${activos.length} jugador${activos.length===1?'':'es'} activo${activos.length===1?'':'s'}`;

  const tbody = document.getElementById('tablaSaldoVendedores');
  const cardsWrap = document.getElementById('cardsSaldoVendedores');
  if(activos.length===0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No hay jugadores activos.</td></tr>';
    if(cardsWrap) cardsWrap.innerHTML = '<div class="empty-state"><div class="ic"></div>No hay jugadores activos.</div>';
    return;
  }

  const filas = activos.map(v=>{
    const saldoInicialVendedor = AJUSTES
      .filter(a=> a.vendedor===v.usuario && a.tipo==='inicial')
      .reduce((sum,a)=> sum + (a.monto||0), 0);
    return { v, saldoInicialVendedor };
  }).sort((a,b)=> (b.v.saldo||0) - (a.v.saldo||0));

  tbody.innerHTML = filas.map(({v,saldoInicialVendedor})=>{
    const diferencia = (v.saldo||0) - saldoInicialVendedor;
    return `<tr>
      <td>${v.nombre}<div class="small-muted mono">@${v.usuario}</div></td>
      <td>${fmtMoney(saldoInicialVendedor)}</td>
      <td><b>${fmtMoney(v.saldo||0)}</b></td>
      <td style="color:${diferencia<0?'var(--danger)':(diferencia>0?'var(--success)':'inherit')};">${fmtMoneySigned(diferencia)}</td>
    </tr>`;
  }).join('');
  if(cardsWrap) cardsWrap.innerHTML = filas.map(({v,saldoInicialVendedor})=> generarSaldoVendedorCardHTML(v, saldoInicialVendedor)).join('');
}

