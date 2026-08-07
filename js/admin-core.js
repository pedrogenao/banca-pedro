/* ========================================================================
   ADMIN-CORE.JS
   Admin: suscripciones en tiempo real a todas las colecciones (vendedores, jugadas, cobros, depósitos, ajustes, config, nómina) y la vista Resumen.
   ======================================================================== */

/* ======================================================================
   ADMIN: SUSCRIPCIONES EN TIEMPO REAL
   ====================================================================== */
function suscribirAdmin(){
  purgarDatosAntiguos(); // limpieza silenciosa: conserva solo los últimos 30 días
  const u1 = db.collection(COL_USUARIOS).where('rol','==','vendedor').onSnapshot(snap=>{
    VENDEDORES = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderVendedoresAdmin();
    renderResumenAdmin();
    poblarSelectVendedores();
    renderFiltroVendedorDepositosAdmin();
    renderSaldo();
    renderNomina();
  }, errSnap('vendedores'));
  const u2 = db.collection(COL_JUGADAS).onSnapshot(snap=>{
    JUGADAS = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=> (b.fechaEnvio?.seconds||0) - (a.fechaEnvio?.seconds||0));
    renderJugadasAdmin();
    renderResumenAdmin();
    if(document.getElementById('v-roi')?.classList.contains('active')) renderROI();
    if(document.getElementById('v-resultado-jugadas')?.classList.contains('active')) renderResultadoJugadas();
    if(document.getElementById('modalNuevaJugada')?.classList.contains('show')) actualizarLoteriasDisponiblesNJ();
  }, errSnap('jugadas'));
  let primerSnapshotCobrosAdmin = true; // evita sonar por los cobros que ya existían al iniciar sesión
  const u3 = db.collection(COL_COBROS).onSnapshot(snap=>{
    if(!primerSnapshotCobrosAdmin){
      const nuevos = snap.docChanges().filter(c=> c.type==='added' && c.doc.data().estado==='pendiente');
      if(nuevos.length===1){
        const v = VENDEDORES.find(x=>x.usuario===nuevos[0].doc.data().vendedor);
        notificarNuevoEnvioAdmin(` Nueva solicitud de cobro de ${v ? v.nombre : nuevos[0].doc.data().vendedor}`);
      } else if(nuevos.length>1){
        notificarNuevoEnvioAdmin(` ${nuevos.length} nuevas solicitudes de cobro`);
      }
    }
    primerSnapshotCobrosAdmin = false;
    COBROS = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=> (b.fechaEnvio?.seconds||0) - (a.fechaEnvio?.seconds||0));
    renderCobrosAdmin();
    renderResumenAdmin();
  }, errSnap('cobros'));
  let primerSnapshotDepositosAdmin = true; // evita sonar por los depósitos que ya existían al iniciar sesión
  const u4 = db.collection(COL_DEPOSITOS).onSnapshot(snap=>{
    if(!primerSnapshotDepositosAdmin){
      const nuevos = snap.docChanges().filter(c=> c.type==='added' && c.doc.data().estado==='pendiente');
      if(nuevos.length===1){
        const v = VENDEDORES.find(x=>x.usuario===nuevos[0].doc.data().vendedor);
        notificarNuevoEnvioAdmin(` Nuevo depósito reportado por ${v ? v.nombre : nuevos[0].doc.data().vendedor}`);
      } else if(nuevos.length>1){
        notificarNuevoEnvioAdmin(` ${nuevos.length} nuevos depósitos reportados`);
      }
    }
    primerSnapshotDepositosAdmin = false;
    DEPOSITOS = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=> (b.fechaEnvio?.seconds||0) - (a.fechaEnvio?.seconds||0));
    renderDepositosAdmin();
    renderResumenAdmin();
    renderSaldo();
  }, errSnap('depósitos'));
  const u7 = db.collection(COL_AJUSTES).onSnapshot(snap=>{
    AJUSTES = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=> (b.fecha?.seconds||0) - (a.fecha?.seconds||0));
    renderSaldo();
    renderResumenAdmin();
  }, errSnap('ajustes de saldo'));
  const u8 = db.collection(COL_CONFIG).doc('saldoInicial').onSnapshot(doc=>{
    SALDO_INICIAL_GLOBAL = doc.exists ? (doc.data().valor || 0) : 0;
    renderSaldo();
    renderResumenAdmin();
  }, errSnap('saldo inicial'));
  const u10 = db.collection(COL_CONFIG).doc('arrastreSaldo').onSnapshot(doc=>{
    ARRASTRE_SALDO = {
      asignadoVendedores: 0, pagosNomina: 0, cobrosConfirmados: 0, depositosConfirmados: 0, gananciaNetaMartingala: 0,
      ...(doc.exists ? doc.data() : {}),
    };
    renderSaldo();
    renderResumenAdmin();
  }, errSnap('arrastre de saldo'));
  const u9 = db.collection(COL_NOMINA).onSnapshot(snap=>{
    NOMINA = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=> (b.fecha?.seconds||0) - (a.fecha?.seconds||0));
    renderNomina();
    renderSaldo();
    renderResumenAdmin();
  }, errSnap('nómina'));
  const u6 = db.collection(COL_CUENTAS).onSnapshot(snap=>{
    CUENTAS_BANCARIAS = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=> (a.banco||'').localeCompare(b.banco||''));
    renderCuentasAdmin();
  }, errSnap('cuentas bancarias'));
  // Cajas de hoy, para el resumen
  const u5 = db.collection(COL_CAJA).where('fecha','==',hoyStr()).onSnapshot(snap=>{
    CAJAS_HOY_ADMIN = new Set(snap.docs.map(d=>d.data().vendedor));
    renderVendedoresAdmin();
    renderResumenAdmin();
  }, errSnap('cajas del día'));
  LISTENERS.push(u1,u2,u3,u4,u5,u6,u7,u8,u9,u10);

  // Respaldo extra: además de los listeners en tiempo real de arriba (que
  // ya actualizan Saldo al instante ante cualquier cambio), refrescamos
  // el cálculo cada 20s por si una reconexión de red tarda en llegar.
  // Así "Saldo" nunca se queda desactualizado sin necesidad de refrescar
  // la página.
  const intervaloSaldo = setInterval(()=>{ renderSaldo(); renderNomina(); renderResumenAdmin(); }, 20000);
  LISTENERS.push(()=> clearInterval(intervaloSaldo));
}
let CAJAS_HOY_ADMIN = new Set();

async function renderResumenAdmin(){
  document.getElementById('rsVendedores').textContent = VENDEDORES.filter(v=>v.activo!==false).length;
  document.getElementById('rsJugadasPend').textContent = JUGADAS.filter(j=>j.estado==='pendiente').length;
  document.getElementById('rsCobrosPend').textContent = COBROS.filter(c=>c.estado==='pendiente').length;
  document.getElementById('rsDepPend').textContent = DEPOSITOS.filter(d=>d.estado==='pendiente').length;

  // 🔥 NUEVO: Calcular saldo total de todos los jugadores activos
  const saldoTotal = VENDEDORES
    .filter(v => v.activo !== false)
    .reduce((sum, v) => sum + (v.saldo || 0), 0);
  document.getElementById('rsSaldoTotal').textContent = fmtMoney(saldoTotal);

  // 🔥 Saldo inicial / invertido / actual de la banca, igual que en "Saldo"
  // (misma fórmula que renderSaldo() en saldo.js: resta asignado a
  // vendedores y nómina, suma la ganancia neta acumulada de las rachas de
  // martingala ya cerradas — ver calcularCiclosGananciaNetaMartingala en
  // resultados-engine.js). Se le suma ARRASTRE_SALDO por los registros ya
  // purgados por tener más de 30 días (ver purgarDatosAntiguos en utils.js).
  const totalAsignadoJugadoresRs = AJUSTES.reduce((sum,a)=> sum + (a.monto||0), 0) + (ARRASTRE_SALDO.asignadoVendedores||0);
  const totalPagosNominaRs = NOMINA.filter(n=>n.tipo==='pago').reduce((sum,n)=> sum + (n.montoNeto||0), 0) + (ARRASTRE_SALDO.pagosNomina||0);
  const ciclosGananciaNetaRs = await calcularCiclosGananciaNetaMartingala();
  const totalGananciaNetaRs = ciclosGananciaNetaRs.reduce((sum,c)=> sum + c.gananciaNeta, 0) + (ARRASTRE_SALDO.gananciaNetaMartingala||0);
  const saldoActualRs = SALDO_INICIAL_GLOBAL - totalAsignadoJugadoresRs - totalPagosNominaRs + totalGananciaNetaRs;
  document.getElementById('rsSaldoInicial').textContent = fmtMoney(SALDO_INICIAL_GLOBAL);
  // "Saldo invertido" = lo que el admin ASIGNÓ a los jugadores (saldo
  // inicial de cada cuenta + todas las recargas hechas), NO su saldo en
  // vivo (eso es "Saldo total jugadores", que ya se muestra aparte).
  document.getElementById('rsSaldoInvertido').textContent = fmtMoney(totalAsignadoJugadoresRs);
  const rsSaldoActualEl = document.getElementById('rsSaldoActual');
  rsSaldoActualEl.textContent = fmtMoneySigned(saldoActualRs);
  rsSaldoActualEl.style.color = saldoActualRs < 0 ? 'var(--danger)' : (saldoActualRs > 0 ? 'var(--success)' : '');

  actualizarBadge('badgeJugadasAdmin', JUGADAS.filter(j=>j.estado==='pendiente').length);
  actualizarBadge('badgeCobrosAdmin', COBROS.filter(c=>c.estado==='pendiente').length);
  actualizarBadge('badgeDepositosAdmin', DEPOSITOS.filter(d=>d.estado==='pendiente').length);

  const tbody = document.getElementById('rsTablaVendedores');
  if(VENDEDORES.length === 0){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Aún no hay jugadores registrados.</td></tr>`;
    return;
  }
  tbody.innerHTML = VENDEDORES.map(v=>{
    const abrio = CAJAS_HOY_ADMIN.has(v.usuario);
    return `<tr>
      <td><b>${v.nombre}</b><div class="small-muted">@${v.usuario}</div></td>
      <td>${fmtMoney(v.saldo)}</td>
      <td>${abrio ? '<span class="tag tag-abierta">Abierta</span>' : '<span class="tag tag-rechazada">Cerrada</span>'}</td>
      <td>${v.activo===false ? '<span class="tag tag-rechazada">Inactivo</span>' : '<span class="tag tag-abierta">Activo</span>'}</td>
    </tr>`;
  }).join('');
}

function actualizarBadge(id, n){
  const el = document.getElementById(id);
  if(n > 0){ el.style.display='inline-block'; el.textContent = n; } else { el.style.display='none'; }
  // Mismo contador, reflejado como puntico rojo en la barra inferior (Android).
  // Convención: 'badgeJugadasAdmin' -> 'dotJugadasAdmin'
  const dot = document.getElementById(id.replace('badge','dot'));
  if(dot) dot.classList.toggle('show', n > 0);
}

