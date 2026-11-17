/* =====================================================================
 * REUNIONES Y PRIVACIDAD DEL CALENDARIO
 * ===================================================================*/
function calendario_() {
  const id = PropertiesService.getScriptProperties().getProperty('CAL_ID');
  const cal = id && CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('El calendario del equipo no está configurado. Ejecuta inicializar() en el editor.');
  return cal;
}

function esCreadorReunion_(evento, email) {
  const identidad = String(email || '').toLowerCase();
  if (!identidad) return false;
  const etiqueta = String(evento.getTag('creadoPor') || '').toLowerCase();
  if (etiqueta) return etiqueta === identidad;
  return Boolean(evento.getCreators && (evento.getCreators() || []).some(function (creador) {
    return String(creador).toLowerCase() === identidad;
  }));
}

function eventos_(desde, hasta, u) {
  const email = String(u.email || '').toLowerCase();
  return calendario_().getEvents(desde, hasta).filter(function (ev) {
    const invitados = ev.getGuestList().map(function (g) { return String(g.getEmail()).toLowerCase(); });
    return invitados.indexOf(email) >= 0 || esCreadorReunion_(ev, email);
  }).map(function (ev) {
    const invitados = ev.getGuestList().map(function (g) { return String(g.getEmail()).toLowerCase(); });
    const etiqueta = String(ev.getTag('creadoPor') || '').toLowerCase();
    const organizo = esCreadorReunion_(ev, email);
    const texto = (ev.getLocation() || '') + ' ' + (ev.getDescription() || '');
    const meet = (texto.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i) || [''])[0];
    return {
      id: ev.getId(), titulo: ev.getTitle() || '(Sin título)',
      inicio: ev.getStartTime().toISOString(), fin: ev.getEndTime().toISOString(),
      todoElDia: ev.isAllDayEvent(), lugar: ev.getLocation(), descripcion: ev.getDescription(),
      participantes: invitados.length, meet: meet,
      soyInvitado: invitados.indexOf(email) >= 0, organizo: Boolean(organizo), creador: etiqueta
    };
  });
}

function reuniones_(d, u) {
  const desde = new Date(d.desde), hasta = new Date(d.hasta);
  if (isNaN(desde) || isNaN(hasta) || hasta <= desde) throw new Error('Rango de fechas no válido.');
  if (hasta - desde > 62 * 86400000) throw new Error('El rango no puede superar dos meses.');
  return eventos_(desde, hasta, u);
}

function crearReunion_(d, u) {
  const titulo = txt_(d.titulo, 160, true, 'título');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha))) throw new Error('Selecciona una fecha.');
  const inicio = Utilities.parseDate(d.fecha + ' ' + d.horaInicio, APP.ZONA, 'yyyy-MM-dd HH:mm');
  const fin = Utilities.parseDate(d.fecha + ' ' + d.horaFin, APP.ZONA, 'yyyy-MM-dd HH:mm');
  if (!(fin > inicio)) throw new Error('La hora de término debe ser posterior a la de inicio.');
  const invitados = String(d.invitados || '').toLowerCase().split(/[,;\s]+/)
    .filter(function (x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x); });
  if (invitados.indexOf(u.email) < 0) invitados.unshift(u.email);
  if (invitados.length > 50) throw new Error('Máximo 50 invitados.');
  const ev = calendario_().createEvent(titulo, inicio, fin, {
    description: txt_(d.descripcion, 2000) + '\n\nAgendada por ' + u.nombre + ' desde la intranet.',
    location: txt_(d.lugar, 160), guests: invitados.join(','), sendInvites: true
  });
  ev.setTag('creadoPor', u.email);
  log_(u.email, 'agendar reunión', titulo + ' (' + d.fecha + ')');
  return true;
}

function cancelarReunion_(d, u) {
  const ev = calendario_().getEventById(String(d.id || ''));
  if (!ev) throw new Error('La reunión ya no existe.');
  if (!esCreadorReunion_(ev, u.email) && ROLES[u.rol] < ROLES.admin) throw new Error('Solo quien agendó la reunión puede cancelarla.');
  log_(u.email, 'cancelar reunión', ev.getTitle());
  ev.deleteEvent();
  return true;
}

function recordatorios_(d, u) {
  const r = buscarPorId_('Usuarios', u.id, 'Usuario no encontrado.');
  const minutos = prefs_(r).recordatorio;
  if (!minutos) return { minutos: 0, eventos: [] };
  const desde = new Date();
  let eventos = [];
  try {
    eventos = eventos_(desde, new Date(desde.getTime() + 86400000), u)
      .filter(function (e) { return !e.todoElDia && (e.soyInvitado || e.organizo); });
  } catch (e) {}
  return { minutos: minutos, eventos: eventos };
}
