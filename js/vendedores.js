/* ========================================================================
   VENDEDORES.JS
   Admin: alta/edición/activación de jugadores (vendedores), recargas de saldo, y cuentas bancarias de la banca para recibir transferencias.
   ======================================================================== */

function generarVendedorCardHTML(v){
  const abrio = CAJAS_HOY_ADMIN.has(v.usuario);
  const nombreEsc = (v.nombre||'').replace(/'/g,"\\'");
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
        ${v.activo===false ? '<span class="tag tag-rechazada">Inactivo</span>' : '<span class="tag tag-abierta">Activo</span>'}
      </div>
      <div class="cobro-body">
        <div class="cobro-info-grid">
          <div class="cobro-info-item"><div class="lbl">Saldo actual</div><div class="val">${fmtMoney(v.saldo)}</div></div>
          <div class="cobro-info-item"><div class="lbl">Caja hoy</div><div class="val">${abrio ? '<span class="tag tag-abierta">Abierta</span>' : '<span class="tag tag-rechazada">Cerrada</span>'}</div></div>
        </div>
        <div class="action-row" style="margin-top:4px;">
          <button class="btn btn-outline btn-sm" onclick="abrirModalEditarVendedor('${v.usuario}')">Editar</button>
          <button class="btn btn-outline btn-sm" onclick="abrirModalAjuste('${v.usuario}','${nombreEsc}')">Recargar saldo</button>
          <button class="btn btn-outline btn-sm" onclick="abrirHistorialRecargas('${v.usuario}','${nombreEsc}')">Historial</button>
          <button class="btn btn-outline btn-sm" onclick="toggleActivoVendedor('${v.usuario}', ${v.activo===false})">${v.activo===false?'Activar':'Desactivar'}</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarVendedor('${v.usuario}','${nombreEsc}')">Eliminar</button>
        </div>
      </div>
    </div>`;
}
function renderVendedoresAdmin(){
  const tbody = document.getElementById('tablaVendedoresAdmin');
  const cardsWrap = document.getElementById('cardsVendedoresAdmin');
  if(VENDEDORES.length === 0){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No hay jugadores todavía. Crea el primero con "+ Nuevo jugador".</td></tr>`;
    if(cardsWrap) cardsWrap.innerHTML = `<div class="empty-state"><div class="ic"></div>No hay jugadores todavía. Crea el primero con "+ Nuevo jugador".</div>`;
    return;
  }
  tbody.innerHTML = VENDEDORES.map(v=>{
    const abrio = CAJAS_HOY_ADMIN.has(v.usuario);
    return `<tr>
      <td class="mono">@${v.usuario}</td>
      <td>${v.nombre}</td>
      <td><b>${fmtMoney(v.saldo)}</b></td>
      <td>${abrio ? '<span class="tag tag-abierta">Abierta</span>' : '<span class="tag tag-rechazada">Cerrada</span>'}</td>
      <td>${v.activo===false ? '<span class="tag tag-rechazada">Inactivo</span>' : '<span class="tag tag-abierta">Activo</span>'}</td>
      <td class="action-row">
        <button class="btn btn-outline btn-sm" onclick="abrirModalEditarVendedor('${v.usuario}')">Editar</button>
        <button class="btn btn-outline btn-sm" onclick="abrirModalAjuste('${v.usuario}','${v.nombre.replace(/'/g,"\\'")}')">Recargar saldo</button>
        <button class="btn btn-outline btn-sm" onclick="abrirHistorialRecargas('${v.usuario}','${v.nombre.replace(/'/g,"\\'")}')">Historial</button>
        <button class="btn btn-outline btn-sm" onclick="toggleActivoVendedor('${v.usuario}', ${v.activo===false})">${v.activo===false?'Activar':'Desactivar'}</button>
        <button class="btn btn-danger btn-sm" onclick="eliminarVendedor('${v.usuario}','${v.nombre.replace(/'/g,"\\'")}')">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
  if(cardsWrap) cardsWrap.innerHTML = VENDEDORES.map(generarVendedorCardHTML).join('');
}

async function toggleActivoVendedor(usuario, activar){
  await db.collection(COL_USUARIOS).doc(usuario).update({ activo: activar });
  toast(activar ? 'Jugador activado' : 'Jugador desactivado', 'success');
}

/* --- Editar vendedor (nombre, pago quincenal y, opcionalmente, clave) --- */
function abrirModalEditarVendedor(usuario){
  const v = VENDEDORES.find(x=>x.usuario===usuario);
  if(!v) return;
  document.getElementById('evNombre').value = v.nombre || '';
  document.getElementById('evUsuario').value = v.usuario;
  document.getElementById('evClave').value = '';
  document.getElementById('evPagoQuincenal').value = v.pagoQuincenal || 0;
  document.getElementById('modalEditarVendedor').dataset.usuario = usuario;
  openModal('modalEditarVendedor');
}
document.getElementById('btnGuardarEdicionVendedor').addEventListener('click', async ()=>{
  const usuario = document.getElementById('modalEditarVendedor').dataset.usuario;
  const nombre = document.getElementById('evNombre').value.trim();
  const nuevaClave = document.getElementById('evClave').value;
  const pagoQuincenal = Number(document.getElementById('evPagoQuincenal').value) || 0;
  if(!nombre){ toast('El nombre no puede quedar vacío.', 'danger'); return; }
  if(nuevaClave && nuevaClave.length < 4){ toast('La nueva clave debe tener al menos 4 caracteres.', 'danger'); return; }
  const datos = { nombre, pagoQuincenal };
  if(nuevaClave){ datos.clave = await sha256(nuevaClave); }
  await db.collection(COL_USUARIOS).doc(usuario).update(datos);
  toast('Jugador actualizado', 'success');
  closeModal('modalEditarVendedor');
});

/* --- Eliminar vendedor --- */
async function eliminarVendedor(usuario, nombre){
  if(!confirm(`¿Eliminar a "${nombre}" (@${usuario})? Sus jugadas, cobros y depósitos ya registrados no se borran, pero ya no podrá iniciar sesión.`)) return;
  await db.collection(COL_USUARIOS).doc(usuario).delete();
  toast('Jugador eliminado', 'success');
}

/* --- Nuevo vendedor --- */
document.getElementById('btnNuevoVendedor').addEventListener('click', ()=>{
  document.getElementById('nvNombre').value='';
  document.getElementById('nvUsuario').value='';
  document.getElementById('nvClave').value='';
  document.getElementById('nvSaldo').value='0';
  document.getElementById('nvPagoQuincenal').value='0';
  openModal('modalNuevoVendedor');
});
document.getElementById('btnGuardarVendedor').addEventListener('click', async ()=>{
  const nombre = document.getElementById('nvNombre').value.trim();
  const usuario = document.getElementById('nvUsuario').value.trim().toLowerCase();
  const clave = document.getElementById('nvClave').value;
  const saldo = Number(document.getElementById('nvSaldo').value) || 0;
  const pagoQuincenal = Number(document.getElementById('nvPagoQuincenal').value) || 0;
  if(!nombre || !usuario || clave.length < 4){ toast('Completa todos los campos (clave mínimo 4 caracteres).', 'danger'); return; }
  const ref = db.collection(COL_USUARIOS).doc(usuario);
  const existe = await ref.get();
  if(existe.exists){ toast('Ese usuario ya existe.', 'danger'); return; }
  const claveHash = await sha256(clave);
  await ref.set({
    usuario, nombre, clave: claveHash, rol:'vendedor', saldo, pagoQuincenal, activo:true,
    creado: firebase.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection(COL_AJUSTES).add({
    vendedor: usuario, monto: saldo, tipo:'inicial', motivo:'Saldo inicial al crear la cuenta',
    admin: CURRENT_USER.usuario, fecha: firebase.firestore.FieldValue.serverTimestamp(),
  });
  toast('Jugador creado correctamente', 'success');
  closeModal('modalNuevoVendedor');
});

/* ======================================================================
   ADMIN: CUENTAS BANCARIAS PARA RECIBIR TRANSFERENCIAS
   ====================================================================== */
function renderCuentasAdmin(){
  const cont = document.getElementById('listaCuentasAdmin');
  if(!cont) return;
  if(CUENTAS_BANCARIAS.length === 0){
    cont.innerHTML = `<div class="empty-state"><div class="ic"></div>Aún no has agregado cuentas. Los jugadores solo podrán reportar depósitos en efectivo.</div>`;
    return;
  }
  cont.innerHTML = CUENTAS_BANCARIAS.map(c=>`
    <div class="cuenta-card${c.activo===false?' inactiva':''}">
      <div class="cuenta-ic"></div>
      <div class="cuenta-info">
        <div class="cuenta-banco">${c.banco}${c.tipo?` · ${c.tipo}`:''}</div>
        <div class="cuenta-num">N.° ${c.numero}${c.titular?` · ${c.titular}`:''}</div>
      </div>
      <div class="action-row">
        <span class="tag ${c.activo===false?'tag-rechazada':'tag-abierta'}">${c.activo===false?'Inactiva':'Activa'}</span>
        <button class="btn btn-outline btn-sm" onclick="toggleActivoCuenta('${c.id}', ${c.activo===false})">${c.activo===false?'Activar':'Desactivar'}</button>
        <button class="btn btn-danger btn-sm" onclick="eliminarCuenta('${c.id}')">Eliminar</button>
      </div>
    </div>
  `).join('');
}
document.getElementById('btnNuevaCuenta').addEventListener('click', ()=>{
  document.getElementById('ncBanco').value='';
  document.getElementById('ncTipo').value='Ahorros';
  document.getElementById('ncNumero').value='';
  document.getElementById('ncTitular').value='';
  openModal('modalNuevaCuenta');
});
document.getElementById('btnGuardarCuenta').addEventListener('click', async ()=>{
  const banco = document.getElementById('ncBanco').value.trim();
  const tipo = document.getElementById('ncTipo').value;
  const numero = document.getElementById('ncNumero').value.trim();
  const titular = document.getElementById('ncTitular').value.trim();
  if(!banco || !numero){ toast('Ingresa al menos el banco y el número de cuenta.', 'danger'); return; }
  await db.collection(COL_CUENTAS).add({
    banco, tipo, numero, titular: titular || null, activo:true,
    creado: firebase.firestore.FieldValue.serverTimestamp(),
  });
  toast('Cuenta agregada', 'success');
  closeModal('modalNuevaCuenta');
});
async function toggleActivoCuenta(id, activar){
  await db.collection(COL_CUENTAS).doc(id).update({ activo: activar });
  toast(activar ? 'Cuenta activada' : 'Cuenta desactivada', 'success');
}
async function eliminarCuenta(id){
  if(!confirm('¿Eliminar esta cuenta? Los depósitos ya reportados con ella no se ven afectados.')) return;
  await db.collection(COL_CUENTAS).doc(id).delete();
  toast('Cuenta eliminada', 'success');
}

/* --- Historial de recargas de un jugador ---
   AJUSTES ya se suscribe en tiempo real a sistema_ajustes (admin-core.js)
   e incluye tanto el saldo inicial como cada recarga posterior. Aquí solo
   lo filtramos por vendedor y lo mostramos ordenado del más reciente al
   más antiguo, para que el admin pueda ver que la recarga sí quedó
   registrada aunque el saldo en la tarjeta no cambie a simple vista. */
function abrirHistorialRecargas(usuario, nombre){
  document.getElementById('histRecargasVendedorTxt').textContent = `Jugador: ${nombre} (@${usuario})`;
  const cont = document.getElementById('histRecargasLista');
  const movimientos = AJUSTES
    .filter(a => a.vendedor === usuario)
    .slice()
    .sort((a,b) => {
      const fa = a.fecha && a.fecha.toDate ? a.fecha.toDate().getTime() : 0;
      const fb = b.fecha && b.fecha.toDate ? b.fecha.toDate().getTime() : 0;
      return fb - fa;
    });
  if(movimientos.length === 0){
    cont.innerHTML = `<div class="empty-state"><div class="ic"></div>Este jugador todavía no tiene recargas registradas.</div>`;
  } else {
    cont.innerHTML = movimientos.map(m=>{
      const tipoTxt = m.tipo === 'inicial' ? 'Saldo inicial' : 'Recarga';
      return `
        <div class="hist-recarga-item">
          <div>
            <div>${tipoTxt}</div>
            <div class="small-muted">${m.motivo || '—'}</div>
            <div class="small-muted">${fmtFechaHora(m.fecha)}${m.admin ? ` · por @${m.admin}` : ''}</div>
          </div>
          <div class="hist-recarga-monto">+${fmtMoney(m.monto)}</div>
        </div>`;
    }).join('');
  }
  openModal('modalHistorialRecargas');
}

/* --- Ajuste de saldo --- */
function abrirModalAjuste(usuario, nombre){
  document.getElementById('ajusteVendedorTxt').textContent = `Jugador: ${nombre} (@${usuario})`;
  document.getElementById('ajusteMonto').value = '';
  document.getElementById('ajusteMotivo').value = '';
  document.getElementById('modalAjusteSaldo').dataset.usuario = usuario;
  openModal('modalAjusteSaldo');
}
document.getElementById('btnGuardarAjuste').addEventListener('click', async ()=>{
  const usuario = document.getElementById('modalAjusteSaldo').dataset.usuario;
  const monto = Number(document.getElementById('ajusteMonto').value);
  const motivo = document.getElementById('ajusteMotivo').value.trim() || 'Sin motivo especificado';
  if(!monto || monto <= 0){ toast('Ingresa un monto válido.', 'danger'); return; }
  // Esta función solo RECARGA (suma) saldo al vendedor. Para descontar
  // saldo se usa el flujo de depósitos confirmados (ver confirmarDeposito()).
  const delta = monto;
  try{
    await db.runTransaction(async (tx)=>{
      const ref = db.collection(COL_USUARIOS).doc(usuario);
      const doc = await tx.get(ref);
      const saldoActual = doc.data().saldo || 0;
      tx.update(ref, { saldo: saldoActual + delta });
    });
    await db.collection(COL_AJUSTES).add({
      vendedor: usuario, monto: delta, tipo:'recarga', motivo, admin: CURRENT_USER.usuario,
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
    });
    toast('Saldo recargado', 'success');
    closeModal('modalAjusteSaldo');
  }catch(err){ console.error(err); toast('Error aplicando la recarga: ' + err.message, 'danger'); }
});

