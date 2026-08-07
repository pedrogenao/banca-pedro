/* ========================================================================
   CHAT.JS
   Chat grupal en tiempo real entre el admin y todos los jugadores
   (vendedores): solo mensajes de texto. Notifica con el mismo
   timbre/toast que ya se usa cuando el admin envía una jugada nueva.
   ======================================================================== */

/* ======================================================================
   ESCAPE HTML (el chat es texto libre escrito por cualquier usuario, así
   que nunca lo insertamos directo en innerHTML sin escapar).
   ====================================================================== */
function escapeHtmlChat(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/* ======================================================================
   SUSCRIPCIÓN EN TIEMPO REAL AL CHAT (admin y vendedor por igual)
   ====================================================================== */
function suscribirChatComun(){
  let primerSnapshotChat = true; // evita sonar por mensajes que ya existían al iniciar sesión (se reinicia en cada login)
  const u = db.collection(COL_CHAT).orderBy('fecha','asc').limitToLast(300).onSnapshot(snap=>{
    if(!primerSnapshotChat){
      const propios = new Set();
      const nuevosDeOtros = snap.docChanges().filter(c=>{
        if(c.type !== 'added') return false;
        const data = c.doc.data();
        return data.autor !== CURRENT_USER.usuario;
      });
      if(nuevosDeOtros.length===1){
        const d = nuevosDeOtros[0].doc.data();
        const previa = d.texto ? (d.texto.length>60 ? d.texto.slice(0,60)+'…' : d.texto) : '';
        notificarNuevoEnvioAdmin(` ${d.autorNombre||d.autor}: ${previa}`);
      } else if(nuevosDeOtros.length>1){
        notificarNuevoEnvioAdmin(` ${nuevosDeOtros.length} mensajes nuevos en el chat`);
      }
    }
    primerSnapshotChat = false;
    CHAT_MENSAJES = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderChat();
    actualizarBadgeChat();
  }, errSnap('chat'));
  LISTENERS.push(u);
}

/* ======================================================================
   RENDER DE LA CONVERSACIÓN
   ====================================================================== */
function renderChat(){
  const cont = document.getElementById('chatMensajes');
  if(!cont) return;
  const vacio = document.getElementById('chatVacio');
  if(CHAT_MENSAJES.length === 0){
    if(vacio) vacio.style.display = '';
    cont.querySelectorAll('.chat-bubble-row').forEach(el=>el.remove());
    return;
  }
  if(vacio) vacio.style.display = 'none';

  // ¿el usuario ya estaba viendo el final del chat antes de re-renderizar?
  const casiAbajo = (cont.scrollHeight - cont.scrollTop - cont.clientHeight) < 120;

  cont.querySelectorAll('.chat-bubble-row').forEach(el=>el.remove());
  const frag = document.createDocumentFragment();
  CHAT_MENSAJES.forEach(m=>{
    const esAlerta = m.rol === 'sistema';
    // Las alertas automáticas siempre se muestran como si fueran "de otro"
    // (con el nombre/etiqueta visible), aunque el autor técnico sea el
    // usuario cuyo saldo bajó — así se distinguen de un mensaje de chat normal.
    const esMio = !esAlerta && CURRENT_USER && m.autor === CURRENT_USER.usuario;
    const row = document.createElement('div');
    row.className = 'chat-bubble-row' + (esMio ? ' mio' : '') + (esAlerta ? ' alerta' : '');

    const hora = m.fecha ? fmtHoraChat(m.fecha) : 'enviando…';
    const rolTxt = esAlerta ? 'Alerta automática' : (m.rol === 'admin' ? 'Administrador' : 'Jugador');
    const rolClase = esAlerta ? 'rol-alerta' : (m.rol === 'admin' ? 'rol-admin' : 'rol-vendedor');
    const nombreTxt = escapeHtmlChat(m.autorNombre || m.autor || '');

    const cuerpo = `<div class="chat-texto">${escapeHtmlChat(m.texto || '')}</div>`;

    row.innerHTML = `
      <div class="chat-bubble">
        ${esMio ? '' : `<div class="chat-autor"><span class="chat-autor-nombre">${esAlerta ? '⚠️ Saldo bajo · ' + nombreTxt : nombreTxt}</span><span class="chat-rol-tag ${rolClase}">${rolTxt}</span></div>`}
        ${cuerpo}
        <div class="chat-hora">${hora}</div>
      </div>`;
    frag.appendChild(row);
  });
  cont.appendChild(frag);

  if(casiAbajo){ cont.scrollTop = cont.scrollHeight; }
}

function fmtHoraChat(ts){
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('es-DO',{hour:'2-digit', minute:'2-digit'});
}

/* ======================================================================
   NO LEÍDOS (badge del menú y de la barra inferior)
   Se guarda localmente (por usuario) la marca de tiempo del último
   mensaje visto; todo lo posterior a esa marca y que no sea propio
   cuenta como "no leído".
   ====================================================================== */
function claveLastReadChat(){
  return `lrd_chat_lastread_${CURRENT_USER ? CURRENT_USER.usuario : ''}`;
}
function actualizarBadgeChat(){
  if(!CURRENT_USER) return;
  const lastRead = Number(localStorage.getItem(claveLastReadChat()) || 0);
  const enVistaChat = document.getElementById('v-chat')?.classList.contains('active');
  const noLeidos = CHAT_MENSAJES.filter(m=>{
    if(m.autor === CURRENT_USER.usuario) return false;
    const ms = m.fecha?.toMillis ? m.fecha.toMillis() : (m.fecha ? new Date(m.fecha).getTime() : Date.now());
    return ms > lastRead;
  }).length;
  const n = enVistaChat ? 0 : noLeidos;
  const idBadge = esAdmin() ? 'badgeChatAdmin' : 'badgeChatVendedor';
  actualizarBadge(idBadge, n);
}
function marcarChatLeido(){
  if(!CURRENT_USER) return;
  localStorage.setItem(claveLastReadChat(), String(Date.now()));
  actualizarBadgeChat();
}
function abrirVistaChat(){
  marcarChatLeido();
  const btnLimpiar = document.getElementById('btnLimpiarChat');
  if(btnLimpiar) btnLimpiar.style.display = esAdmin() ? 'inline-flex' : 'none';
  const cont = document.getElementById('chatMensajes');
  if(cont) setTimeout(()=>{ cont.scrollTop = cont.scrollHeight; }, 30);
}

/* ======================================================================
   LIMPIAR CHAT (solo admin): borra los mensajes de más de 7 días,
   conservando siempre la última semana. Se ejecuta:
   - En silencio, cada vez que el admin inicia sesión (ver utils.js →
     purgarDatosAntiguos), igual que ya pasa con jugadas/cobros/etc.
   - A demanda, con el botón "Limpiar chat" (con confirmación y feedback).
   ====================================================================== */
async function limpiarMensajesChatAntiguos(mostrarFeedback){
  try{
    const limite = limiteRetencionChat();
    const snap = await db.collection(COL_CHAT).where('fecha','<', limite).get();
    if(snap.empty){
      if(mostrarFeedback) toast('No hay mensajes de más de 7 días para borrar.', 'success');
      return;
    }
    const docs = snap.docs;

    // Borra los documentos de Firestore en lotes (límite de 500 por batch).
    for(let i=0; i<docs.length; i+=450){
      const batch = db.batch();
      docs.slice(i, i+450).forEach(d=> batch.delete(d.ref));
      await batch.commit();
    }
    if(mostrarFeedback) toast(`Se borraron ${docs.length} mensaje(s) de más de 7 días. Se conserva la última semana.`, 'success');
  }catch(err){
    console.error('No se pudo limpiar el chat:', err);
    if(mostrarFeedback) toast('No se pudo limpiar el chat: ' + err.message, 'danger');
  }
}

document.getElementById('btnLimpiarChat').addEventListener('click', async ()=>{
  if(!confirm('¿Borrar todos los mensajes del chat con más de 7 días de antigüedad? Se conservará siempre la última semana. Esta acción no se puede deshacer.')) return;
  const btn = document.getElementById('btnLimpiarChat');
  btn.disabled = true;
  try{ await limpiarMensajesChatAntiguos(true); }
  finally{ btn.disabled = false; }
});

/* ======================================================================
   ENVIAR MENSAJE DE TEXTO
   ====================================================================== */
document.getElementById('formChatMensaje').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const input = document.getElementById('chatInputTexto');
  const texto = input.value.trim();
  if(!texto || !CURRENT_USER) return;
  input.value = '';
  input.focus();
  try{
    await db.collection(COL_CHAT).add({
      autor: CURRENT_USER.usuario,
      autorNombre: CURRENT_USER.nombre || CURRENT_USER.usuario,
      rol: CURRENT_USER.rol,
      texto,
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }catch(err){
    console.error(err);
    toast('No se pudo enviar el mensaje: ' + err.message, 'danger');
    input.value = texto; // se lo devolvemos al usuario para que no lo pierda
  }
});
