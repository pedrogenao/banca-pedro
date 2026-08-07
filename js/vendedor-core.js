/* ========================================================================
   VENDEDOR-CORE.JS
   Jugador: suscripciones en tiempo real a sus propias jugadas/cobros/depósitos y sus contadores (badges).
   ======================================================================== */

/* ======================================================================
   VENDEDOR: SUSCRIPCIONES EN TIEMPO REAL
   ====================================================================== */
function suscribirVendedor(){
  const usuario = CURRENT_USER.usuario;
  let primerSnapshotJugadas = true; // evita sonar por las jugadas que ya existían al iniciar sesión
  const u1 = db.collection(COL_JUGADAS).where('vendedor','==',usuario).onSnapshot(snap=>{
    if(!primerSnapshotJugadas){
      const nuevas = snap.docChanges().filter(c=> c.type==='added' && c.doc.data().estado==='pendiente');
      if(nuevas.length===1){
        notificarNuevoEnvioAdmin(' Tienes una jugada nueva enviada por el admin');
      } else if(nuevas.length>1){
        notificarNuevoEnvioAdmin(` Tienes ${nuevas.length} jugadas nuevas enviadas por el admin`);
      }
    }
    primerSnapshotJugadas = false;
    JUGADAS = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=> (b.fechaEnvio?.seconds||0) - (a.fechaEnvio?.seconds||0));
    renderJugadasVendedor();
    actualizarBadgesVendedor();
    if(document.getElementById('v-resultado-jugadas')?.classList.contains('active')) renderResultadoJugadas();
  }, errSnap('mis jugadas'));
  const u2 = db.collection(COL_COBROS).where('vendedor','==',usuario).onSnapshot(snap=>{
    COBROS = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=> (b.fechaEnvio?.seconds||0) - (a.fechaEnvio?.seconds||0));
    renderCobrosVendedor();
    actualizarBadgesVendedor();
  }, errSnap('mis cobros'));
  let primerSnapshotDepositosVendedor = true; // evita sonar por lo que ya existía al iniciar sesión
  const u3 = db.collection(COL_DEPOSITOS).where('vendedor','==',usuario).onSnapshot(snap=>{
    if(!primerSnapshotDepositosVendedor){
      const nuevasSolicitudes = snap.docChanges().filter(c=> c.type==='added' && c.doc.data().estado==='solicitado');
      if(nuevasSolicitudes.length>0){
        notificarNuevoEnvioAdmin(' El admin te solicitó un depósito');
      }
    }
    primerSnapshotDepositosVendedor = false;
    DEPOSITOS = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=> (b.fechaEnvio?.seconds||0) - (a.fechaEnvio?.seconds||0));
    renderDepositosVendedor();
  }, errSnap('mis depósitos'));
  const u5 = db.collection(COL_CUENTAS).where('activo','==',true).onSnapshot(snap=>{
    CUENTAS_BANCARIAS = snap.docs.map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=> (a.banco||'').localeCompare(b.banco||''));
    renderCuentasDepositoVendedor();
  }, errSnap('cuentas para transferencias'));
  const u4 = db.collection(COL_CAJA).doc(`${usuario}_${hoyStr()}`).onSnapshot(doc=>{
    CAJA_HOY = doc.exists ? doc.data() : null;
    renderCajaVendedor();
  }, errSnap('caja del día'));
  // Recargas de saldo que el admin le ha hecho a ESTE jugador (necesario
  // para el arqueo de cierre de caja, que suma las recargas del día).
  const u6 = db.collection(COL_AJUSTES).where('vendedor','==',usuario).onSnapshot(snap=>{
    AJUSTES = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  }, errSnap('mis recargas'));
  LISTENERS.push(u1,u2,u3,u4,u5,u6);
}
function actualizarBadgesVendedor(){
  actualizarBadge('badgeJugadasVendedor', JUGADAS.filter(j=>j.estado==='pendiente').length);
  actualizarBadge('badgeCobrosVendedor', COBROS.filter(c=>c.estado==='pendiente').length);
}

/* ---- Caja ---- */
